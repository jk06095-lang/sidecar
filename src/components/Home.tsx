import React, { useState, useRef, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart,
} from 'recharts';
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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-slate-800/95 backdrop-blur border border-slate-700 rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs text-slate-400 font-medium mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="text-slate-100 font-mono font-medium">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

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
  const [showChart, setShowChart] = useState(false);

  const handleSaveScenario = () => {
    if (newScenarioName.trim()) {
      onSaveScenario(newScenarioName.trim());
      setNewScenarioName('');
      setShowSaveModal(false);
    }
  };

  const criticalCount = dynamicFleetData.filter(v => v.riskLevel === 'Critical').length;
  const highCount = dynamicFleetData.filter(v => v.riskLevel === 'High').length;
  const currentSpread = dynamicChartData.length > 0
    ? dynamicChartData[dynamicChartData.length - 1].Spread
    : 0;
  const isCrisis = simulationParams.newsSentimentScore > 70;

  return (
    <div className="flex flex-col w-full h-full bg-slate-950 overflow-hidden">
      {/* ── Top Metrics Ribbon ── */}
      <div className="shrink-0 px-3 py-2 border-b border-slate-800/50 bg-slate-950/80">
        <div className="flex items-center gap-3">
          {/* Compact metric chips */}
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
            value={`${criticalCount + highCount}`}
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

          {/* Crisis Banner (inline when active) */}
          {isCrisis && (
            <div className="flex items-center gap-2 ml-2 px-3 py-1 bg-rose-950/40 border border-rose-700/30 rounded-lg animate-pulse-slow">
              <AlertTriangle size={13} className="text-rose-400 shrink-0" />
              <span className="text-[10px] font-semibold text-rose-300">⚠ CRISIS ALERT</span>
              <span className="text-[9px] text-rose-400/70">
                불안 {simulationParams.newsSentimentScore}/100 · 스프레드 {currentSpread.toFixed(1)} WS · {criticalCount}척 Critical
              </span>
            </div>
          )}

          {/* BEVI Chart toggle (compact) */}
          <button
            onClick={() => setShowChart(!showChart)}
            className={cn(
              "ml-auto flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all border",
              showChart
                ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                : 'text-slate-500 hover:text-slate-300 border-slate-700/30'
            )}
          >
            <Activity size={11} />
            {showChart ? 'Hide Chart' : 'BEVI Chart'}
          </button>
        </div>
      </div>

      {/* ── Collapsible BEVI Chart ── */}
      {showChart && (
        <div className="shrink-0 border-b border-slate-800/50 bg-slate-900/30">
          <div className="flex items-center justify-between px-4 pt-2 pb-1">
            <div className="flex items-center gap-2">
              <Activity size={13} className="text-cyan-400" />
              <h3 className="text-[11px] font-semibold text-slate-300">Business Environment Volatility Index</h3>
            </div>
            <div className="flex items-center gap-3 text-[9px]">
              <span className="flex items-center gap-1 text-cyan-400">
                <div className="w-2 h-0.5 bg-cyan-400 rounded" /> Base WS
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <div className="w-2 h-2 bg-rose-500/20 border border-rose-500/50 rounded-sm" /> Spread
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <div className="w-2 h-0.5 bg-amber-400 rounded" /> Risk
              </span>
            </div>
          </div>
          <div className="px-2 pb-2" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dynamicChartData} margin={{ top: 5, right: 15, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="spreadGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isCrisis ? '#f43f5e' : '#06b6d4'} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={isCrisis ? '#f43f5e' : '#06b6d4'} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'JetBrains Mono' }} />
                <YAxis yAxisId="ws" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'JetBrains Mono' }} domain={['auto', 'auto']} />
                <YAxis yAxisId="sentiment" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'JetBrains Mono' }} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Area yAxisId="ws" type="monotone" dataKey="WS_High" stroke={isCrisis ? '#f43f5e' : '#06b6d4'} strokeWidth={0} fill="url(#spreadGradient)" fillOpacity={1} animationDuration={600} name="WS 고점" />
                <Area yAxisId="ws" type="monotone" dataKey="WS_Low" stroke="transparent" fill="#020617" fillOpacity={1} animationDuration={600} name="WS 저점" />
                <Line yAxisId="ws" type="monotone" dataKey="Base_WS" stroke="#06b6d4" strokeWidth={1.5} dot={false} animationDuration={600} name="Base WS" />
                <Area yAxisId="sentiment" type="monotone" dataKey="News_Sentiment_Score" stroke="#f59e0b" strokeWidth={1} fill="url(#sentimentGradient)" fillOpacity={1} animationDuration={600} name="뉴스 불안 지수" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

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
