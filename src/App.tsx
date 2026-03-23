import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import Home from './components/Home';
import SettingsModal from './components/SettingsModal';
import Ontology from './components/Ontology';
import ScenarioBuilder from './components/ScenarioBuilder';
import TopTabBar, { type Notification } from './components/TopTabBar';
import ToastContainer from './components/ToastContainer';
import { useAuthUser } from './components/AuthGate';

// Lazy-load heavy composite components
const ActionCenter = lazy(() => import('./components/ActionCenter'));
const News = lazy(() => import('./components/News'));
const MaritimeAnomalyDetector = lazy(() => import('./components/MaritimeAnomalyDetector'));
import { useOntologyStore } from './store/ontologyStore';
import { useActionStore } from './store/actionStore';
import type { Scenario, SimulationParams, AppSettings } from './types';
import { fetchAllMarketData, mapQuotesToScenarioParams } from './services/maritimeIntegrationService';
import {
  migrateLocalStorageToFirestore,
  loadSettings as firestoreLoadSettings,
  saveSettings as firestoreSaveSettings,
  saveCustomScenarios,
  cleanupScenarioOrphans,
  loadNotificationReadIds,
  saveNotificationReadIds,
} from './services/firestoreService';

export default function App() {
  const authUser = useAuthUser();
  const [activeTab, setActiveTab] = useState('workspace');
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const realtimeOverrideRef = useRef(false);

  // Open tabs management (browser-like)
  const [openTabs, setOpenTabs] = useState<string[]>(['workspace']);

  // Keep-alive: track which tabs have been visited (lazy-mount once, never unmount)
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['workspace']));

  // Notification system
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: 'n1',
      title: '시스템 초기화',
      message: 'SIDECAR AIP Platform이 성공적으로 초기화되었습니다.',
      type: 'success',
      timestamp: new Date(),
      read: false,
    },
    {
      id: 'n2',
      title: '실시간 데이터',
      message: 'Yahoo Finance 실시간 시세 연동 활성화됨. 유가, 환율, 원자재 데이터 수신 중.',
      type: 'info',
      timestamp: new Date(Date.now() - 300000),
      read: false,
    },
  ]);

  // Add notification helper
  const addNotification = useCallback((title: string, message: string, type: Notification['type'] = 'info') => {
    setNotifications(prev => [{
      id: `n_${Date.now()}`,
      title,
      message,
      type,
      timestamp: new Date(),
      read: false,
    }, ...prev]);
  }, []);

  const handleNotificationRead = useCallback((id: string) => {
    setNotifications(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, read: true } : n);
      // Persist read IDs to Firestore
      if (authUser?.uid) {
        const readIds = updated.filter(n => n.read).map(n => n.id);
        saveNotificationReadIds(authUser.uid, readIds);
      }
      return updated;
    });
  }, [authUser?.uid]);

  const handleClearNotifications = useCallback(() => {
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: true }));
      // Persist all as read
      if (authUser?.uid) {
        const readIds = updated.map(n => n.id);
        saveNotificationReadIds(authUser.uid, readIds);
      }
      return updated;
    });
  }, [authUser?.uid]);

  // Tab management (open/close/switch)
  const handleSetActiveTab = useCallback((tab: string) => {
    setActiveTab(tab);
    setOpenTabs(prev => prev.includes(tab) ? prev : [...prev, tab]);
    setVisitedTabs(prev => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, []);

  const handleTabClose = useCallback((tab: string) => {
    if (tab === 'workspace') return; // Can't close workspace
    setOpenTabs(prev => {
      const next = prev.filter(t => t !== tab);
      if (activeTab === tab) {
        const idx = prev.indexOf(tab);
        const newActive = next[Math.min(idx, next.length - 1)] || 'workspace';
        setActiveTab(newActive);
      }
      return next;
    });
  }, [activeTab]);

  // ============================================================
  // ONTOLOGY STORE — single source of truth for all data
  // ============================================================
  const scenarios = useOntologyStore((s) => s.scenarios);
  const activeScenarioId = useOntologyStore((s) => s.activeScenarioId);
  const simulationParams = useOntologyStore((s) => s.simulationParams);
  const dynamicChartData = useOntologyStore((s) => s.dynamicChartData);
  const dynamicFleetData = useOntologyStore((s) => s.dynamicFleetData);

  const storeSetActiveScenario = useOntologyStore((s) => s.setActiveScenario);
  const storeSetSimulationParams = useOntologyStore((s) => s.setSimulationParams);
  const storeAddScenario = useOntologyStore((s) => s.addScenario);
  const storeUpdateScenario = useOntologyStore((s) => s.updateScenario);
  const storeCopyScenario = useOntologyStore((s) => s.copyScenario);
  const storeDeleteScenario = useOntologyStore((s) => s.deleteScenario);
  const storeUpdateRealtimeParams = useOntologyStore((s) => s.updateRealtimeScenarioParams);
  const storeRecalculate = useOntologyStore((s) => s.recalculate);

  // Backward-compat selectors for legacy data formats
  const selectBrokerReports = useOntologyStore((s) => s.selectBrokerReports);
  const selectInsuranceCirculars = useOntologyStore((s) => s.selectInsuranceCirculars);

  const brokerReports = selectBrokerReports();
  const insuranceCirculars = selectInsuranceCirculars();

  // Active scenario object
  const activeScenario = scenarios.find(s => s.id === activeScenarioId) || scenarios[0];

  // App Settings (Theme, Language, API Key)
  const [settings, setSettings] = useState<AppSettings>(() => {
    const defaults: AppSettings = {
      apiKey: '',
      theme: 'dark',
      language: 'ko',
      osintSources: [],
      osintKeywords: [],
      persistenceThresholdMinutes: 30,
      persistenceMinArticles: 3,
      crisisKeywords: [],
      pollingIntervalMinutes: 10,
      newsFeedTopics: [],
    };
    try {
      const saved = localStorage.getItem('sidecar_settings');
      if (saved) return { ...defaults, ...JSON.parse(saved) };
    } catch (e) { console.error('Failed to parse settings', e); }
    return defaults;
  });

  // Briefing generation moved to Reports.tsx

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);

  // ============================================================
  // EFFECT: Firebase migration + DB-first ontology hydration + settings
  // Runs once on first mount.
  // ============================================================
  useEffect(() => {
    migrateLocalStorageToFirestore();

    // Hydrate ontology graph from Firestore (seeds from mockData if DB empty)
    useOntologyStore.getState().hydrateFromDB();

    // Hydrate action center state from Firestore
    useActionStore.getState().hydrateFromDB();

    firestoreLoadSettings().then(remote => {
      if (remote) setSettings(prev => ({ ...prev, ...remote }));
    });

    // Cleanup: tear down Firestore listeners on unmount / HMR
    return () => {
      useOntologyStore.getState().teardownListeners();
    };
  }, []);

  // Load per-user notification read state from Firestore
  useEffect(() => {
    if (!authUser?.uid) return;
    loadNotificationReadIds(authUser.uid).then(readIds => {
      if (readIds.length > 0) {
        const readSet = new Set(readIds);
        setNotifications(prev => prev.map(n => readSet.has(n.id) ? { ...n, read: true } : n));
      }
    });
  }, [authUser?.uid]);

  // ============================================================
  // EFFECT: Listen for legacy ontology_updated events → recalculate
  // ============================================================
  useEffect(() => {
    const handleOntologyUpdate = () => storeRecalculate();
    window.addEventListener('ontology_updated', handleOntologyUpdate);
    return () => window.removeEventListener('ontology_updated', handleOntologyUpdate);
  }, [storeRecalculate]);

  // ============================================================
  // REALTIME EVENT-DRIVEN FETCH: triggered by Intelligence feed events
  // (user scrap, urgent/critical feed detection) — no polling
  // Uses Yahoo Finance (via marketDataService) + free exchange rate API
  // ============================================================
  useEffect(() => {
    const isRealtimeActive = activeScenarioId === 'realtime' && !realtimeOverrideRef.current;
    if (!isRealtimeActive) return;

    const fetchRealtimeData = async () => {
      try {
        // Fetch real market data from Yahoo Finance
        const [fxRes, marketQuotes] = await Promise.all([
          fetch('https://open.er-api.com/v6/latest/USD').then(r => r.json()).catch(() => null),
          fetchAllMarketData().catch(() => []),
        ]);

        const krwRate = fxRes?.rates?.KRW || 1350;

        // Map market quotes to scenario variable params
        const marketParams = mapQuotesToScenarioParams(marketQuotes);

        // Use real Brent price for VLSFO approximation (VLSFO ≈ Brent × 6.5 $/mt conversion)
        const brentPrice = marketParams.brentCrude || 82;
        const vlsfoFromBrent = Math.round(brentPrice * 7.2 + 30); // rough conversion

        // Build sentiment from market volatility
        const hour = new Date().getHours();
        const minuteSeed = new Date().getMinutes();
        const sentimentBase = 25 + Math.floor(Math.random() * 15) + (hour > 18 || hour < 6 ? 10 : 0);

        // Derive supply chain stress from FX volatility proxy
        const fxVolatility = Math.abs(krwRate - 1350) / 13.5;
        const supplyStress = Math.min(90, 15 + fxVolatility * 2 + (minuteSeed % 10));
        const energyCrisis = Math.min(85, 15 + Math.abs(brentPrice - 80) / 2);

        const newParams: SimulationParams = {
          vlsfoPrice: vlsfoFromBrent,
          newsSentimentScore: Math.min(95, sentimentBase),
          awrpRate: +(0.02 + Math.random() * 0.05).toFixed(3),
          interestRate: +(4.0 + Math.random() * 1.5).toFixed(1),
          supplyChainStress: Math.round(supplyStress),
          cyberThreatLevel: Math.round(8 + Math.random() * 15),
          naturalDisasterIndex: Math.round(Math.random() * 12),
          pandemicRisk: Math.round(Math.random() * 8),
          tradeWarIntensity: Math.round(20 + Math.random() * 20),
          energyCrisisLevel: Math.round(energyCrisis),
          // Inject real market data directly
          ...marketParams,
          // Override usdKrw with FX API (more reliable)
          usdKrw: Math.round(krwRate),
        };

        storeSetSimulationParams(newParams);
        storeUpdateRealtimeParams(newParams);
        console.info('[Realtime] ✅ Scenario variables updated via event trigger');
      } catch (err) {
        console.warn('Realtime fetch failed, using local simulation:', err);
        const prev = useOntologyStore.getState().simulationParams;
        storeSetSimulationParams({
          ...prev,
          newsSentimentScore: Math.min(95, Math.max(5, (prev.newsSentimentScore || 30) + Math.round((Math.random() - 0.5) * 8))),
          vlsfoPrice: Math.max(400, Math.min(1200, prev.vlsfoPrice + Math.round((Math.random() - 0.5) * 30))),
        });
      }
    };

    fetchRealtimeData(); // initial fetch on mount only

    // Event-driven: listen for trigger events from Intelligence feed
    // Fired when user scraps news or when urgent/critical feed is detected
    const handleTrigger = () => {
      console.info('[Realtime] 📡 scenario_update_trigger received — refreshing scenario variables');
      fetchRealtimeData();
    };
    window.addEventListener('scenario_update_trigger', handleTrigger);
    return () => window.removeEventListener('scenario_update_trigger', handleTrigger);
  }, [activeScenarioId, storeSetSimulationParams, storeUpdateRealtimeParams]);

  // Persist settings to both localStorage (instant) and Firestore (debounced)
  useEffect(() => {
    firestoreSaveSettings(settings);
    // Theme: toggle light class on root
    if (settings.theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    // Language: set lang attribute on root
    document.documentElement.lang = settings.language === 'en' ? 'en' : 'ko';
  }, [settings]);

  // Sync custom scenarios to Firestore whenever scenarios change
  useEffect(() => {
    saveCustomScenarios(scenarios);
  }, [scenarios]);

  // ============================================================
  // HANDLERS (delegate to Zustand store actions)
  // ============================================================
  const handleScenarioChange = useCallback((id: string) => {
    realtimeOverrideRef.current = false; // Reset override on explicit scenario switch
    storeSetActiveScenario(id);
  }, [storeSetActiveScenario]);

  const handleParamsChange = useCallback((params: SimulationParams) => {
    storeSetSimulationParams(params);
    // If user manually adjusts params while on realtime, mark as overridden
    if (activeScenarioId === 'realtime') {
      realtimeOverrideRef.current = true;
    }
  }, [activeScenarioId, storeSetSimulationParams]);

  const handleSaveScenario = useCallback((name: string) => {
    const newScenario: Scenario = {
      id: `custom-${Date.now()}`,
      name,
      description: `사용자 저장 시나리오: VLSFO $${simulationParams.vlsfoPrice}, 불안지수 ${simulationParams.newsSentimentScore}`,
      params: { ...simulationParams },
      isCustom: true,
    };
    storeAddScenario(newScenario);
  }, [simulationParams, storeAddScenario]);

  const handleUpdateScenario = useCallback((id: string, name: string) => {
    storeUpdateScenario(id, name);
  }, [storeUpdateScenario]);

  const handleCopyScenario = useCallback((id: string) => {
    storeCopyScenario(id);
  }, [storeCopyScenario]);

  const handleDeleteScenario = useCallback((id: string) => {
    storeDeleteScenario(id);
    cleanupScenarioOrphans(id); // Remove associated logicMap from Firestore
  }, [storeDeleteScenario]);

  // handleGenerateBriefing moved to Reports.tsx

  return (
    <div className="flex h-screen min-w-[768px] min-h-[600px] bg-slate-950 text-slate-200 font-sans overflow-hidden light:bg-slate-50 light:text-slate-900 transition-colors duration-300">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleSetActiveTab}
        scenarios={scenarios}
        activeScenarioId={activeScenarioId}
        onScenarioQuickSwitch={handleScenarioChange}
        onOpenSettings={() => setShowSettings(true)}
        isMinimized={isSidebarMinimized}
        onToggleMinimize={() => setIsSidebarMinimized(!isSidebarMinimized)}
        onCopyScenario={handleCopyScenario}
        onDeleteScenario={handleDeleteScenario}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopTabBar
          activeTab={activeTab}
          openTabs={openTabs}
          onTabClick={handleSetActiveTab}
          onTabClose={handleTabClose}
          notifications={notifications}
          onNotificationRead={handleNotificationRead}
          onClearNotifications={handleClearNotifications}
        />
        <main className="flex-1 overflow-hidden relative">
          {/* Keep-alive tab rendering: mount once on first visit, hide with CSS instead of unmounting */}

          {/* ════════ PILLAR 1: WORKSPACE ════════ */}
          <div className="absolute inset-0" style={{ display: activeTab === 'workspace' ? 'block' : 'none' }}>
            <Home
              scenarios={scenarios}
              activeScenario={activeScenario}
              activeScenarioId={activeScenarioId}
              simulationParams={simulationParams}
              dynamicChartData={dynamicChartData}
              dynamicFleetData={dynamicFleetData}
              onScenarioChange={handleScenarioChange}
              onParamsChange={handleParamsChange}
              onSaveScenario={handleSaveScenario}
              onNavigateTab={handleSetActiveTab}
            />
          </div>

          {/* ════════ PILLAR 2: ONTOLOGY ════════ */}
          {visitedTabs.has('ontology') && (
            <div className="absolute inset-0" style={{ display: activeTab === 'ontology' ? 'flex' : 'none' }}>
              <Ontology />
            </div>
          )}

          {/* ════════ PILLAR 3: INTELLIGENCE ════════ */}
          {visitedTabs.has('news') && (
            <div className="absolute inset-0" style={{ display: activeTab === 'news' ? 'block' : 'none' }}>
              <Suspense fallback={
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
                </div>
              }>
                <News />
              </Suspense>
            </div>
          )}

          {/* ════════ MARITIME ANOMALY DETECTOR ════════ */}
          {visitedTabs.has('maritime-anomaly') && (
            <div className="absolute inset-0" style={{ display: activeTab === 'maritime-anomaly' ? 'block' : 'none' }}>
              <Suspense fallback={
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
                </div>
              }>
                <MaritimeAnomalyDetector />
              </Suspense>
            </div>
          )}

          {/* ════════ PILLAR 4: AIP SCENARIO ════════ */}
          {(visitedTabs.has('scenario') || visitedTabs.has('scenario-builder')) && (
            <div className="absolute inset-0" style={{ display: (activeTab === 'scenario' || activeTab === 'scenario-builder') ? 'block' : 'none' }}>
              <ScenarioBuilder
                scenarios={scenarios}
                activeScenarioId={activeScenarioId}
                simulationParams={simulationParams}
                onScenarioChange={handleScenarioChange}
                onParamsChange={handleParamsChange}
                onSaveScenario={handleSaveScenario}
                onUpdateScenario={handleUpdateScenario}
                onCopyScenario={handleCopyScenario}
                onDeleteScenario={handleDeleteScenario}
                settings={settings}
              />
            </div>
          )}

          {/* ════════ PILLAR 5: ACTION CENTER ════════ */}
          {visitedTabs.has('action-center') && (
            <div className="absolute inset-0" style={{ display: activeTab === 'action-center' ? 'block' : 'none' }}>
              <Suspense fallback={
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
                </div>
              }>
                <ActionCenter />
              </Suspense>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSettingsChange={setSettings}
      />

      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  );
}
