import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Activity, Save, Sparkles, Fuel, AlertTriangle,
    Shield, TrendingUp, Box, Database, Network, Copy, Trash2, Edit2, Check, X,
    Flame, CloudLightning, Wifi, Globe2, Package, Zap, GitBranch, Play,
    Plus, Search, ChevronRight, ChevronDown, Minus, RotateCcw, Loader2,
    DollarSign, Ship, Clock, BarChart3, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { Scenario, SimulationParams, AppSettings } from '../types';
import LogicMapCanvas from './widgets/LogicMapCanvas';
import BriefingModal from './BriefingModal';
import { useOntologyStore } from '../store/ontologyStore';
import { runScenarioPnL, type ScenarioPnLResult } from '../lib/quantEngine';
import {
    SCENARIO_VARIABLE_CATALOG,
    CATEGORY_META,
    VARIABLE_MAP,
    DEFAULT_VARIABLE_IDS,
    type ScenarioVariableCategory,
} from '../data/scenarioVariables';

interface ScenarioBuilderProps {
    scenarios: Scenario[];
    activeScenarioId: string;
    simulationParams: SimulationParams;
    onScenarioChange: (id: string) => void;
    onParamsChange: (params: SimulationParams) => void;
    onSaveScenario: (name: string) => void;
    onUpdateScenario: (id: string, name: string) => void;
    onCopyScenario: (id: string) => void;
    onDeleteScenario: (id: string) => void;
    settings: AppSettings;
}

export default function ScenarioBuilder({
    scenarios,
    activeScenarioId,
    simulationParams,
    onScenarioChange,
    onParamsChange,
    onSaveScenario,
    onUpdateScenario,
    onCopyScenario,
    onDeleteScenario,
    settings
}: ScenarioBuilderProps) {
    const [newScenarioName, setNewScenarioName] = useState('');
    const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [branchName, setBranchName] = useState('');
    const [catalogSearch, setCatalogSearch] = useState('');
    const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
    const [showPnLDetails, setShowPnLDetails] = useState(false);

    // Track which variables are in the active scenario's deck
    const [activeVariableIds, setActiveVariableIds] = useState<string[]>(() => {
        const activeScenario = scenarios.find(s => s.id === activeScenarioId);
        return activeScenario?.selectedVariableIds || [...DEFAULT_VARIABLE_IDS];
    });

    const createScenarioBranch = useOntologyStore((s) => s.createScenarioBranch);
    const clearScenarioBranch = useOntologyStore((s) => s.clearScenarioBranch);
    const scenarioBranch = useOntologyStore((s) => s.scenarioBranch);
    const dynamicFleetData = useOntologyStore((s) => s.dynamicFleetData);

    // Module 3: Executive Briefing state from Zustand
    const requestExecutiveBriefing = useOntologyStore((s) => s.requestExecutiveBriefing);
    const clearExecutiveBriefing = useOntologyStore((s) => s.clearExecutiveBriefing);
    const executiveBriefing = useOntologyStore((s) => s.executiveBriefing);
    const isExecutiveBriefingLoading = useOntologyStore((s) => s.isExecutiveBriefingLoading);
    const showExecutiveBriefingModal = useOntologyStore((s) => s.showExecutiveBriefingModal);
    const ontologyObjects = useOntologyStore((s) => s.objects);
    const ontologyLinks = useOntologyStore((s) => s.links);

    const activeScenario = scenarios.find(s => s.id === activeScenarioId) || scenarios[0];

    // ── Build baseline params from defaults ──
    const baselineParams = useMemo<SimulationParams>(() => {
        const base = { ...simulationParams };
        DEFAULT_VARIABLE_IDS.forEach(id => {
            const v = VARIABLE_MAP.get(id);
            if (v) base[id] = v.defaultValue;
        });
        return base;
    }, []);

    // ── Quant P&L result (debounced) ──
    const [pnlResult, setPnlResult] = useState<ScenarioPnLResult | null>(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            try {
                const result = runScenarioPnL(baselineParams, simulationParams, dynamicFleetData);
                setPnlResult(result);
            } catch (err) {
                console.warn('[QuantEngine] P&L computation error:', err);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [simulationParams, dynamicFleetData, baselineParams]);

    // Sync activeVariableIds when scenario changes
    useEffect(() => {
        const sc = scenarios.find(s => s.id === activeScenarioId);
        if (sc?.selectedVariableIds) {
            setActiveVariableIds(sc.selectedVariableIds);
        } else {
            const ids = Object.keys(simulationParams).filter(k => simulationParams[k] !== undefined && VARIABLE_MAP.has(k));
            setActiveVariableIds(ids.length > 0 ? ids : [...DEFAULT_VARIABLE_IDS]);
        }
    }, [activeScenarioId]);

    const handleSliderChange = (key: string, value: number) => {
        onParamsChange({ ...simulationParams, [key]: value });
    };

    const addVariableToDeck = (varId: string) => {
        if (activeVariableIds.includes(varId)) return;
        const newIds = [...activeVariableIds, varId];
        setActiveVariableIds(newIds);
        const varMeta = VARIABLE_MAP.get(varId);
        if (varMeta && simulationParams[varId] === undefined) {
            onParamsChange({ ...simulationParams, [varId]: varMeta.defaultValue });
        }
    };

    const removeVariableFromDeck = (varId: string) => {
        setActiveVariableIds(activeVariableIds.filter(id => id !== varId));
    };

    // Grouped catalog for left panel
    const groupedCatalog = useMemo(() => {
        const groups: Record<ScenarioVariableCategory, typeof SCENARIO_VARIABLE_CATALOG> = {} as any;
        const search = catalogSearch.toLowerCase();
        SCENARIO_VARIABLE_CATALOG.forEach(v => {
            if (search && !v.nameKo.toLowerCase().includes(search) && !v.name.toLowerCase().includes(search) && !v.id.toLowerCase().includes(search)) return;
            if (!groups[v.category]) groups[v.category] = [];
            groups[v.category].push(v);
        });
        return groups;
    }, [catalogSearch]);

    const toggleCategory = (cat: string) => {
        setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
    };

    // Active variable objects
    const activeVariables = useMemo(() => {
        return activeVariableIds.map(id => VARIABLE_MAP.get(id)).filter(Boolean) as typeof SCENARIO_VARIABLE_CATALOG;
    }, [activeVariableIds]);

    return (
        <div className="flex h-full bg-slate-950 overflow-hidden">
            {/* ═══════════ LEFT: Scenario List + Variable Catalog ═══════════ */}
            <div className="w-[320px] shrink-0 border-r border-slate-800/50 bg-zinc-900/40 flex flex-col overflow-hidden">

                {/* Scenario List */}
                <div className="px-3 py-3 border-b border-slate-800/50 shrink-0">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <Database size={10} className="text-cyan-400" /> 시나리오 목록
                    </h3>
                    <div className="space-y-1 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                        {scenarios.map(s => (
                            <div
                                key={s.id}
                                className={cn(
                                    "group flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                                    activeScenarioId === s.id
                                        ? "bg-cyan-500/10 border border-cyan-500/30 text-cyan-300"
                                        : "hover:bg-zinc-800/50 text-slate-400 border border-transparent"
                                )}
                                onClick={() => onScenarioChange(s.id)}
                            >
                                <div className={cn("w-2 h-2 rounded-full shrink-0",
                                    s.isRealtime ? "bg-red-500 animate-pulse" : activeScenarioId === s.id ? "bg-cyan-400" : "bg-slate-600"
                                )} />
                                {editingScenarioId === s.id ? (
                                    <div className="flex items-center gap-1 flex-1">
                                        <input
                                            type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                                            className="flex-1 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-[11px] text-white focus:outline-none focus:border-cyan-500"
                                            autoFocus placeholder="시나리오 이름"
                                        />
                                        <button onClick={(e) => { e.stopPropagation(); onUpdateScenario(s.id, editName); setEditingScenarioId(null); }} title="저장" className="p-0.5 text-emerald-400 hover:bg-slate-800 rounded"><Check size={12} /></button>
                                        <button onClick={(e) => { e.stopPropagation(); setEditingScenarioId(null); }} title="취소" className="p-0.5 text-slate-400 hover:bg-slate-800 rounded"><X size={12} /></button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="flex-1 truncate font-medium text-[11px]">{s.name}</span>
                                        {s.isCustom && (
                                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0">
                                                <button onClick={(e) => { e.stopPropagation(); setEditName(s.name); setEditingScenarioId(s.id); }} title="이름 변경" className="p-0.5 text-slate-500 hover:text-amber-400 rounded"><Edit2 size={10} /></button>
                                                <button onClick={(e) => { e.stopPropagation(); onCopyScenario(s.id); }} title="복제" className="p-0.5 text-slate-500 hover:text-cyan-400 rounded"><Copy size={10} /></button>
                                                <button onClick={(e) => { e.stopPropagation(); if (confirm('이 시나리오를 삭제하시겠습니까?')) onDeleteScenario(s.id); }} title="삭제" className="p-0.5 text-slate-500 hover:text-rose-400 rounded"><Trash2 size={10} /></button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* New scenario */}
                    <div className="flex gap-1.5 mt-2">
                        <input
                            type="text" value={newScenarioName} onChange={(e) => setNewScenarioName(e.target.value)}
                            placeholder="새 시나리오 이름" title="새 시나리오 이름"
                            className="flex-1 bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-cyan-500/50 placeholder-slate-600"
                        />
                        <button
                            onClick={() => { if (newScenarioName.trim()) { onSaveScenario(newScenarioName); setNewScenarioName(''); } }}
                            className="px-2.5 py-1.5 bg-cyan-900/30 hover:bg-cyan-800/40 text-cyan-400 text-[10px] font-bold rounded-lg border border-cyan-800/40 transition shrink-0"
                            title="시나리오 저장"
                        >
                            <Save size={11} />
                        </button>
                    </div>
                </div>

                {/* Variable Catalog */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-3 py-2.5 border-b border-slate-800/40 shrink-0">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <Box size={10} className="text-amber-400" /> 변수 카탈로그
                            <span className="text-slate-600 font-mono ml-auto">{SCENARIO_VARIABLE_CATALOG.length}</span>
                        </h3>
                        <div className="relative">
                            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text" value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)}
                                placeholder="변수 검색..." title="변수 검색"
                                className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-amber-500/50 placeholder-slate-600"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-1">
                        {(Object.entries(groupedCatalog) as [ScenarioVariableCategory, typeof SCENARIO_VARIABLE_CATALOG][]).map(([cat, vars]) => {
                            const meta = CATEGORY_META[cat];
                            const isExpanded = expandedCategories[cat] ?? false;
                            return (
                                <div key={cat} className="mb-1">
                                    <button
                                        onClick={() => toggleCategory(cat)}
                                        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800/40 transition-colors text-left"
                                    >
                                        {isExpanded ? <ChevronDown size={11} className="text-slate-500 shrink-0" /> : <ChevronRight size={11} className="text-slate-500 shrink-0" />}
                                        <span className="text-[11px]">{meta.icon}</span>
                                        <span className={cn("text-[11px] font-bold", meta.color)}>{meta.labelKo}</span>
                                        <span className="ml-auto text-[9px] text-slate-600 font-mono">{vars.length}</span>
                                    </button>
                                    {isExpanded && (
                                        <div className="ml-4 pl-2 border-l border-zinc-700/30 space-y-0.5 pb-1">
                                            {vars.map(v => {
                                                const isInDeck = activeVariableIds.includes(v.id);
                                                return (
                                                    <button
                                                        key={v.id}
                                                        onClick={() => !isInDeck && addVariableToDeck(v.id)}
                                                        title={v.description}
                                                        disabled={isInDeck}
                                                        className={cn(
                                                            "w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[10px] transition-all",
                                                            isInDeck
                                                                ? "text-slate-600 cursor-default"
                                                                : "text-slate-300 hover:bg-zinc-800/50 hover:text-white cursor-pointer"
                                                        )}
                                                    >
                                                        <Plus size={9} className={cn("shrink-0", isInDeck ? "text-slate-700" : "text-emerald-500")} />
                                                        <span className="truncate flex-1">{v.nameKo}</span>
                                                        {isInDeck && <span className="text-[8px] text-emerald-600 shrink-0">적용됨</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {Object.keys(groupedCatalog).length === 0 && (
                            <div className="text-center text-xs text-slate-500 mt-8">검색 결과 없음</div>
                        )}
                    </div>
                </div>

                {/* Branch */}
                <div className="px-3 py-2.5 border-t border-slate-800/50 shrink-0">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <GitBranch size={10} className="text-purple-400" /> 시뮬레이션 분기
                    </h3>
                    {scenarioBranch ? (
                        <div className="bg-purple-950/20 border border-purple-800/40 rounded-lg p-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-purple-400">{scenarioBranch.name}</span>
                                </div>
                                <button onClick={clearScenarioBranch} className="text-[9px] px-1.5 py-0.5 text-slate-400 hover:text-rose-400 bg-slate-800/50 rounded transition-colors">해제</button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-1.5">
                            <input
                                type="text" value={branchName} onChange={(e) => setBranchName(e.target.value)}
                                placeholder="분기 이름" title="분기 이름"
                                className="flex-1 bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-purple-500/50 placeholder-slate-600"
                            />
                            <button
                                onClick={() => { const name = branchName.trim() || `Branch ${new Date().toLocaleTimeString()}`; createScenarioBranch(name, simulationParams); setBranchName(''); }}
                                className="px-2.5 py-1.5 bg-purple-900/30 hover:bg-purple-800/40 text-purple-400 text-[10px] font-bold rounded-lg border border-purple-800/40 transition shrink-0 flex items-center gap-1"
                                title="분기 생성"
                            >
                                <Play size={10} /> 생성
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══════════ RIGHT: Active Scenario Workspace ═══════════ */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Scenario Header */}
                <div className="px-6 py-3 border-b border-slate-800/50 bg-slate-900/30 shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2.5">
                                <div className={cn("w-2.5 h-2.5 rounded-full", activeScenario.isRealtime ? "bg-red-500 animate-pulse" : "bg-cyan-400")} />
                                <h2 className="text-lg font-bold text-slate-100">{activeScenario.name}</h2>
                                {activeScenario.isCustom && (
                                    <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-800/30 px-1.5 py-0.5 rounded font-bold">CUSTOM</span>
                                )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 max-w-[500px] truncate">{activeScenario.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={requestExecutiveBriefing}
                                disabled={isExecutiveBriefingLoading}
                                className={cn(
                                    'flex items-center gap-2 px-4 py-2 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap',
                                    isExecutiveBriefingLoading
                                        ? 'bg-violet-900/30 border border-violet-700/30 text-violet-400 cursor-wait'
                                        : 'bg-gradient-to-r from-violet-600 to-rose-600 hover:from-violet-500 hover:to-rose-500 text-white shadow-lg shadow-violet-900/20'
                                )}
                            >
                                {isExecutiveBriefingLoading ? (
                                    <><Loader2 size={13} className="animate-spin" /> 퀀트 분석 중...</>
                                ) : (
                                    <><Sparkles size={13} /> 🧠 AIP 퀀트 브리핑</>
                                )}
                            </button>
                            <span className="text-[10px] text-slate-500 bg-zinc-800/60 px-2 py-1 rounded font-mono">{activeVariableIds.length} vars</span>
                            <button
                                onClick={() => {
                                    setActiveVariableIds([...DEFAULT_VARIABLE_IDS]);
                                    const resetParams = { ...simulationParams };
                                    DEFAULT_VARIABLE_IDS.forEach(id => {
                                        const v = VARIABLE_MAP.get(id);
                                        if (v) resetParams[id] = v.defaultValue;
                                    });
                                    onParamsChange(resetParams);
                                }}
                                className="p-1.5 text-slate-500 hover:text-amber-400 rounded transition-colors"
                                title="기본 변수로 초기화"
                            >
                                <RotateCcw size={13} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Variable Deck + Quant Results + Logic Map */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {/* Variable Deck Header */}
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                            <Sparkles size={14} className="text-amber-400" />
                            시나리오 변수 덱 — <span className="text-cyan-400">{activeVariables.length}</span>개 활성
                        </h3>
                        <p className="text-[10px] text-slate-500">좌측 카탈로그에서 변수를 추가하여 시나리오를 조립하세요</p>
                    </div>

                    {/* Variable Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
                        {activeVariables.map(v => {
                            const value = simulationParams[v.id] ?? v.defaultValue;
                            const catMeta = CATEGORY_META[v.category];
                            const pct = ((value - v.min) / (v.max - v.min)) * 100;
                            const isHigh = pct > 70;
                            const isCritical = pct > 85;

                            return (
                                <div
                                    key={v.id}
                                    className={cn(
                                        "rounded-xl border p-3 transition-all hover:shadow-lg group/card",
                                        catMeta.bgColor, catMeta.borderColor
                                    )}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px]">{catMeta.icon}</span>
                                                <span className={cn("text-[11px] font-bold truncate", catMeta.color)}>{v.nameKo}</span>
                                            </div>
                                            <div className="text-[9px] text-slate-600 mt-0.5 truncate">{v.name}</div>
                                        </div>
                                        <button
                                            onClick={() => removeVariableFromDeck(v.id)}
                                            className="p-0.5 text-slate-600 hover:text-rose-400 opacity-0 group-hover/card:opacity-100 transition-all shrink-0"
                                            title="덱에서 제거"
                                        >
                                            <Minus size={11} />
                                        </button>
                                    </div>

                                    <div className="flex items-baseline gap-1 mb-2">
                                        <span className={cn(
                                            "text-xl font-black font-mono leading-none",
                                            isCritical ? "text-rose-400" : isHigh ? "text-amber-400" : catMeta.color
                                        )}>
                                            {typeof value === 'number' && value % 1 !== 0 ? value.toFixed(2) : value}
                                        </span>
                                        <span className="text-[9px] text-slate-500">{v.unit}</span>
                                    </div>

                                    <input
                                        type="range"
                                        min={v.min} max={v.max} step={v.step}
                                        value={value}
                                        onChange={(e) => handleSliderChange(v.id, Number(e.target.value))}
                                        title={`${v.nameKo}: ${value}${v.unit}`}
                                        className={cn(
                                            "w-full h-1.5 rounded-full appearance-none cursor-pointer",
                                            isCritical ? "accent-rose-500" : isHigh ? "accent-amber-500" : `accent-cyan-500`,
                                            "bg-slate-800"
                                        )}
                                    />
                                    <div className="flex justify-between text-[8px] text-slate-600 mt-0.5">
                                        <span>{v.min}</span>
                                        <span>{v.max}</span>
                                    </div>
                                </div>
                            );
                        })}

                        {activeVariables.length === 0 && (
                            <div className="col-span-full flex items-center justify-center py-12 border-2 border-dashed border-slate-700/50 rounded-2xl">
                                <div className="text-center">
                                    <Box size={28} className="text-slate-600 mx-auto mb-2" />
                                    <p className="text-sm text-slate-400 font-medium">변수 덱이 비어있습니다</p>
                                    <p className="text-[10px] text-slate-500 mt-1">좌측 카탈로그에서 변수를 선택하여 추가하세요</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ═════════ QUANT P&L RESULTS PANEL ═════════ */}
                    {pnlResult && (
                        <div className="mb-8 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                            {/* Fleet Summary */}
                            <div className="px-5 py-4 border-b border-slate-800/50">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                                        <BarChart3 size={14} className="text-emerald-400" />
                                        Fleet P&L Impact
                                    </h3>
                                    <button
                                        onClick={() => setShowPnLDetails(!showPnLDetails)}
                                        className="text-[10px] text-slate-400 hover:text-cyan-400 transition-colors flex items-center gap-1"
                                    >
                                        <Ship size={11} />
                                        {showPnLDetails ? '요약 보기' : `선박별 상세 (${pnlResult.vessels.length}척)`}
                                        <ChevronDown size={10} className={cn("transition-transform", showPnLDetails && "rotate-180")} />
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                                    <PnLCard
                                        icon={<TrendingUp size={14} />}
                                        label="TCE 변동"
                                        value={pnlResult.fleet.avgTceDelta}
                                        unit="$/day"
                                        format="delta"
                                    />
                                    <PnLCard
                                        icon={<DollarSign size={14} />}
                                        label="OPEX 변동"
                                        value={pnlResult.fleet.totalOpexDelta}
                                        unit="$"
                                        format="delta"
                                        invertColor
                                    />
                                    <PnLCard
                                        icon={<Clock size={14} />}
                                        label="지연일수 변동"
                                        value={pnlResult.fleet.totalDelayDaysDelta}
                                        unit="days"
                                        format="delta"
                                        invertColor
                                    />
                                    <PnLCard
                                        icon={<Activity size={14} />}
                                        label="Net P&L"
                                        value={pnlResult.fleet.netPnLDelta}
                                        unit="$"
                                        format="delta"
                                        highlight
                                    />
                                </div>
                            </div>

                            {/* Per-Vessel Breakdown (expandable) */}
                            {showPnLDetails && (
                                <div className="px-5 py-3">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-[10px]">
                                            <thead>
                                                <tr className="text-slate-500 border-b border-slate-800/50">
                                                    <th className="text-left py-2 pr-4 font-bold uppercase tracking-widest">선박</th>
                                                    <th className="text-right py-2 px-3 font-bold uppercase tracking-widest">TCE</th>
                                                    <th className="text-right py-2 px-3 font-bold uppercase tracking-widest">ΔTCE</th>
                                                    <th className="text-right py-2 px-3 font-bold uppercase tracking-widest">OPEX</th>
                                                    <th className="text-right py-2 px-3 font-bold uppercase tracking-widest">ΔOPEX</th>
                                                    <th className="text-right py-2 px-3 font-bold uppercase tracking-widest">Delay</th>
                                                    <th className="text-right py-2 px-3 font-bold uppercase tracking-widest">Bunker</th>
                                                    <th className="text-right py-2 px-3 font-bold uppercase tracking-widest">AWRP</th>
                                                    <th className="text-right py-2 px-3 font-bold uppercase tracking-widest">Carbon</th>
                                                    <th className="text-right py-2 pl-3 font-bold uppercase tracking-widest">Voyage P&L</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pnlResult.vessels.map((v, i) => (
                                                    <tr key={i} className="border-b border-slate-800/20 hover:bg-slate-800/20 transition-colors">
                                                        <td className="py-2 pr-4">
                                                            <div className="flex items-center gap-1.5">
                                                                <Ship size={11} className="text-cyan-400" />
                                                                <span className="text-slate-300 font-medium">{v.vesselName}</span>
                                                            </div>
                                                        </td>
                                                        <td className="text-right py-2 px-3 text-slate-300 font-mono">${v.tce.toLocaleString()}</td>
                                                        <td className="text-right py-2 px-3 font-mono font-bold">
                                                            <DeltaValue value={v.tceDelta} unit="" />
                                                        </td>
                                                        <td className="text-right py-2 px-3 text-slate-300 font-mono">${v.opex.toLocaleString()}</td>
                                                        <td className="text-right py-2 px-3 font-mono font-bold">
                                                            <DeltaValue value={v.opexDelta} unit="" invert />
                                                        </td>
                                                        <td className="text-right py-2 px-3 font-mono">
                                                            <DeltaValue value={v.delayDaysDelta} unit="d" invert />
                                                        </td>
                                                        <td className="text-right py-2 px-3 text-slate-400 font-mono">${v.bunkerCostPerDay.toLocaleString()}/d</td>
                                                        <td className="text-right py-2 px-3 text-slate-400 font-mono">${v.awrpCost.toLocaleString()}</td>
                                                        <td className="text-right py-2 px-3 text-slate-400 font-mono">${v.carbonCost.toLocaleString()}</td>
                                                        <td className="text-right py-2 pl-3 font-mono font-bold">
                                                            <DeltaValue value={v.voyagePnLDelta} unit="" />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Logic Map */}
                    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 hover:border-purple-500/30 transition-colors">
                        <div className="mb-2">
                            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                                <Network size={14} className="text-purple-400" />
                                인과관계 로직 트리
                            </h3>
                            <p className="text-[10px] text-slate-500 mt-0.5">변수 노드와 선박 노드를 드래그 & 연결하여 인과관계를 구성하세요</p>
                        </div>
                        <LogicMapCanvas activeScenario={activeScenario} />
                    </div>
                </div>
            </div>

            {/* Module 3: Executive Briefing Modal */}
            <BriefingModal
                isOpen={showExecutiveBriefingModal}
                onClose={clearExecutiveBriefing}
                marpContent=""
                executiveBriefing={executiveBriefing}
                isExecutiveBriefingLoading={isExecutiveBriefingLoading}
                ontologyObjects={ontologyObjects}
                ontologyLinks={ontologyLinks}
            />
        </div>
    );
}

// ============================================================
// Sub-components
// ============================================================

function PnLCard({ icon, label, value, unit, format, invertColor, highlight }: {
    icon: React.ReactNode;
    label: string;
    value: number;
    unit: string;
    format?: 'delta';
    invertColor?: boolean;
    highlight?: boolean;
}) {
    const isPositive = invertColor ? value <= 0 : value >= 0;
    const color = format === 'delta'
        ? (isPositive ? 'text-emerald-400' : 'text-rose-400')
        : 'text-slate-200';

    const bgClass = highlight
        ? (isPositive ? 'bg-emerald-950/30 border-emerald-700/40' : 'bg-rose-950/30 border-rose-700/40')
        : 'bg-slate-800/30 border-slate-700/30';

    const sign = format === 'delta' && value > 0 ? '+' : '';

    return (
        <div className={cn("rounded-xl border px-4 py-3 transition-all", bgClass)}>
            <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-slate-500">{icon}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{label}</span>
            </div>
            <div className="flex items-baseline gap-1">
                <span className={cn("text-xl font-black font-mono leading-none", color)}>
                    {sign}{Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <span className="text-[9px] text-slate-500">{unit}</span>
            </div>
            {format === 'delta' && (
                <div className="flex items-center gap-0.5 mt-1">
                    {isPositive
                        ? <ArrowUpRight size={10} className="text-emerald-400" />
                        : <ArrowDownRight size={10} className="text-rose-400" />
                    }
                    <span className={cn("text-[9px] font-mono", color)}>vs baseline</span>
                </div>
            )}
        </div>
    );
}

function DeltaValue({ value, unit, invert }: { value: number; unit: string; invert?: boolean }) {
    const isPositive = invert ? value <= 0 : value >= 0;
    const sign = value > 0 ? '+' : '';
    return (
        <span className={cn("font-mono", isPositive ? 'text-emerald-400' : 'text-rose-400')}>
            {sign}{value.toLocaleString(undefined, { maximumFractionDigits: 1 })}{unit}
        </span>
    );
}
