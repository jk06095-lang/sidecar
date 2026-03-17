import React, { useState } from 'react';
import { Save, FileText } from 'lucide-react';
import type { Scenario, SimulationParams, ChartDataPoint, FleetVessel } from '../types';
import DashboardGrid from './DashboardGrid';

interface HomeProps {
  scenarios: Scenario[];
  activeScenario: Scenario;
  activeScenarioId: string;
  simulationParams: SimulationParams;
  dynamicChartData: ChartDataPoint[];
  dynamicFleetData: FleetVessel[];
  onScenarioChange: (id: string) => void;
  onParamsChange: (params: SimulationParams) => void;
  onSaveScenario: (name: string) => void;
  onNavigateTab?: (tab: string) => void;
}

// Home component — renders the COP dashboard with save-scenario modal

export default function Home({
  scenarios,
  activeScenario,
  activeScenarioId,
  simulationParams,
  dynamicChartData,
  dynamicFleetData,
  onScenarioChange,
  onParamsChange,
  onSaveScenario,
  onNavigateTab,
}: HomeProps) {
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');

  const handleSaveScenario = () => {
    if (newScenarioName.trim()) {
      onSaveScenario(newScenarioName.trim());
      setNewScenarioName('');
      setShowSaveModal(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-slate-950 overflow-hidden">
      {/* ── COP Dashboard (fills full space) ── */}
      <div className="flex-1 min-h-0">
        <DashboardGrid
          simulationParams={simulationParams}
          dynamicChartData={dynamicChartData}
          dynamicFleetData={dynamicFleetData}
          onNavigateTab={onNavigateTab}
        />
      </div>

      {/* Save Scenario Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSaveModal(false)} />
          <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl animate-slide-up p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <FileText size={18} className="text-cyan-400" />
              시나리오 저장
            </h3>
            <input
              type="text"
              value={newScenarioName}
              onChange={(e) => setNewScenarioName(e.target.value)}
              placeholder="예: 26년 하반기 호르무즈 전면 봉쇄"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 outline-none transition-all mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSaveScenario()}
            />
            <div className="flex gap-3">
              <button
                onClick={handleSaveScenario}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Save size={14} />
                저장
              </button>
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg border border-slate-600 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
