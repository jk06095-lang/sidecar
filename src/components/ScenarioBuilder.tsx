import React, { useState, useEffect } from 'react';
import {
    Activity, Save, Sparkles, Fuel, AlertTriangle,
    Shield, TrendingUp, Box, Database, Network, Copy, Trash2, Edit2, Check, X,
    Flame, CloudLightning, Wifi, Globe2, Package, Zap, GitBranch, Play
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { Scenario, SimulationParams, AppSettings } from '../types';
import LogicMapCanvas from './widgets/LogicMapCanvas';
import { useOntologyStore } from '../store/ontologyStore';

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
    const [isGeneratingAiDraft, setIsGeneratingAiDraft] = useState(false);
    const [aiDraftPrompt, setAiDraftPrompt] = useState('');
    const [customFactors, setCustomFactors] = useState<any[]>([]);
    const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [branchName, setBranchName] = useState('');

    const createScenarioBranch = useOntologyStore((s) => s.createScenarioBranch);
    const clearScenarioBranch = useOntologyStore((s) => s.clearScenarioBranch);
    const scenarioBranch = useOntologyStore((s) => s.scenarioBranch);

    useEffect(() => {
        try {
            const currentOntology = JSON.parse(localStorage.getItem('sidecar_ontology') || '[]');
            const factors = currentOntology.filter((o: any) => o.type === 'factor' && o.isActive);
            setCustomFactors(factors);
        } catch (e) { }
    }, []);

    const activeScenario = scenarios.find(s => s.id === activeScenarioId) || scenarios[0];

    const handleSliderChange = (key: string, value: number) => {
        onParamsChange({ ...simulationParams, [key]: value });
    };

    const handleAiDraftGeneration = async () => {
        if (!aiDraftPrompt.trim() || !settings.apiKey) return;
        setIsGeneratingAiDraft(true);

        setTimeout(() => {
            const input = aiDraftPrompt.toLowerCase();
            let newParams = { ...simulationParams };

            if (input.includes('전쟁') || input.includes('risk')) {
                newParams.vlsfoPrice = Math.min(1500, newParams.vlsfoPrice + 300);
                newParams.newsSentimentScore = Math.min(100, newParams.newsSentimentScore + 40);
                newParams.awrpRate = Math.min(1.0, newParams.awrpRate + 0.3);
                newParams.interestRate = Math.max(0.5, newParams.interestRate - 0.5);

                customFactors.forEach(f => {
                    newParams[f.id] = Math.min(100, (newParams[f.id] || 50) + 20);
                });
            } else if (input.includes('평화') || input.includes('안정')) {
                newParams.vlsfoPrice = Math.max(300, newParams.vlsfoPrice - 150);
                newParams.newsSentimentScore = Math.max(0, newParams.newsSentimentScore - 30);
                newParams.awrpRate = Math.max(0, newParams.awrpRate - 0.1);

                customFactors.forEach(f => {
                    newParams[f.id] = Math.max(0, (newParams[f.id] || 50) - 15);
                });
            } else {
                newParams.newsSentimentScore = Math.min(100, newParams.newsSentimentScore + 10);
            }

            onParamsChange(newParams);
            setNewScenarioName(`AI 시나리오: ${aiDraftPrompt.substring(0, 15)}`);
            setIsGeneratingAiDraft(false);
        }, 1800);
    };

    return (
        <div className="flex h-full bg-slate-950 overflow-hidden">
            {/* Left: AI Context Builder */}
            <div className="w-96 shrink-0 border-r border-slate-800/50 bg-slate-900/30 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                <div>
                    <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-2">
                        <Sparkles className="text-amber-400" />
                        AI 로직맵 초안 생성
                    </h2>
                    <p className="text-sm text-slate-400 mb-6">온톨로지에 등록된 내외부 지식을 통합하여 다채로운 변수 셋업을 생성합니다.</p>

                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">프롬프트 (가정 상황)</label>
                        <textarea
                            value={aiDraftPrompt}
                            onChange={(e) => setAiDraftPrompt(e.target.value)}
                            placeholder="예: 2026년 하반기 중동 전쟁 확산 및 컨테이너 항만 파업 현실화"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500 resize-none h-24"
                        />
                    </div>

                    <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 mb-4">
                        <div className="text-xs font-medium text-slate-400 flex items-center gap-2 mb-3">
                            <Database size={14} className="text-cyan-400" /> AI 참조 온톨로지 범위
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="text-[10px] bg-cyan-900/30 text-cyan-400 border border-cyan-800 px-2 py-1 rounded">기본 룰셋</span>
                            {customFactors.map(f => (
                                <span key={f.id} className="text-[10px] bg-amber-900/30 text-amber-400 border border-amber-800 px-2 py-1 rounded">{f.title}</span>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleAiDraftGeneration}
                        disabled={isGeneratingAiDraft || !aiDraftPrompt.trim() || !settings.apiKey}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600/90 to-orange-600/90 hover:from-amber-500 hover:to-orange-500 text-white font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-amber-900/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                        {isGeneratingAiDraft ? '변수 및 상관관계 연산 중...' : 'AI로 전체 변수값 설정하기'}
                    </button>
                    {!settings.apiKey && <p className="text-[10px] text-center mt-2 text-rose-400">설정에서 Gemini API 키를 등록해야 합니다.</p>}
                </div>

                {/* Scenario Branching */}
                <div className="border-t border-slate-800/50 pt-5">
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-3">
                        <GitBranch size={14} className="text-purple-400" />
                        시뮬레이션 분기 (Scenario Branch)
                    </h3>
                    <p className="text-[10px] text-slate-500 mb-3">
                        현재 파라미터를 Base로 두고, 위 슬라이더 값을 변경한 뒤 분기를 생성하면 퀀트 리스크 전이 함수가 적용된 가상 상태를 데이터 분석 탭에서 비교할 수 있습니다.
                    </p>

                    {scenarioBranch ? (
                        <div className="bg-purple-950/20 border border-purple-800/40 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                                    <span className="text-xs font-bold text-purple-400">분기 활성</span>
                                </div>
                                <button
                                    onClick={clearScenarioBranch}
                                    className="text-[10px] px-2 py-1 text-slate-400 hover:text-rose-400 bg-slate-800/50 rounded transition-colors"
                                >
                                    분기 해제
                                </button>
                            </div>
                            <div className="text-xs text-purple-300 font-medium">{scenarioBranch.name}</div>
                            <div className="text-[10px] text-slate-500 mt-1">데이터 분석 탭에서 Base vs Branch 비교 가능</div>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={branchName}
                                onChange={(e) => setBranchName(e.target.value)}
                                placeholder="분기 이름 (예: 호르무즈 위기)"
                                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                            />
                            <button
                                onClick={() => {
                                    const name = branchName.trim() || `Branch ${new Date().toLocaleTimeString()}`;
                                    createScenarioBranch(name, simulationParams);
                                    setBranchName('');
                                }}
                                className="px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition flex items-center gap-1.5 shrink-0"
                            >
                                <Play size={12} /> 분기 생성
                            </button>
                        </div>
                    )}
                </div>

                <div className="mt-auto border-t border-slate-800/50 pt-5">
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-3">
                        <Save size={14} className="text-emerald-400" />
                        시나리오 로직맵 저장
                    </h3>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newScenarioName}
                            onChange={(e) => setNewScenarioName(e.target.value)}
                            placeholder="저장할 시나리오 이름"
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                        />
                        <button
                            onClick={() => {
                                if (newScenarioName.trim()) {
                                    onSaveScenario(newScenarioName);
                                    setNewScenarioName('');
                                }
                            }}
                            className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium border border-slate-700 transition"
                        >
                            저장
                        </button>
                    </div>
                </div>
            </div>

            {/* Right: Manual Logic Map Builder */}
            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                        <Network className="text-amber-400" />
                        시나리오 변수(Factor) 패널
                    </h1>
                    <p className="text-slate-400 mt-2 text-sm">코어 변수 및 온톨로지에서 사용자가 정의한 커스텀 경영 요소들의 시나리오 수치를 자유롭게 조작합니다.</p>
                </div>

                <div className="max-w-[1200px] space-y-8">
                    {/* Active Scenario Banner */}
                    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 flex justify-between items-center">
                        <div>
                            <div className="text-[10px] font-bold text-emerald-500 tracking-widest uppercase mb-1">현재 적용 중인 시나리오 기준</div>
                            {editingScenarioId === activeScenario.id ? (
                                <div className="flex items-center gap-2 mt-1">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-500"
                                        autoFocus
                                    />
                                    <button onClick={() => { onUpdateScenario(activeScenario.id, editName); setEditingScenarioId(null); }} className="p-1 text-emerald-400 hover:bg-slate-800 rounded"><Check size={16} /></button>
                                    <button onClick={() => setEditingScenarioId(null)} className="p-1 text-slate-400 hover:bg-slate-800 rounded"><X size={16} /></button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <div className="text-lg font-bold text-slate-200">{activeScenario.name}</div>
                                    {activeScenario.isCustom && (
                                        <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                                            <button onClick={() => { setEditName(activeScenario.name); setEditingScenarioId(activeScenario.id); }} className="p-1 text-slate-400 hover:text-amber-400"><Edit2 size={14} /></button>
                                            <button onClick={() => onCopyScenario(activeScenario.id)} className="p-1 text-slate-400 hover:text-cyan-400"><Copy size={14} /></button>
                                            <button onClick={() => { if (confirm('삭제하시겠습니까?')) onDeleteScenario(activeScenario.id); }} className="p-1 text-slate-400 hover:text-rose-400"><Trash2 size={14} /></button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            {scenarios.filter(s => s.isCustom).map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => onScenarioChange(s.id)}
                                    className={cn(
                                        "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                                        activeScenarioId === s.id ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : "bg-slate-800/50 text-slate-400 border-slate-700/50 hover:text-slate-200"
                                    )}
                                >
                                    {s.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 hover:border-purple-500/30 transition-colors">
                        <div className="mb-2 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                                    <Network size={18} className="text-purple-400" />
                                    로직맵 워크플로우 (Logic Map)
                                </h3>
                                <p className="text-xs text-slate-500 mt-1 tracking-wide">시나리오의 트리거와 전개 과정을 블록으로 설계합니다. (AI 참조 및 브리핑 문서화 연동)</p>
                            </div>
                        </div>
                        <LogicMapCanvas activeScenario={activeScenario} />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {/* Core Controls */}
                        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 hover:border-cyan-500/50 transition-colors">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-slate-200 font-semibold flex items-center gap-2">
                                        <Fuel size={16} className="text-cyan-400" /> VLSFO 유가 (mt당)
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-1">원자재 기본 비용 지표 (Core)</p>
                                </div>
                                <div className="text-2xl font-mono font-bold text-cyan-400">${simulationParams.vlsfoPrice}</div>
                            </div>
                            <input
                                type="range"
                                min={300} max={1500} step={10}
                                value={simulationParams.vlsfoPrice}
                                onChange={(e) => handleSliderChange('vlsfoPrice', Number(e.target.value))}
                                className="w-full accent-cyan-500 h-2 bg-slate-800 rounded-full appearance-none cursor-pointer"
                            />
                        </div>

                        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-colors">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-slate-200 font-semibold flex items-center gap-2">
                                        <AlertTriangle size={16} className="text-amber-400" /> 글로벌 뉴스 불안 지수
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-1">지정학 리스크 및 시황 심리 (Core)</p>
                                </div>
                                <div className={cn("text-2xl font-mono font-bold", simulationParams.newsSentimentScore > 80 ? 'text-rose-400' : 'text-amber-400')}>
                                    {simulationParams.newsSentimentScore}
                                </div>
                            </div>
                            <input
                                type="range"
                                min={0} max={100} step={1}
                                value={simulationParams.newsSentimentScore}
                                onChange={(e) => handleSliderChange('newsSentimentScore', Number(e.target.value))}
                                className="w-full accent-amber-500 h-2 bg-slate-800 rounded-full appearance-none cursor-pointer"
                            />
                        </div>

                        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 hover:border-purple-500/50 transition-colors">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-slate-200 font-semibold flex items-center gap-2">
                                        <Shield size={16} className="text-purple-400" /> AWRP 전쟁보험료 율
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-1">고위험 지역 통항 기본 할증 (Core)</p>
                                </div>
                                <div className="text-2xl font-mono font-bold text-purple-400">{Number(simulationParams.awrpRate).toFixed(2)}%</div>
                            </div>
                            <input
                                type="range"
                                min={0} max={1} step={0.01}
                                value={simulationParams.awrpRate}
                                onChange={(e) => handleSliderChange('awrpRate', Number(e.target.value))}
                                className="w-full accent-purple-500 h-2 bg-slate-800 rounded-full appearance-none cursor-pointer"
                            />
                        </div>

                        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 hover:border-blue-500/50 transition-colors">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-slate-200 font-semibold flex items-center gap-2">
                                        <TrendingUp size={16} className="text-blue-400" /> 글로벌 기준금리
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-1">금융 및 자산 가치 평가 지표 (Core)</p>
                                </div>
                                <div className="text-2xl font-mono font-bold text-blue-400">{Number(simulationParams.interestRate).toFixed(1)}%</div>
                            </div>
                            <input
                                type="range"
                                min={0} max={15} step={0.1}
                                value={simulationParams.interestRate}
                                onChange={(e) => handleSliderChange('interestRate', Number(e.target.value))}
                                className="w-full accent-blue-500 h-2 bg-slate-800 rounded-full appearance-none cursor-pointer"
                            />
                        </div>

                        {/* Tail-Risk Enterprise Factors */}
                        <div className="xl:col-span-2 border-t border-dashed border-slate-700/50 pt-6 mt-2">
                            <h4 className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-4 flex items-center gap-2"><AlertTriangle size={12} /> 테일리스크 경영환경 변수 (Tail-Risk Factors)</h4>
                        </div>

                        <div className="bg-rose-950/15 border border-rose-900/30 rounded-2xl p-6 hover:border-rose-500/50 transition-colors">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-slate-200 font-semibold flex items-center gap-2"><Package size={16} className="text-rose-400" /> 공급망 스트레스</h3>
                                    <p className="text-xs text-slate-500 mt-1">항만 체선, 물류 지연, 원자재 부족</p>
                                </div>
                                <div className="text-2xl font-mono font-bold text-rose-400">{simulationParams.supplyChainStress ?? 10}</div>
                            </div>
                            <input type="range" min={0} max={100} step={1} value={simulationParams.supplyChainStress ?? 10} onChange={(e) => handleSliderChange('supplyChainStress', Number(e.target.value))} className="w-full accent-rose-500 h-2 bg-slate-800 rounded-full appearance-none cursor-pointer" />
                        </div>

                        <div className="bg-violet-950/15 border border-violet-900/30 rounded-2xl p-6 hover:border-violet-500/50 transition-colors">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-slate-200 font-semibold flex items-center gap-2"><Wifi size={16} className="text-violet-400" /> 사이버 위협 수준</h3>
                                    <p className="text-xs text-slate-500 mt-1">GPS/AIS/항만 IT 인프라 마비 위험도</p>
                                </div>
                                <div className="text-2xl font-mono font-bold text-violet-400">{simulationParams.cyberThreatLevel ?? 5}</div>
                            </div>
                            <input type="range" min={0} max={100} step={1} value={simulationParams.cyberThreatLevel ?? 5} onChange={(e) => handleSliderChange('cyberThreatLevel', Number(e.target.value))} className="w-full accent-violet-500 h-2 bg-slate-800 rounded-full appearance-none cursor-pointer" />
                        </div>

                        <div className="bg-orange-950/15 border border-orange-900/30 rounded-2xl p-6 hover:border-orange-500/50 transition-colors">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-slate-200 font-semibold flex items-center gap-2"><CloudLightning size={16} className="text-orange-400" /> 천재지변 지수</h3>
                                    <p className="text-xs text-slate-500 mt-1">태풍/지진/쓰나미/홍수 물리적 위험</p>
                                </div>
                                <div className="text-2xl font-mono font-bold text-orange-400">{simulationParams.naturalDisasterIndex ?? 0}</div>
                            </div>
                            <input type="range" min={0} max={100} step={1} value={simulationParams.naturalDisasterIndex ?? 0} onChange={(e) => handleSliderChange('naturalDisasterIndex', Number(e.target.value))} className="w-full accent-orange-500 h-2 bg-slate-800 rounded-full appearance-none cursor-pointer" />
                        </div>

                        <div className="bg-pink-950/15 border border-pink-900/30 rounded-2xl p-6 hover:border-pink-500/50 transition-colors">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-slate-200 font-semibold flex items-center gap-2"><Zap size={16} className="text-pink-400" /> 팬데믹 리스크</h3>
                                    <p className="text-xs text-slate-500 mt-1">바이러스 변이/봉쇄/선원교대 불가</p>
                                </div>
                                <div className="text-2xl font-mono font-bold text-pink-400">{simulationParams.pandemicRisk ?? 0}</div>
                            </div>
                            <input type="range" min={0} max={100} step={1} value={simulationParams.pandemicRisk ?? 0} onChange={(e) => handleSliderChange('pandemicRisk', Number(e.target.value))} className="w-full accent-pink-500 h-2 bg-slate-800 rounded-full appearance-none cursor-pointer" />
                        </div>

                        <div className="bg-sky-950/15 border border-sky-900/30 rounded-2xl p-6 hover:border-sky-500/50 transition-colors">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-slate-200 font-semibold flex items-center gap-2"><Globe2 size={16} className="text-sky-400" /> 무역전쟁 강도</h3>
                                    <p className="text-xs text-slate-500 mt-1">관세/제재/수출입 규제 수준</p>
                                </div>
                                <div className="text-2xl font-mono font-bold text-sky-400">{simulationParams.tradeWarIntensity ?? 5}</div>
                            </div>
                            <input type="range" min={0} max={100} step={1} value={simulationParams.tradeWarIntensity ?? 5} onChange={(e) => handleSliderChange('tradeWarIntensity', Number(e.target.value))} className="w-full accent-sky-500 h-2 bg-slate-800 rounded-full appearance-none cursor-pointer" />
                        </div>

                        <div className="bg-red-950/15 border border-red-900/30 rounded-2xl p-6 hover:border-red-500/50 transition-colors">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-slate-200 font-semibold flex items-center gap-2"><Flame size={16} className="text-red-400" /> 에너지 위기 수준</h3>
                                    <p className="text-xs text-slate-500 mt-1">OPEC 감산, 원유 가격 급등, 에너지 안보</p>
                                </div>
                                <div className="text-2xl font-mono font-bold text-red-400">{simulationParams.energyCrisisLevel ?? 10}</div>
                            </div>
                            <input type="range" min={0} max={100} step={1} value={simulationParams.energyCrisisLevel ?? 10} onChange={(e) => handleSliderChange('energyCrisisLevel', Number(e.target.value))} className="w-full accent-red-500 h-2 bg-slate-800 rounded-full appearance-none cursor-pointer" />
                        </div>

                        {/* Custom Ontology Factors */}
                        {customFactors.map((factor) => {
                            const val = simulationParams[factor.id] ?? 50; // Default dynamic value is 50
                            return (
                                <div key={factor.id} className="bg-emerald-950/20 border border-emerald-900/40 rounded-2xl p-6 hover:border-emerald-500/50 transition-colors">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h3 className="text-emerald-200 font-semibold flex items-center gap-2">
                                                <Box size={16} className="text-emerald-400" /> {factor.title}
                                            </h3>
                                            <p className="text-xs text-emerald-500/70 mt-1 truncate max-w-[200px]">{factor.content}</p>
                                        </div>
                                        <div className="text-2xl font-mono font-bold text-emerald-400">{val}</div>
                                    </div>
                                    <input
                                        type="range"
                                        min={0} max={100} step={1}
                                        value={val}
                                        onChange={(e) => handleSliderChange(factor.id, Number(e.target.value))}
                                        className="w-full accent-emerald-500 h-2 bg-emerald-950 rounded-full appearance-none cursor-pointer"
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
