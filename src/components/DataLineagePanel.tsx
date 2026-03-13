/**
 * DataLineagePanel — Data source monitoring & API connection management
 * 
 * Refactored from ApiManager.tsx:
 *  - Built-in data sources (LSEG, Reuters, Yahoo Finance, Baltic Exchange)
 *  - Health check indicators (data freshness)
 *  - Data flow visualization (Source → Ingestion → Ontology → AI)
 *  - CRUD for custom API connections (preserved from ApiManager)
 */
import React, { useState, useMemo } from 'react';
import {
    Plus, Trash2, Edit2, Check, X, Server, Loader2,
    Wifi, WifiOff, Lock, Globe, ChevronDown, ChevronRight,
    Activity, ArrowRight, Database, Zap, Radio, Clock,
    TrendingUp, Newspaper, Ship,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useApiConfigStore, type ApiConnection } from '../store/apiConfigStore';
import { useOntologyStore } from '../store/ontologyStore';

// ============================================================
// BUILT-IN DATA SOURCES
// ============================================================
interface BuiltInSource {
    id: string;
    name: string;
    provider: string;
    icon: React.ReactNode;
    color: string;
    dataTypes: string[];
    endpoint: string;
}

const BUILT_IN_SOURCES: BuiltInSource[] = [
    {
        id: 'yahoo-finance',
        name: 'Yahoo Finance',
        provider: 'Yahoo',
        icon: <TrendingUp size={14} />,
        color: 'violet',
        dataTypes: ['유가(WTI/Brent)', '환율(USD/KRW)', '원자재'],
        endpoint: 'query1.finance.yahoo.com/v8',
    },
    {
        id: 'baltic-exchange',
        name: 'Baltic Exchange',
        provider: 'Baltic',
        icon: <Ship size={14} />,
        color: 'cyan',
        dataTypes: ['BDI 지수', 'VLCC 운임', '벙커유가'],
        endpoint: 'api.balticexchange.com/v1',
    },
    {
        id: 'lseg-data',
        name: 'LSEG Data API',
        provider: 'LSEG/Refinitiv',
        icon: <Database size={14} />,
        color: 'emerald',
        dataTypes: ['선물/파생상품', '실시간시세', '기업재무'],
        endpoint: 'api.refinitiv.com/data/v1',
    },
    {
        id: 'reuters-news',
        name: 'Reuters Intelligence',
        provider: 'Reuters',
        icon: <Newspaper size={14} />,
        color: 'orange',
        dataTypes: ['뉴스 피드', '감성 분석', '지정학 리스크'],
        endpoint: 'api.reuters.com/news/v2',
    },
];

// ============================================================
// DATA FLOW PIPELINE VISUAL
// ============================================================
function DataFlowDiagram() {
    const stages = [
        { label: 'External API', icon: <Globe size={10} />, color: 'text-violet-400 border-violet-500/30 bg-violet-500/10' },
        { label: 'Ingestion', icon: <Zap size={10} />, color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
        { label: 'Ontology', icon: <Database size={10} />, color: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' },
        { label: 'AI Engine', icon: <Activity size={10} />, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
    ];

    return (
        <div className="flex items-center gap-1 py-3 px-4 bg-slate-900/30 rounded-xl border border-slate-800/40 mb-4 overflow-x-auto">
            {stages.map((stage, i) => (
                <React.Fragment key={stage.label}>
                    {i > 0 && <ArrowRight size={10} className="text-slate-600 shrink-0 mx-0.5" />}
                    <div className={cn(
                        'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[9px] font-bold uppercase tracking-wider shrink-0',
                        stage.color
                    )}>
                        {stage.icon}
                        {stage.label}
                    </div>
                </React.Fragment>
            ))}
        </div>
    );
}

// ============================================================
// CONNECTION FORM (preserved from ApiManager)
// ============================================================
const EMPTY_FORM = {
    name: '',
    baseUrl: '',
    apiKey: '',
    customHeaders: '{}',
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function DataLineagePanel() {
    const connections = useApiConfigStore(s => s.connections);
    const addConnection = useApiConfigStore(s => s.addConnection);
    const updateConnection = useApiConfigStore(s => s.updateConnection);
    const removeConnection = useApiConfigStore(s => s.removeConnection);
    const testConnection = useApiConfigStore(s => s.testConnection);

    // Ontology store for freshness indicators
    const objectCount = useOntologyStore(s => s.objects.length);
    const linkCount = useOntologyStore(s => s.links.length);

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [headerError, setHeaderError] = useState('');

    // Simulated freshness — in production this would come from actual sync timestamps
    const freshnessData = useMemo(() => {
        const now = Date.now();
        return BUILT_IN_SOURCES.map(src => {
            // Yahoo Finance is actively connected, others are planned
            const isActive = src.id === 'yahoo-finance';
            const lastSync = isActive ? new Date(now - 600_000) : null; // 10 min ago if active
            const minutesAgo = lastSync ? Math.round((now - lastSync.getTime()) / 60000) : null;
            const health: 'healthy' | 'stale' | 'disconnected' = isActive
                ? (minutesAgo! < 30 ? 'healthy' : 'stale')
                : 'disconnected';
            return { ...src, isActive, lastSync, minutesAgo, health };
        });
    }, []);

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setShowForm(false);
        setEditingId(null);
        setHeaderError('');
    };

    const validateHeaders = (str: string): boolean => {
        if (!str.trim() || str.trim() === '{}') return true;
        try {
            const parsed = JSON.parse(str);
            if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                setHeaderError('JSON 객체 형식이어야 합니다');
                return false;
            }
            setHeaderError('');
            return true;
        } catch {
            setHeaderError('유효하지 않은 JSON 형식입니다');
            return false;
        }
    };

    const handleSubmit = () => {
        if (!form.name.trim() || !form.baseUrl.trim()) return;
        if (!validateHeaders(form.customHeaders)) return;
        const headers = form.customHeaders.trim() && form.customHeaders.trim() !== '{}'
            ? JSON.parse(form.customHeaders) : {};
        if (editingId) {
            updateConnection(editingId, { name: form.name.trim(), baseUrl: form.baseUrl.trim(), apiKey: form.apiKey, customHeaders: headers });
        } else {
            addConnection({ name: form.name.trim(), baseUrl: form.baseUrl.trim(), apiKey: form.apiKey, customHeaders: headers });
        }
        resetForm();
    };

    const startEdit = (conn: ApiConnection) => {
        setForm({
            name: conn.name, baseUrl: conn.baseUrl, apiKey: conn.apiKey,
            customHeaders: Object.keys(conn.customHeaders).length > 0 ? JSON.stringify(conn.customHeaders, null, 2) : '{}',
        });
        setEditingId(conn.id);
        setShowForm(true);
    };

    const statusIcon = (status?: string) => {
        if (status === 'success') return <Wifi size={12} className="text-emerald-400" />;
        if (status === 'error') return <WifiOff size={12} className="text-rose-400" />;
        if (status === 'pending') return <Loader2 size={12} className="text-amber-400 animate-spin" />;
        return <div className="w-3 h-3 rounded-full bg-slate-600" />;
    };

    const statusLabel = (status?: string) => {
        if (status === 'success') return '연결됨';
        if (status === 'error') return '오류';
        if (status === 'pending') return '테스트 중...';
        return '미테스트';
    };

    const healthDot = (health: string) => {
        if (health === 'healthy') return 'bg-emerald-500';
        if (health === 'stale') return 'bg-amber-500';
        return 'bg-slate-600';
    };

    const healthLabel = (health: string) => {
        if (health === 'healthy') return '정상';
        if (health === 'stale') return '지연';
        return '미연결';
    };

    return (
        <div className="p-6 space-y-6">
            {/* ═══ Header ═══ */}
            <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-1">
                    <Radio size={18} className="text-blue-400" />
                    Data Lineage & Health Monitor
                </h2>
                <p className="text-xs text-slate-500">
                    외부 데이터 소스의 동기화 상태와 API 파이프라인을 모니터링합니다
                </p>
            </div>

            {/* ═══ Data Flow Diagram ═══ */}
            <DataFlowDiagram />

            {/* ═══ Ontology Stats ═══ */}
            <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-cyan-950/20 border border-cyan-900/30 rounded-xl">
                    <div className="text-[9px] uppercase tracking-wider text-cyan-500 font-bold mb-1">Ontology Objects</div>
                    <div className="text-2xl font-black text-cyan-300">{objectCount}</div>
                </div>
                <div className="p-3 bg-violet-950/20 border border-violet-900/30 rounded-xl">
                    <div className="text-[9px] uppercase tracking-wider text-violet-500 font-bold mb-1">Ontology Links</div>
                    <div className="text-2xl font-black text-violet-300">{linkCount}</div>
                </div>
            </div>

            {/* ═══ Built-in Data Sources ═══ */}
            <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Server size={12} /> 내장 데이터 소스
                </h3>
                <div className="space-y-2">
                    {freshnessData.map(src => (
                        <div
                            key={src.id}
                            className={cn(
                                'flex items-center gap-3 p-3.5 rounded-xl border transition-all',
                                src.isActive
                                    ? 'bg-slate-900/60 border-slate-700/50'
                                    : 'bg-slate-950/40 border-slate-800/30 opacity-60'
                            )}
                        >
                            {/* Icon */}
                            <div className={cn(
                                'w-9 h-9 rounded-lg flex items-center justify-center border shrink-0',
                                `bg-${src.color}-500/10 border-${src.color}-500/30 text-${src.color}-400`
                            )}>
                                {src.icon}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-slate-200">{src.name}</span>
                                    <span className="text-[8px] font-mono text-slate-600">{src.provider}</span>
                                </div>
                                <div className="text-[9px] text-slate-500 font-mono truncate">{src.endpoint}</div>
                                <div className="flex items-center gap-1.5 mt-1">
                                    {src.dataTypes.map(dt => (
                                        <span key={dt} className="text-[8px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400 border border-slate-700/40">{dt}</span>
                                    ))}
                                </div>
                            </div>

                            {/* Health Status */}
                            <div className="shrink-0 flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1.5">
                                    <div className={cn('w-2 h-2 rounded-full', healthDot(src.health), src.health === 'healthy' && 'animate-pulse')} />
                                    <span className={cn(
                                        'text-[9px] font-bold',
                                        src.health === 'healthy' ? 'text-emerald-400' : src.health === 'stale' ? 'text-amber-400' : 'text-slate-600'
                                    )}>
                                        {healthLabel(src.health)}
                                    </span>
                                </div>
                                {src.lastSync && (
                                    <span className="text-[8px] text-slate-600 flex items-center gap-0.5">
                                        <Clock size={8} />
                                        {src.minutesAgo}분 전
                                    </span>
                                )}
                                {!src.isActive && (
                                    <span className="text-[8px] text-slate-700 italic">Phase 2 예정</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ═══ Custom API Connections (from ApiManager CRUD) ═══ */}
            <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Globe size={12} /> 사용자 정의 커넥션
                </h3>

                {/* Connection List */}
                {connections.length > 0 && (
                    <div className="space-y-2 mb-3">
                        {connections.map(conn => {
                            const isExpanded = expandedId === conn.id;
                            return (
                                <div key={conn.id} className="bg-slate-950/60 border border-slate-700/50 rounded-xl overflow-hidden">
                                    <div
                                        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/30 transition-colors"
                                        onClick={() => setExpandedId(isExpanded ? null : conn.id)}
                                    >
                                        {isExpanded ? <ChevronDown size={12} className="text-slate-500 shrink-0" /> : <ChevronRight size={12} className="text-slate-500 shrink-0" />}
                                        {statusIcon(conn.lastTestStatus)}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-semibold text-slate-200 truncate">{conn.name}</div>
                                            <div className="text-[10px] text-slate-500 font-mono truncate">{conn.baseUrl}</div>
                                        </div>
                                        <span className={cn(
                                            "text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0",
                                            conn.lastTestStatus === 'success' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                                : conn.lastTestStatus === 'error' ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                                    : "bg-slate-700/30 text-slate-500 border-slate-600/30"
                                        )}>
                                            {statusLabel(conn.lastTestStatus)}
                                        </span>
                                    </div>
                                    {isExpanded && (
                                        <div className="px-4 pb-3 space-y-2 border-t border-slate-800/50 animate-fade-in">
                                            <div className="pt-2 grid grid-cols-2 gap-2 text-[10px]">
                                                <div>
                                                    <span className="text-slate-500">API Key:</span>
                                                    <span className="ml-1 text-slate-300 font-mono">{conn.apiKey ? '••••••••' + conn.apiKey.slice(-4) : '미설정'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500">생성일:</span>
                                                    <span className="ml-1 text-slate-400 font-mono">{new Date(conn.createdAt).toLocaleDateString('ko-KR')}</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 pt-1">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); testConnection(conn.id); }}
                                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-cyan-600/20 text-cyan-400 text-[10px] font-medium rounded-lg border border-cyan-500/30 hover:bg-cyan-600/30 transition-colors"
                                                    title="연결 테스트"
                                                >
                                                    <Globe size={10} /> 연결 테스트
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); startEdit(conn); }}
                                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-600/20 text-amber-400 text-[10px] font-medium rounded-lg border border-amber-500/30 hover:bg-amber-600/30 transition-colors"
                                                    title="편집"
                                                >
                                                    <Edit2 size={10} /> 편집
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeConnection(conn.id); }}
                                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-600/20 text-rose-400 text-[10px] font-medium rounded-lg border border-rose-500/30 hover:bg-rose-600/30 transition-colors"
                                                    title="삭제"
                                                >
                                                    <Trash2 size={10} /> 삭제
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {connections.length === 0 && !showForm && (
                    <div className="flex flex-col items-center justify-center py-6 text-slate-500 bg-slate-900/30 rounded-xl border border-slate-800/30 mb-3">
                        <Server size={24} className="text-slate-700 mb-2" />
                        <p className="text-xs font-medium">사용자 정의 커넥션 없음</p>
                    </div>
                )}

                {/* Add/Edit Form */}
                {showForm && (
                    <div className="bg-slate-950/60 border border-cyan-500/30 rounded-xl p-4 space-y-3 animate-fade-in mb-3">
                        <div className="flex items-center justify-between mb-1">
                            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                                {editingId ? '커넥션 편집' : '새 커넥션 추가'}
                            </h4>
                            <button onClick={resetForm} className="p-1 text-slate-500 hover:text-slate-300" title="닫기"><X size={14} /></button>
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-slate-400 mb-1">커넥션 이름 *</label>
                            <input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="예: LSEG 운임 데이터" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 placeholder:text-slate-600" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-slate-400 mb-1">Base URL *</label>
                            <input type="text" value={form.baseUrl} onChange={e => setForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                                placeholder="https://api.example.com/v1" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono placeholder:text-slate-600" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-slate-400 mb-1">API Key</label>
                            <div className="relative">
                                <Lock size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input type="password" value={form.apiKey} onChange={e => setForm(prev => ({ ...prev, apiKey: e.target.value }))}
                                    placeholder="Bearer token 또는 API key" className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 placeholder:text-slate-600" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-slate-400 mb-1">Custom Headers (JSON)</label>
                            <textarea value={form.customHeaders} onChange={e => { setForm(prev => ({ ...prev, customHeaders: e.target.value })); if (headerError) validateHeaders(e.target.value); }}
                                placeholder='{"X-Custom-Header": "value"}' rows={2}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono resize-none placeholder:text-slate-600" />
                            {headerError && <p className="text-[10px] text-rose-400 mt-1">{headerError}</p>}
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button onClick={handleSubmit} disabled={!form.name.trim() || !form.baseUrl.trim()}
                                className={cn("flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors",
                                    form.name.trim() && form.baseUrl.trim() ? "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white" : "bg-slate-800 text-slate-600 cursor-not-allowed"
                                )} title={editingId ? '변경사항 저장' : '커넥션 추가'}>
                                <Check size={12} /> {editingId ? '변경 저장' : '커넥션 추가'}
                            </button>
                            <button onClick={resetForm} className="px-4 py-2 bg-slate-800 text-slate-400 text-xs rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors" title="취소">취소</button>
                        </div>
                    </div>
                )}

                {!showForm && (
                    <button onClick={() => { resetForm(); setShowForm(true); }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-cyan-500/30 rounded-xl text-xs font-medium text-slate-400 hover:text-cyan-400 transition-all"
                        title="새 커넥션 추가">
                        <Plus size={14} /> 새 커넥션 추가
                    </button>
                )}
            </div>
        </div>
    );
}
