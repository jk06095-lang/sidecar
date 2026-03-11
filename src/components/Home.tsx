import React, { useState, useRef, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Bar,
} from 'recharts';
import {
  AlertTriangle, Ship, Fuel, TrendingUp, Save, Sparkles, ChevronDown,
  Shield, Anchor, Activity, Loader2, FileText, MapPin, Gauge,
  Plus, X, Eye, EyeOff, LayoutGrid,
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { Scenario, SimulationParams, ChartDataPoint, FleetVessel, BrokerReport, InsuranceCircular } from '../types';
import HormuzWeatherWidget from './widgets/HormuzWeatherWidget';
import GlobalNewsWidget from './widgets/GlobalNewsWidget';
import FleetStatusWidget from './widgets/FleetStatusWidget';
import CurrencyWidget from './widgets/CurrencyWidget';
import OilPriceWidget from './widgets/OilPriceWidget';
import GeopoliticalRiskWidget from './widgets/GeopoliticalRiskWidget';
import PortCongestionWidget from './widgets/PortCongestionWidget';

interface HomeProps {
  scenarios: Scenario[];
  activeScenario: Scenario;
  activeScenarioId: string;
  simulationParams: SimulationParams;
  dynamicChartData: ChartDataPoint[];
  dynamicFleetData: FleetVessel[];
  brokerReports: BrokerReport[];
  insuranceCirculars: InsuranceCircular[];
  onScenarioChange: (id: string) => void;
  onParamsChange: (params: SimulationParams) => void;
  onSaveScenario: (name: string) => void;
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
  brokerReports,
  insuranceCirculars,
  onScenarioChange,
  onParamsChange,
  onSaveScenario,
}: HomeProps) {
  const [showScenarioDropdown, setShowScenarioDropdown] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Widget visibility — persisted to localStorage
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sidecar_widget_layout');
      return saved ? JSON.parse(saved) : {
        fleet: true,
        hormuzWeather: true,
        globalNews: true,
        currency: true,
        oilPrice: true,
        geopoliticalRisk: true,
        portCongestion: true,
      };
    } catch { return { fleet: true, hormuzWeather: true, globalNews: true, currency: true, oilPrice: true, geopoliticalRisk: true, portCongestion: true }; }
  });

  useEffect(() => {
    localStorage.setItem('sidecar_widget_layout', JSON.stringify(widgetVisibility));
  }, [widgetVisibility]);

  const toggleWidget = (id: string) => {
    setWidgetVisibility(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const WIDGET_CATALOG = [
    { id: 'fleet', name: 'Fleet Status', icon: '🚢', category: 'Core', desc: '선대 현황 및 리스크 상태' },
    { id: 'hormuzWeather', name: 'Hormuz Telemetry', icon: '🌊', category: 'Environment', desc: 'Open-Meteo Marine API 실시간 해양 기상' },
    { id: 'globalNews', name: 'Global News Intel', icon: '📡', category: 'Intelligence', desc: '글로벌 경제 뉴스 피드' },
    { id: 'currency', name: 'FX Rates', icon: '💱', category: 'Market', desc: 'Frankfurter API 실시간 환율' },
    { id: 'oilPrice', name: 'Bunker Price', icon: '⛽', category: 'Market', desc: 'VLSFO/Brent 유가 시뮬레이션 추이' },
    { id: 'geopoliticalRisk', name: 'Geopolitical Risk', icon: '🛡️', category: 'Analytics', desc: '지정학적 리스크 매트릭스 레이더 차트' },
    { id: 'portCongestion', name: 'Port Congestion', icon: '⚓', category: 'Operations', desc: '주요 항만 혼잡도 시뮬레이션' },
  ];

  const handleSliderChange = (key: keyof SimulationParams, value: number) => {
    onParamsChange({ ...simulationParams, [key]: value });
  };

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
    <div className="flex h-full bg-slate-950">
      <div className="flex h-full bg-slate-950">
        {/* LEFT PANEL: Controls (Removed, shifted to Scenario Builder sidebar element) */}
        <div className="hidden"></div>

        {/* MAIN AREA */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-5 space-y-4">
            {/* Top Metrics Bar */}
            <div className="grid grid-cols-4 gap-3">
              <MetricCard
                label="운임 변동성(Spread)"
                value={currentSpread.toFixed(1)}
                unit="WS pts"
                color={currentSpread > 40 ? 'rose' : currentSpread > 20 ? 'amber' : 'cyan'}
                icon={<Activity size={14} />}
              />
              <MetricCard
                label="VLSFO 유가"
                value={`$${simulationParams.vlsfoPrice}`}
                unit="/mt"
                color={simulationParams.vlsfoPrice > 900 ? 'rose' : 'cyan'}
                icon={<Fuel size={14} />}
              />
              <MetricCard
                label="고위험 선박"
                value={`${criticalCount + highCount}`}
                unit={`/ ${dynamicFleetData.length}`}
                color={criticalCount > 0 ? 'rose' : 'cyan'}
                icon={<Ship size={14} />}
                pulse={criticalCount > 0}
              />
              <MetricCard
                label="불안 지수"
                value={`${simulationParams.newsSentimentScore}`}
                unit="/100"
                color={simulationParams.newsSentimentScore > 80 ? 'rose' : simulationParams.newsSentimentScore > 50 ? 'amber' : 'emerald'}
                icon={<AlertTriangle size={14} />}
                pulse={simulationParams.newsSentimentScore > 80}
              />
            </div>

            {/* Crisis Banner */}
            {isCrisis && (
              <div className="bg-rose-950/30 border border-rose-700/30 rounded-xl px-4 py-3 flex items-center gap-3 animate-pulse-slow">
                <AlertTriangle size={18} className="text-rose-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-rose-300">⚠️ CRISIS ALERT: 시장 불확실성 극대화 구간</p>
                  <p className="text-xs text-rose-400/70 mt-0.5">
                    뉴스 불안 지수 {simulationParams.newsSentimentScore}/100 · 운임 스프레드 {currentSpread.toFixed(1)} WS · {criticalCount}척 Critical 상태
                  </p>
                </div>
              </div>
            )}

            {/* Chart: Market Vulnerability Index */}
            <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl">
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-cyan-400" />
                  <h3 className="text-sm font-semibold text-slate-200">Business Environment Volatility Index — 경영환경 변동성 지수</h3>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1 text-cyan-400">
                    <div className="w-2.5 h-0.5 bg-cyan-400 rounded" /> Base Index
                  </span>
                  <span className="flex items-center gap-1 text-rose-400">
                    <div className="w-2.5 h-2.5 bg-rose-500/20 border border-rose-500/50 rounded-sm" /> Spread 범위
                  </span>
                  <span className="flex items-center gap-1 text-amber-400">
                    <div className="w-2.5 h-0.5 bg-amber-400 rounded" /> 복합 리스크
                  </span>
                </div>
              </div>
              <div className="px-2 pb-3" style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dynamicChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    />
                    <YAxis
                      yAxisId="ws"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      domain={['auto', 'auto']}
                    />
                    <YAxis
                      yAxisId="sentiment"
                      orientation="right"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      domain={[0, 100]}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      yAxisId="ws"
                      type="monotone"
                      dataKey="WS_High"
                      stroke={isCrisis ? '#f43f5e' : '#06b6d4'}
                      strokeWidth={0}
                      fill="url(#spreadGradient)"
                      fillOpacity={1}
                      animationDuration={800}
                      animationEasing="ease-in-out"
                      name="WS 고점"
                    />
                    <Area
                      yAxisId="ws"
                      type="monotone"
                      dataKey="WS_Low"
                      stroke="transparent"
                      fill="#020617"
                      fillOpacity={1}
                      animationDuration={800}
                      animationEasing="ease-in-out"
                      name="WS 저점"
                    />
                    <Line
                      yAxisId="ws"
                      type="monotone"
                      dataKey="Base_WS"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      dot={false}
                      animationDuration={800}
                      name="Base WS (운임)"
                    />
                    <Area
                      yAxisId="sentiment"
                      type="monotone"
                      dataKey="News_Sentiment_Score"
                      stroke="#f59e0b"
                      strokeWidth={1}
                      fill="url(#sentimentGradient)"
                      fillOpacity={1}
                      animationDuration={800}
                      name="뉴스 불안 지수"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Widget Section Header + Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <LayoutGrid size={14} className="text-cyan-400" />
                <h3 className="text-sm font-semibold text-slate-200">Platform Widgets</h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  {Object.values(widgetVisibility).filter(Boolean).length}/{WIDGET_CATALOG.length} active
                </span>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={() => setShowWidgetPicker(!showWidgetPicker)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border shrink-0',
                    showWidgetPicker
                      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                      : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-700/50 hover:text-slate-200'
                  )}
                >
                  <Plus size={14} />
                  위젯 관리
                </button>
              </div>
            </div>

            {/* Widget Picker Panel */}
            {showWidgetPicker && (
              <div className="bg-slate-900/70 border border-slate-700/50 rounded-xl p-4 animate-fade-in">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">위젯 카탈로그 — 클릭으로 표시/숨기기</h4>
                  <button onClick={() => setShowWidgetPicker(false)} className="text-slate-500 hover:text-slate-300">
                    <X size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {WIDGET_CATALOG.map(w => (
                    <button
                      key={w.id}
                      onClick={() => toggleWidget(w.id)}
                      className={cn(
                        'flex items-center gap-2 p-3 rounded-lg border text-left transition-all',
                        widgetVisibility[w.id]
                          ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                          : 'bg-slate-800/30 border-slate-700/30 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                      )}
                    >
                      <span className="text-lg">{w.icon}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{w.name}</div>
                        <div className="text-[9px] text-slate-500 truncate">{w.desc}</div>
                      </div>
                      {widgetVisibility[w.id] ? <Eye size={12} className="ml-auto shrink-0 text-cyan-400" /> : <EyeOff size={12} className="ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Grid: Platform Widgets */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {/* Live Environment Widgets */}
              <div className="xl:col-span-2 flex flex-col gap-4">
                {widgetVisibility.fleet && (
                  <div className="min-h-[200px]">
                    <FleetStatusWidget fleetData={dynamicFleetData} />
                  </div>
                )}
                {widgetVisibility.hormuzWeather && (
                  <div className="h-[240px]">
                    <HormuzWeatherWidget />
                  </div>
                )}
                {widgetVisibility.globalNews && (
                  <div className="h-[320px]">
                    <GlobalNewsWidget />
                  </div>
                )}
                {widgetVisibility.geopoliticalRisk && (
                  <div className="h-[340px]">
                    <GeopoliticalRiskWidget simulationParams={simulationParams} />
                  </div>
                )}
                {widgetVisibility.portCongestion && (
                  <div className="h-[260px]">
                    <PortCongestionWidget simulationParams={simulationParams} />
                  </div>
                )}
              </div>

              {/* Right Column */}
              <div className="flex flex-col gap-4">
                {/* Broker Reports (always visible) */}
                <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl">
                  <div className="flex items-center gap-2 px-5 pt-4 pb-3">
                    <TrendingUp size={14} className="text-cyan-400" />
                    <h3 className="text-sm font-semibold text-slate-200">Asset Valuation</h3>
                  </div>
                  <div className="px-5 pb-4 space-y-3">
                    {brokerReports.map((r, i) => (
                      <div key={i} className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] text-slate-500">{r.source} · {r.date}</span>
                          <span className={cn(
                            'text-xs font-mono font-semibold',
                            r.wow_change_pct.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'
                          )}>
                            {r.wow_change_pct}%
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium">{r.asset_class}</p>
                        <p className="text-lg text-cyan-400 font-mono font-bold mt-0.5">
                          ${r.current_price_mil_usd}M
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1">{r.market_sentiment}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {widgetVisibility.currency && (
                  <div className="h-[320px]">
                    <CurrencyWidget />
                  </div>
                )}

                {widgetVisibility.oilPrice && (
                  <div className="h-[280px]">
                    <OilPriceWidget simulationParams={simulationParams} />
                  </div>
                )}
              </div>
            </div>

            {/* User Custom Widgets from Data Analysis */}
            {(() => {
              try {
                const customWidgets = JSON.parse(localStorage.getItem('sidecar_custom_widgets') || '[]');
                if (customWidgets.length === 0) return null;
                return (
                  <div className="mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles size={14} className="text-amber-400" />
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">사용자 정의 위젯 ({customWidgets.length})</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {customWidgets.map((w: any) => (
                        <div key={w.id} className="bg-slate-900/50 border border-amber-900/30 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-slate-200">{w.title}</span>
                            <button
                              onClick={() => {
                                const updated = customWidgets.filter((cw: any) => cw.id !== w.id);
                                localStorage.setItem('sidecar_custom_widgets', JSON.stringify(updated));
                                window.dispatchEvent(new Event('storage'));
                              }}
                              className="p-1 text-slate-600 hover:text-rose-400 transition-colors"
                            ><X size={12} /></button>
                          </div>
                          <div className="text-2xl font-black text-amber-400">
                            {w.type === 'kpi' ? (
                              w.dataSource === 'compositeVolatility'
                                ? `${(simulationParams.newsSentimentScore * 0.2 + ((simulationParams.supplyChainStress as number) || 10) * 0.15 + ((simulationParams.energyCrisisLevel as number) || 10) * 0.15).toFixed(1)}`
                                : w.dataSource === 'avgSpread' && dynamicChartData.length > 0
                                  ? `${(dynamicChartData.reduce((s, d) => s + d.Spread, 0) / dynamicChartData.length).toFixed(1)} WS`
                                  : `${dynamicFleetData.length} 척`
                            ) : w.type === 'line' ? (
                              <span className="text-sm text-slate-400">시계열: {w.dataSource}</span>
                            ) : w.type === 'bar' ? (
                              <span className="text-sm text-slate-400">분포: {w.dataSource}</span>
                            ) : (
                              <span className="text-sm text-slate-400">Table: {w.dataSource}</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-600 mt-1">데이터 분석에서 생성됨</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}


          </div>
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
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function MetricCard({ label, value, unit, color, icon, pulse }: {
  label: string; value: string; unit: string; color: string; icon: React.ReactNode; pulse?: boolean;
}) {
  const colors: Record<string, string> = {
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  };

  return (
    <div className={cn(
      'rounded-xl border p-3.5 transition-all duration-300',
      colors[color] || colors.cyan,
      pulse && 'animate-pulse-slow'
    )}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={cn(
          color === 'rose' ? 'text-rose-400' :
            color === 'amber' ? 'text-amber-400' :
              color === 'emerald' ? 'text-emerald-400' : 'text-cyan-400'
        )}>{icon}</span>
        <span className="text-[10px] text-slate-400 tracking-wider uppercase">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn(
          'text-xl font-bold font-mono',
          color === 'rose' ? 'text-rose-400' :
            color === 'amber' ? 'text-amber-400' :
              color === 'emerald' ? 'text-emerald-400' : 'text-cyan-400'
        )}>{value}</span>
        <span className="text-xs text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    Low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    Medium: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    High: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    Critical: 'bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse',
  };

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider',
      styles[level] || styles.Low
    )}>
      {level === 'Critical' && <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />}
      {level}
    </span>
  );
}
