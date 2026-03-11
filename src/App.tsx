import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Home from './components/Home';
import SettingsModal from './components/SettingsModal';
import News from './components/News';
import Ontology from './components/Ontology';
import Reports from './components/Reports';
import ApiManager from './components/ApiManager';
import ScenarioBuilder from './components/ScenarioBuilder';
import DataAnalysis from './components/DataAnalysis';
import { useOntologyStore } from './store/ontologyStore';
import type { Scenario, SimulationParams, AppSettings } from './types';
import { fetchAllMarketData, mapQuotesToScenarioParams } from './services/marketDataService';
import {
  migrateLocalStorageToFirestore,
  loadSettings as firestoreLoadSettings,
  saveSettings as firestoreSaveSettings,
  saveCustomScenarios,
  cleanupScenarioOrphans,
} from './services/firestoreService';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const realtimeOverrideRef = useRef(false);

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
    try {
      const saved = localStorage.getItem('sidecar_settings');
      if (saved) return JSON.parse(saved);
    } catch (e) { console.error('Failed to parse settings', e); }
    return {
      apiKey: localStorage.getItem('gemini_api_key') || '',
      theme: 'dark',
      language: 'ko',
      osintSources: [],
      osintKeywords: [],
    };
  });

  // Briefing generation moved to Reports.tsx

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);

  // ============================================================
  // EFFECT: Firebase migration + Firestore settings hydration
  // Runs once on first mount. Migrates localStorage → Firestore.
  // ============================================================
  useEffect(() => {
    migrateLocalStorageToFirestore();
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

    fetchRealtimeData(); // initial fetch
    const interval = setInterval(fetchRealtimeData, 30000); // 30s
    return () => clearInterval(interval);
  }, [activeScenarioId, storeSetSimulationParams, storeUpdateRealtimeParams]);

  // Persist settings to both localStorage (instant) and Firestore (debounced)
  useEffect(() => {
    firestoreSaveSettings(settings);
    if (settings.theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
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
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden light:bg-slate-50 light:text-slate-900 transition-colors duration-300">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        scenarios={scenarios}
        activeScenarioId={activeScenarioId}
        onScenarioQuickSwitch={handleScenarioChange}
        onOpenSettings={() => setShowSettings(true)}
        isMinimized={isSidebarMinimized}
        onToggleMinimize={() => setIsSidebarMinimized(!isSidebarMinimized)}
      />
      <main className="flex-1 overflow-hidden">
        {activeTab === 'home' && (
          <Home
            scenarios={scenarios}
            activeScenario={activeScenario}
            activeScenarioId={activeScenarioId}
            simulationParams={simulationParams}
            dynamicChartData={dynamicChartData}
            dynamicFleetData={dynamicFleetData}
            brokerReports={brokerReports}
            insuranceCirculars={insuranceCirculars}
            onScenarioChange={handleScenarioChange}
            onParamsChange={handleParamsChange}
            onSaveScenario={handleSaveScenario}
          />
        )}
        {activeTab === 'reports' && <Reports />}
        {activeTab === 'news' && <News />}
        {activeTab === 'ontology' && <Ontology />}
        {activeTab === 'api-manager' && <ApiManager settings={settings} onSettingsChange={setSettings} />}
        {activeTab === 'data-analysis' && (
          <DataAnalysis
            simulationParams={simulationParams}
            dynamicChartData={dynamicChartData}
            dynamicFleetData={dynamicFleetData}
          />
        )}
        {activeTab === 'scenario-builder' && (
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
        {activeTab !== 'home' && activeTab !== 'reports' && activeTab !== 'news' && activeTab !== 'ontology' && activeTab !== 'api-manager' && activeTab !== 'scenario-builder' && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h1 className="text-xl font-semibold text-slate-400 capitalize">{activeTab.replace('-', ' ')}</h1>
              <p className="mt-2 text-sm text-slate-600">이 섹션은 개발 예정입니다.</p>
            </div>
          </div>
        )}
      </main>

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
