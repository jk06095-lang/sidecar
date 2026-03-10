import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Home from './components/Home';
import BriefingModal from './components/BriefingModal';
import SettingsModal from './components/SettingsModal';
import News from './components/News';
import Ontology from './components/Ontology';
import Reports from './components/Reports';
import ApiManager from './components/ApiManager';
import ScenarioBuilder from './components/ScenarioBuilder';
import DataAnalysis from './components/DataAnalysis';
import { useOntologyStore } from './store/ontologyStore';
import { generateBriefingContext, fetchGeminiBriefing, LOADING_MESSAGES } from './services/geminiService';
import type { Scenario, SimulationParams, AppSettings } from './types';

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
      language: 'ko'
    };
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [briefingContent, setBriefingContent] = useState('');
  const [showBriefingModal, setShowBriefingModal] = useState(false);

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);

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
  // ============================================================
  useEffect(() => {
    const isRealtimeActive = activeScenarioId === 'realtime' && !realtimeOverrideRef.current;
    if (!isRealtimeActive) return;

    const fetchRealtimeData = async () => {
      try {
        // Use real free API for exchange rates
        const fxRes = await fetch('https://open.er-api.com/v6/latest/USD').then(r => r.json()).catch(() => null);
        const krwRate = fxRes?.rates?.KRW || 1350;
        const eurRate = fxRes?.rates?.EUR || 0.92;

        // Simulate realistic oil price fluctuation based on time-of-day and minor randomness
        const hour = new Date().getHours();
        const minuteSeed = new Date().getMinutes();
        const oilBase = 580 + Math.sin(hour * 0.5) * 40 + (minuteSeed % 7) * 5;
        const sentimentBase = 25 + Math.floor(Math.random() * 20) + (hour > 18 || hour < 6 ? 15 : 0);

        // Derive supply chain stress from FX volatility proxy
        const fxVolatility = Math.abs(krwRate - 1350) / 13.5; // % deviation from baseline
        const supplyStress = Math.min(90, 15 + fxVolatility * 2 + (minuteSeed % 10));
        const energyCrisis = Math.min(85, 15 + Math.abs(oilBase - 600) / 5);

        const newParams: SimulationParams = {
          vlsfoPrice: Math.round(oilBase),
          newsSentimentScore: Math.min(95, sentimentBase),
          awrpRate: +(0.02 + Math.random() * 0.05).toFixed(3),
          interestRate: +(4.0 + Math.random() * 1.5).toFixed(1),
          supplyChainStress: Math.round(supplyStress),
          cyberThreatLevel: Math.round(8 + Math.random() * 15),
          naturalDisasterIndex: Math.round(Math.random() * 12),
          pandemicRisk: Math.round(Math.random() * 8),
          tradeWarIntensity: Math.round(20 + Math.random() * 20),
          energyCrisisLevel: Math.round(energyCrisis),
        };

        storeSetSimulationParams(newParams);
        storeUpdateRealtimeParams(newParams);
      } catch (err) {
        console.warn('Realtime fetch failed, using local simulation:', err);
        // Fallback: minor random perturbation
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

  useEffect(() => {
    localStorage.setItem('sidecar_settings', JSON.stringify(settings));
    if (settings.theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [settings]);

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
  }, [storeDeleteScenario]);

  const handleGenerateBriefing = useCallback(async () => {
    if (!settings.apiKey || isGenerating) return;

    setIsGenerating(true);
    setBriefingContent('');

    // Cycle through loading messages
    let msgIndex = 0;
    const msgInterval = setInterval(() => {
      setLoadingMessage(LOADING_MESSAGES[msgIndex % LOADING_MESSAGES.length]);
      msgIndex++;
    }, 2000);

    setLoadingMessage(LOADING_MESSAGES[0]);

    try {
      // Get active ontology items from local storage
      let ontologies: any[] = [];
      try {
        const storedGrid = localStorage.getItem('sidecar_ontology');
        if (storedGrid) {
          ontologies = JSON.parse(storedGrid).filter((o: any) => o.isActive);
        }
      } catch (e) { console.error(e); }

      const contextJSON = generateBriefingContext(activeScenario, simulationParams, dynamicFleetData);

      // Enhance with ontology graph data
      const parsedContext = JSON.parse(contextJSON);
      parsedContext.grounding_ontology = ontologies;

      // Include ontology graph summary for AI context
      const storeState = useOntologyStore.getState();
      parsedContext.ontology_graph = {
        totalObjects: storeState.objects.length,
        totalLinks: storeState.links.length,
        objectsByType: storeState.objects.reduce((acc: Record<string, number>, o) => {
          acc[o.type] = (acc[o.type] || 0) + 1;
          return acc;
        }, {}),
      };

      const enhancedContextJSON = JSON.stringify(parsedContext, null, 2);

      const result = await fetchGeminiBriefing(settings.apiKey, enhancedContextJSON);
      setBriefingContent(result);

      // Auto-save generated report to local storage
      try {
        const storedReports = localStorage.getItem('sidecar_reports');
        let reports = storedReports ? JSON.parse(storedReports) : [];
        const newReport = {
          id: Date.now().toString(),
          title: `${activeScenario.name} 시뮬레이션 결과 보고서`,
          date: new Date().toLocaleDateString('ko-KR'),
          content: result
        };
        localStorage.setItem('sidecar_reports', JSON.stringify([newReport, ...reports]));
        // dispatch an event so if Reports tab is already open it can update (though simple state refresh on mount will mostly do)
        window.dispatchEvent(new Event('storage'));
      } catch (e) { console.error("Could not save report automatically", e); }

      setShowBriefingModal(true);
    } catch (err) {
      console.error('Gemini API Error:', err);
      // Create error report with empty content and show modal
      setBriefingContent(`---\nmarp: true\ntheme: default\n---\n\n# ⚠️ API 오류 발생\n\n에러: ${err instanceof Error ? err.message : 'Unknown error'}\n\nGemini API 키를 확인하거나 다시 시도해주세요.`);
      setShowBriefingModal(true);
    } finally {
      clearInterval(msgInterval);
      setIsGenerating(false);
      setLoadingMessage('');
    }
  }, [settings.apiKey, isGenerating, activeScenario, simulationParams, dynamicFleetData]);

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
            onGenerateBriefing={handleGenerateBriefing}
            isGenerating={isGenerating}
            loadingMessage={loadingMessage}
            hasApiKey={!!settings.apiKey}
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
      <BriefingModal
        isOpen={showBriefingModal}
        onClose={() => setShowBriefingModal(false)}
        marpContent={briefingContent}
      />
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSettingsChange={setSettings}
      />
    </div>
  );
}
