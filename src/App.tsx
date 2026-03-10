import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Home from './components/Home';
import BriefingModal from './components/BriefingModal';
import SettingsModal from './components/SettingsModal';
import News from './components/News';
import Ontology from './components/Ontology';
import Reports from './components/Reports';
import ApiManager from './components/ApiManager';
import ScenarioBuilder from './components/ScenarioBuilder';
import { BASE_SCENARIOS, DEFAULT_PARAMS, FLEET_DATA, BASE_VULNERABILITY_DATA, BROKER_REPORTS, INSURANCE_CIRCULARS } from './data/mockData';
import { generateBriefingContext, fetchGeminiBriefing, LOADING_MESSAGES } from './services/geminiService';
import type { Scenario, SimulationParams, ChartDataPoint, FleetVessel, AppSettings } from './types';

function calculateDynamicChartData(params: SimulationParams): ChartDataPoint[] {
  const { newsSentimentScore, awrpRate } = params;
  const spreadMultiplier = 1 + (newsSentimentScore / 100) * 3.5 + (awrpRate > 0.1 ? 1.5 : 0);

  return BASE_VULNERABILITY_DATA.map((point) => {
    const baseSpread = (point.WS_High - point.WS_Low) / 2;
    const adjustedHigh = point.Base_WS + baseSpread * spreadMultiplier;
    const adjustedLow = Math.max(point.Base_WS - baseSpread * spreadMultiplier * 0.8, 0);

    // Scale sentiment in data proportional to current slider
    const sentimentRatio = newsSentimentScore / 100;
    const adjustedSentiment = Math.min(
      100,
      point.News_Sentiment_Score * 0.3 + newsSentimentScore * 0.7
    );

    return {
      date: point.date,
      Base_WS: point.Base_WS + (newsSentimentScore > 70 ? (newsSentimentScore - 70) * 0.3 : 0),
      WS_High: Math.round(adjustedHigh * 10) / 10,
      WS_Low: Math.round(adjustedLow * 10) / 10,
      News_Sentiment_Score: Math.round(adjustedSentiment),
      Spread: Math.round((adjustedHigh - adjustedLow) * 10) / 10,
    };
  });
}

function calculateDynamicFleetData(params: SimulationParams, baseFleet: FleetVessel[]): FleetVessel[] {
  const { newsSentimentScore, awrpRate } = params;

  return baseFleet.map((vessel) => {
    const isMiddleEast =
      vessel.location.toLowerCase().includes('hormuz') ||
      vessel.location.toLowerCase().includes('middle east') ||
      vessel.location.toLowerCase().includes('persian gulf') ||
      vessel.location.toLowerCase().includes('fujairah') ||
      vessel.location.toLowerCase().includes('oman');

    let riskLevel = vessel.riskLevel;

    if (isMiddleEast) {
      if (awrpRate > 0.1 || newsSentimentScore > 80) {
        riskLevel = 'Critical';
      } else if (awrpRate > 0.05 || newsSentimentScore > 50) {
        riskLevel = 'High';
      }
    }

    // Non-Middle East vessels get elevated risk at extreme sentiment
    if (!isMiddleEast && newsSentimentScore > 90) {
      if (riskLevel === 'Low') riskLevel = 'Medium';
    }

    return { ...vessel, riskLevel };
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);

  // Core state
  const [scenarios, setScenarios] = useState<Scenario[]>(BASE_SCENARIOS);
  const [activeScenarioId, setActiveScenarioId] = useState<string>('peaceful');
  const [simulationParams, setSimulationParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [dynamicChartData, setDynamicChartData] = useState<ChartDataPoint[]>([]);
  const [dynamicFleetData, setDynamicFleetData] = useState<FleetVessel[]>(FLEET_DATA);

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

  // Active scenario object
  const activeScenario = scenarios.find(s => s.id === activeScenarioId) || scenarios[0];

  // ============================================================
  // EFFECT: Recalculate chart & fleet when params change
  // ============================================================
  const updateDynamicData = useCallback(() => {
    let combinedFleet = [...FLEET_DATA];
    try {
      const stored = localStorage.getItem('sidecar_ontology');
      if (stored) {
        const ontologies = JSON.parse(stored);
        const vesselItems = ontologies.filter((o: any) => o.isActive && o.type === 'factor' && o.subCategory === '자산 (Asset)' && o.vesselData);

        // Add custom vessels to the front
        const customFleet: FleetVessel[] = vesselItems.map((v: any) => ({
          vessel_name: v.title || 'Unknown Asset',
          vessel_type: v.vesselData.vessel_type || '-',
          location: v.vesselData.location || '-',
          riskLevel: v.vesselData.riskLevel || 'Low',
          voyage_info: { departure_port: '-', destination_port: '-', sailed_days: 0, plan_days: 0, last_report_type: 'Ontology', last_report_time: v.lastUpdated, timezone: 'UTC' },
          speed_and_weather_metrics: { avg_speed: 0, speed_cp: 0, speed_diff: 0, avg_speed_good_wx: 0, still_water_avg_speed_good_wx: 0, avg_curf: 0, avg_wxf: 0 },
          consumption_and_rob: { avg_ifo: 0, ifo_cp: 0, ifo_diff: 0, fo_rob: 0, lo_rob: 0, fw_rob: 0, total_consumed: 0 },
          compliance: { cii_rating: '-', cii_trend: '-' }
        }));

        combinedFleet = [...customFleet, ...combinedFleet];
      }
    } catch (e) { console.error("Failed to parse ontology fleet data", e); }

    setDynamicChartData(calculateDynamicChartData(simulationParams));
    setDynamicFleetData(calculateDynamicFleetData(simulationParams, combinedFleet));
  }, [simulationParams]);

  useEffect(() => {
    updateDynamicData();
  }, [updateDynamicData]);

  useEffect(() => {
    const handleOntologyUpdate = () => updateDynamicData();
    window.addEventListener('ontology_updated', handleOntologyUpdate);
    return () => window.removeEventListener('ontology_updated', handleOntologyUpdate);
  }, [updateDynamicData]);

  useEffect(() => {
    localStorage.setItem('sidecar_settings', JSON.stringify(settings));
    if (settings.theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [settings]);

  // ============================================================
  // HANDLERS
  // ============================================================
  const handleScenarioChange = useCallback((id: string) => {
    setActiveScenarioId(id);
    const scenario = scenarios.find(s => s.id === id);
    if (scenario) {
      setSimulationParams({ ...scenario.params });
    }
  }, [scenarios]);

  const handleParamsChange = useCallback((params: SimulationParams) => {
    setSimulationParams(params);
  }, []);

  const handleSaveScenario = useCallback((name: string) => {
    const newScenario: Scenario = {
      id: `custom-${Date.now()}`,
      name,
      description: `사용자 저장 시나리오: VLSFO $${simulationParams.vlsfoPrice}, 불안지수 ${simulationParams.newsSentimentScore}`,
      params: { ...simulationParams },
      isCustom: true,
    };
    setScenarios(prev => [...prev, newScenario]);
    setActiveScenarioId(newScenario.id);
  }, [simulationParams]);

  const handleUpdateScenario = useCallback((id: string, name: string) => {
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  }, []);

  const handleCopyScenario = useCallback((id: string) => {
    setScenarios(prev => {
      const source = prev.find(s => s.id === id);
      if (!source) return prev;
      const newScenario: Scenario = {
        ...source,
        id: `custom-${Date.now()}`,
        name: `${source.name} (복사본)`,
        isCustom: true,
      };
      setActiveScenarioId(newScenario.id);
      return [...prev, newScenario];
    });
  }, []);

  const handleDeleteScenario = useCallback((id: string) => {
    setScenarios(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (activeScenarioId === id) {
        // If the active one is deleted, fallback to the first default scenario
        setTimeout(() => setActiveScenarioId(BASE_SCENARIOS[0].id), 0);
      }
      return filtered;
    });
  }, [activeScenarioId]);

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
      let ontologies = [];
      try {
        const storedGrid = localStorage.getItem('sidecar_ontology');
        if (storedGrid) {
          ontologies = JSON.parse(storedGrid).filter((o: any) => o.isActive);
        }
      } catch (e) { console.error(e); }

      const contextJSON = generateBriefingContext(activeScenario, simulationParams, dynamicFleetData);

      // We will enhance the generated JSON manually here to feed into fetchGeminiBriefing.
      const parsedContext = JSON.parse(contextJSON);
      parsedContext.grounding_ontology = ontologies;

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
            brokerReports={BROKER_REPORTS}
            insuranceCirculars={INSURANCE_CIRCULARS}
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
