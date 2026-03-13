import React, { useState } from 'react';
import {
  AlertTriangle, Ship, Fuel, Activity,
  Save, FileText,
} from 'lucide-react';
import { cn } from '../lib/utils';
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

  const criticalCount = dynamicFleetData.filter(v => v.riskLevel === 'Critical').length;
  const currentSpread = dynamicChartData.length > 0
    ? dynamicChartData[dynamicChartData.length - 1].Spread
    : 0;
  const isCrisis = simulationParams.newsSentimentScore > 70;

  return (
    <div className="flex flex-col w-full h-full bg-slate-950 overflow-hidden">
      {/* ── Top Metrics Ribbon ── */}
      <div className="shrink-0 px-3 py-1.5 border-b border-slate-800/50 bg-slate-950/80">
        <div className="flex items-center gap-3">
          <MetricChip
            icon={<Activity size={12} />}
            label="Spread"
            value={currentSpread.toFixed(1)}
            unit="WS"
            alert={currentSpread > 40}
          />
          <MetricChip
            icon={<Fuel size={12} />}
            label="VLSFO"
            value={`$${simulationParams.vlsfoPrice}`}
            unit="/mt"
            alert={simulationParams.vlsfoPrice > 900}
          />
          <MetricChip
            icon={<Ship size={12} />}
            label="High Risk"
            value={`${criticalCount}`}
            unit={`/${dynamicFleetData.length}`}
            alert={criticalCount > 0}
            pulse={criticalCount > 0}
          />
          <MetricChip
            icon={<AlertTriangle size={12} />}
            label="Sentiment"
            value={`${simulationParams.newsSentimentScore}`}
            unit="/100"
            alert={simulationParams.newsSentimentScore > 80}
            pulse={simulationParams.newsSentimentScore > 80}
          />

          {/* Crisis Banner */}
          {isCrisis && (
            <div className="flex items-center gap-2 ml-2 px-3 py-1 bg-rose-950/40 border border-rose-700/30 rounded-lg animate-pulse-slow">
              <AlertTriangle size={13} className="text-rose-400 shrink-0" />
              <span className="text-[10px] font-semibold text-rose-300">⚠ CRISIS</span>
              <span className="text-[9px] text-rose-400/70">
                불안 {simulationParams.newsSentimentScore}/100 · {criticalCount}척 Critical
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── COP Dashboard (fills remaining space) ── */}
      <div className="flex-1 min-h-0">
        <DashboardGrid
          simulationParams={simulationParams}
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

// ============================================================
// Sub-components
// ============================================================

function MetricChip({ icon, label, value, unit, alert, pulse }: {
  icon: React.ReactNode; label: string; value: string; unit: string; alert?: boolean; pulse?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-[10px]",
      alert
        ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
        : "bg-slate-800/40 border-slate-700/30 text-slate-400",
      pulse && "animate-pulse-slow"
    )}>
      <span className={alert ? 'text-rose-400' : 'text-slate-500'}>{icon}</span>
      <span className="uppercase tracking-wider font-medium">{label}</span>
      <span className={cn("font-mono font-bold text-[11px]", alert ? 'text-rose-300' : 'text-slate-200')}>
        {value}
      </span>
      <span className="text-slate-600">{unit}</span>
    </div>
  );
}
