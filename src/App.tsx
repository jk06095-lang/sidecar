import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import Home from './components/Home';
import SettingsModal from './components/SettingsModal';
import Ontology from './components/Ontology';
import ScenarioBuilder from './components/ScenarioBuilder';
import TopTabBar, { type Notification } from './components/TopTabBar';

// Lazy-load Action Center (heavy composite component)
const ActionCenter = lazy(() => import('./components/ActionCenter'));
import { useOntologyStore } from './store/ontologyStore';
import type { Scenario, SimulationParams, AppSettings } from './types';
import { fetchAllMarketData, mapQuotesToScenarioParams } from './services/maritimeIntegrationService';
import {
  migrateLocalStorageToFirestore,
  loadSettings as firestoreLoadSettings,
  saveSettings as firestoreSaveSettings,
  saveCustomScenarios,
  cleanupScenarioOrphans,
} from './services/firestoreService';

export default function App() {
  const [activeTab, setActiveTab] = useState('workspace');
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const realtimeOverrideRef = useRef(false);

  // Open tabs management (browser-like)
  const [openTabs, setOpenTabs] = useState<string[]>(['workspace']);

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
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const handleClearNotifications = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  // Tab management (open/close/switch)
  const handleSetActiveTab = useCallback((tab: string) => {
    setActiveTab(tab);
    setOpenTabs(prev => prev.includes(tab) ? prev : [...prev, tab]);
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

    firestoreLoadSettings().then(remote => {
      if (remote) setSettings(prev => ({ ...prev, ...remote }));
    });
  }, []);

  // ============================================================
  // EFFECT: Listen for legacy ontology_updated events → recalculate
  // ============================================================
  useEffect(() => {
    const handleOntologyUpdate = () => storeRecalculate();
    window.addEventListener('ontology_updated', handleOntologyUpdate);
    return () => window.removeEventListener('ontology_updated', handleOntologyUpdate);
  }, [storeRecalculate]);

  // ============================================================
  // REALTIME AUTO-FETCH: 30-second interval when realtime scenario is active
  // Uses Yahoo Finance (via marketDataService) + free exchange rate API
  // ============================================================
  useEffect(() => {
    const isRealtimeActive = activeScenarioId === 'realtime' && !realtimeOverrideRef.current;
    if (!isRealtimeActive) return;

    const fetchRealtimeData = async () => {
      try {
        // Fetch real market data from Yahoo Finance + FX API
        const [fxRes, marketQuotes] = await Promise.all([
          fetch('https://open.er-api.com/v6/latest/USD').then(r => r.json()).catch(() => null),
          fetchAllMarketData().catch(() => []),
        ]);

        const krwRate = fxRes?.rates?.KRW || 1350;

        // Map market quotes to scenario variable params (brentCrude, bdi, etc.)
        const marketParams = mapQuotesToScenarioParams(marketQuotes);

        // Derive VLSFO from real Brent price (VLSFO ≈ Brent × 7.2 + $30/mt)
        const brentPrice = marketParams.brentCrude || 82;
        const vlsfoFromBrent = Math.round(brentPrice * 7.2 + 30);

        // Derive sentiment from OSINT news pipeline (newsRiskBoost from store)
        const newsRiskBoost = useOntologyStore.getState().newsRiskBoost || 0;
        const sentimentBase = Math.min(95, 20 + newsRiskBoost);

        // Derive supply chain stress from FX volatility (KRW deviation from 1350 baseline)
        const fxVolatility = Math.abs(krwRate - 1350) / 13.5;
        const supplyStress = Math.min(90, 15 + fxVolatility * 2);

        // Derive energy crisis from Brent deviation from $80 baseline
        const energyCrisis = Math.min(85, 15 + Math.abs(brentPrice - 80) / 2);

        // Derive AWRP from Brent price deviation (higher oil = higher war risk)
        const awrpDerived = Math.min(0.30, +(0.02 + Math.max(0, (brentPrice - 80) / 1000)).toFixed(3));

        // Derive trade war intensity from news sentiment + FX stress
        const tradeWarDerived = Math.min(80, Math.round(sentimentBase * 0.4 + fxVolatility * 3));

        const newParams: SimulationParams = {
          vlsfoPrice: vlsfoFromBrent,
          newsSentimentScore: sentimentBase,
          awrpRate: awrpDerived,
          interestRate: 4.5, // stable baseline — no random noise
          supplyChainStress: Math.round(supplyStress),
          cyberThreatLevel: 0, // no real data source — report 0 instead of fake
          naturalDisasterIndex: 0, // no real data source
          pandemicRisk: 0, // no real data source
          tradeWarIntensity: tradeWarDerived,
          energyCrisisLevel: Math.round(energyCrisis),
          // Inject real market data directly (brentCrude, bdi, etc.)
          ...marketParams,
          // Override usdKrw with FX API (more reliable)
          usdKrw: Math.round(krwRate),
        };

        storeSetSimulationParams(newParams);
        storeUpdateRealtimeParams(newParams);
      } catch (err) {
        console.warn('Realtime fetch failed, retaining previous params:', err);
        // No random fallback — just keep previous params as-is
      }
    };

    fetchRealtimeData(); // initial fetch
    const interval = setInterval(fetchRealtimeData, 600_000); // 10-minute batch cycle
    return () => clearInterval(interval);
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
        <main className="flex-1 overflow-hidden">
          {/* ════════ PILLAR 1: WORKSPACE ════════ */}
          {activeTab === 'workspace' && (
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
          )}

          {/* ════════ PILLAR 2: ONTOLOGY ════════ */}
          {activeTab === 'ontology' && <Ontology />}

          {/* ════════ PILLAR 3: AIP SCENARIO ════════ */}
          {(activeTab === 'scenario' || activeTab === 'scenario-builder') && (
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
          )}

          {/* ════════ PILLAR 4: ACTION CENTER ════════ */}
          {activeTab === 'action-center' && (
            <Suspense fallback={
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
              </div>
            }>
              <ActionCenter />
            </Suspense>
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
    </div>
  );
}
