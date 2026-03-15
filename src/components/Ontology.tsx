import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Database, Plus, Search, Trash2, Edit2, Save, X, FileText,
    CheckCircle2, RotateCcw, Box, Sparkles, ChevronDown, ChevronRight,
    FolderOpen, Folder, Ship, Anchor, Fuel, AlertTriangle, Globe,
    Shield, TrendingUp, Link2, Hash, Loader2, Zap, Navigation, BarChart3
} from 'lucide-react';
import { cn } from '../lib/utils';
import OntologyGraph from './widgets/OntologyGraph';
import Object360Panel from './widgets/Object360Panel';
import ObjectTypeWizard from './widgets/ObjectTypeWizard';
import { VESSEL_PRESETS, FLAG_OPTIONS } from '../services/maritimeIntegrationService';
import { useOntologyStore } from '../store/ontologyStore';
import { extractOntologyFromText } from '../services/geminiService';
import type { ObjectTypeDefinition, OntologyObject, OntologyObjectType, OntologyLink, OntologyLinkRelation } from '../types';

// ============================================================
// TREE CATEGORY CONFIG — Maps OntologyObjectType → UI folder
// ============================================================

interface TreeFolder {
    name: string;
    icon: React.ReactNode;
    items: OntologyObject[];
    type: 'category';
}

const TYPE_TO_CATEGORY: Record<OntologyObjectType, string> = {
    Vessel: '물리적 해사 자산',
    RiskEvent: '거시 경제 & 리스크',
    Port: '글로벌 병목 & 항만',
    Route: '항로 & 해상 경로',
    MarketIndicator: '시장 지표',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    '거시 경제 & 리스크': <AlertTriangle size={13} className="text-rose-400" />,
    '물리적 해사 자산': <Ship size={13} className="text-cyan-400" />,
    '글로벌 병목 & 항만': <Anchor size={13} className="text-purple-400" />,
    '항로 & 해상 경로': <Navigation size={13} className="text-sky-400" />,
    '시장 지표': <BarChart3 size={13} className="text-emerald-400" />,
};

const TYPE_ICONS: Record<OntologyObjectType, React.ReactNode> = {
    Vessel: <Ship size={12} className="text-cyan-400" />,
    RiskEvent: <AlertTriangle size={12} className="text-rose-400" />,
    Port: <Anchor size={12} className="text-purple-400" />,
    Route: <Navigation size={12} className="text-sky-400" />,
    MarketIndicator: <BarChart3 size={12} className="text-emerald-400" />,
};

// ============================================================
// MARITIME ONTOLOGY TEMPLATES — Bulk add pre-built object sets
// ============================================================
const MARITIME_TEMPLATES = [
    { id: 'tmpl-container', label: '🚢 컨테이너 선대', desc: 'Container fleet (Panamax, Neo-Panamax)', objectCount: 3 },
    { id: 'tmpl-tanker', label: '🛢️ 탱커 운영', desc: 'Crude/Product tanker fleet', objectCount: 4 },
    { id: 'tmpl-bulk', label: '⚓ 벌크 운송', desc: 'Capesize, Panamax, Handysize bulk', objectCount: 3 },
    { id: 'tmpl-lng', label: '❄️ LNG 공급망', desc: 'LNG carrier + terminal + route', objectCount: 5 },
    { id: 'tmpl-port', label: '🏗️ 항만 & 터미널', desc: 'Major Asian ports network', objectCount: 4 },
    { id: 'tmpl-risk', label: '⚡ 지정학 리스크', desc: 'Chokepoint + piracy + sanctions zones', objectCount: 5 },
];

function getTemplatePrompt(templateId: string): string {
    const prompts: Record<string, string> = {
        'tmpl-container': 'Generate 3 container vessels (Panamax, Neo-Panamax class) operating in Asia-Europe trade lanes with realistic IMO numbers, ports, routes, and risk scores. Include 2 ports (Shanghai, Rotterdam) and connecting routes.',
        'tmpl-tanker': 'Generate 4 crude oil tankers (VLCC, Suezmax, Aframax) operating in Middle East to Asia trade with realistic specs. Include related ports and insurance risk events.',
        'tmpl-bulk': 'Generate 3 bulk carriers (Capesize, Panamax, Handysize) in iron ore and coal trades between Australia/Brazil and Asia. Include relevant ports and BDI market indicators.',
        'tmpl-lng': 'Generate 2 LNG carriers on Qatar-Korea/Japan routes with realistic CBM capacity. Include Ras Laffan terminal, receiving terminals, routes with waypoints, and LNG spot price indicator.',
        'tmpl-port': 'Generate 4 major Asian ports (Singapore, Busan, Shanghai, Tokyo) with realistic congestion, TEU, and risk data. Include connecting routes between them.',
        'tmpl-risk': 'Generate 5 maritime risk events: Strait of Hormuz tension, Red Sea/Houthi threat, Suez Canal blockage risk, South China Sea dispute, Gulf of Guinea piracy. Include affected zones and severity.',
    };
    return prompts[templateId] || 'Generate maritime ontology objects for a global shipping operation.';
}

export default function Ontology() {
    // ---- Zustand store (SSOT for all ontology data) ----
    const storeObjects = useOntologyStore(s => s.objects);
    const storeLinks = useOntologyStore(s => s.links);
    const addObject = useOntologyStore(s => s.addObject);
    const removeObject = useOntologyStore(s => s.removeObject);
    const ingestExtractedOntology = useOntologyStore(s => s.ingestExtractedOntology);
    const updateLink = useOntologyStore(s => s.updateLink);
    const removeLinkAction = useOntologyStore(s => s.removeLink);
    const generateLinks = useOntologyStore(s => s.generateLinks);
    const isHydrated = useOntologyStore(s => s.isHydrated);

    const [isAIGenerating, setIsAIGenerating] = useState(false);
    const [isLinkGenerating, setIsLinkGenerating] = useState(false);
    const [showTemplateMenu, setShowTemplateMenu] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [showObjectWizard, setShowObjectWizard] = useState(false);
    const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
    const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
    const [isGraphFullScreen, setIsGraphFullScreen] = useState(false);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
    const treeListRef = useRef<HTMLDivElement>(null);

    const handleSelectObject = useCallback((id: string | null) => {
        setSelectedObjectId(id);
        if (id) {
            const obj = storeObjects.find(o => o.id === id);
            if (obj) {
                setExpandedFolders(prev => ({ ...prev, [TYPE_TO_CATEGORY[obj.type]]: true }));
                setTimeout(() => {
                    const el = document.getElementById(`tree-item-${id}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 100);
            }
        }
    }, [storeObjects]);

    const handleNavigateObject = useCallback((id: string) => {
        setSelectedObjectId(id);
    }, []);

    const [objectTypes, setObjectTypes] = useState<ObjectTypeDefinition[]>([]);

    const [formData, setFormData] = useState<{
        type: OntologyObjectType;
        title: string;
        description: string;
        properties: Record<string, any>;
    }>({
        type: 'Vessel',
        title: '',
        description: '',
        properties: { riskScore: 50 },
    });

    const handleResetDefaults = () => {
        if (confirm('Firestore에서 온톨로지를 다시 불러오시겠습니까?')) {
            useOntologyStore.getState().hydrateFromDB();
        }
    };

    const handleSave = () => {
        if (!formData.title.trim()) return;
        const now = new Date().toISOString();
        const newObj: OntologyObject = {
            id: `user-${formData.type.toLowerCase()}-${Date.now()}`,
            type: formData.type,
            title: formData.title,
            description: formData.description,
            properties: { ...formData.properties, riskScore: formData.properties.riskScore ?? 50 },
            metadata: { createdAt: now, updatedAt: now, source: 'user', status: 'active' },
        };
        addObject(newObj);
        closeForm();
    };

    const closeForm = () => {
        setShowAddForm(false);
        setEditingId(null);
        setFormData({ type: 'Vessel', title: '', description: '', properties: { riskScore: 50 } });
    };

    const deleteItem = (id: string) => {
        if (confirm('삭제하시겠습니까?')) {
            removeObject(id);
        }
    };

    // AI Template Generation
    const handleAIGenerate = async (templateId?: string) => {
        setIsAIGenerating(true);
        setShowTemplateMenu(false);
        try {
            const prompt = templateId
                ? getTemplatePrompt(templateId)
                : 'Generate a comprehensive maritime ontology with 3 vessels, 2 ports, 2 routes with waypoints, 1 risk event, and 2 market indicators for a Korean shipping company operating in the Middle East-Asia trade lane.';
            const existingTitles = storeObjects.map(o => o.title);
            const extracted = await extractOntologyFromText(prompt, existingTitles);
            await ingestExtractedOntology(extracted);
        } catch (err) {
            console.error('[Ontology] AI generation failed:', err);
        } finally {
            setIsAIGenerating(false);
        }
    };

    // Filter objects by search term
    const filteredItems = useMemo(() => {
        if (!searchTerm) return storeObjects;
        const lower = searchTerm.toLowerCase();
        return storeObjects.filter(o =>
            o.title.toLowerCase().includes(lower) ||
            (o.description || '').toLowerCase().includes(lower)
        );
    }, [storeObjects, searchTerm]);

    // ============================================================
    // BUILD TREE STRUCTURE: Group objects by type → category
    // ============================================================
    const treeFolders = useMemo((): TreeFolder[] => {
        const categoryMap = new Map<string, OntologyObject[]>();
        filteredItems.forEach(obj => {
            const cat = TYPE_TO_CATEGORY[obj.type] || 'Uncategorized';
            if (!categoryMap.has(cat)) categoryMap.set(cat, []);
            categoryMap.get(cat)!.push(obj);
        });

        const order = ['물리적 해사 자산', '항로 & 해상 경로', '글로벌 병목 & 항만', '거시 경제 & 리스크', '시장 지표'];
        const sorted = [...categoryMap.entries()].sort(([a], [b]) => {
            const ai = order.indexOf(a);
            const bi = order.indexOf(b);
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            return a.localeCompare(b);
        });

        return sorted.map(([name, catItems]) => ({
            name,
            icon: CATEGORY_ICONS[name] || <Folder size={13} className="text-slate-400" />,
            items: catItems,
            type: 'category' as const,
        }));
    }, [filteredItems]);

    // Auto-expand folders when search is active
    useEffect(() => {
        if (searchTerm) {
            const expanded: Record<string, boolean> = {};
            treeFolders.forEach(f => { expanded[f.name] = true; });
            setExpandedFolders(expanded);
        }
    }, [searchTerm, treeFolders]);

    const toggleFolder = (name: string) => {
        setExpandedFolders(prev => ({ ...prev, [name]: !prev[name] }));
    };

    const totalCount = filteredItems.length;

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <div className="flex h-full w-full bg-slate-950 overflow-hidden">
            {/* ========== LEFT PANEL: File Tree Explorer ========== */}
            <div className="w-[280px] shrink-0 flex flex-col bg-zinc-900/80 border-r border-zinc-800 overflow-hidden">
                {/* Sticky Search Header — Glassmorphism */}
                <div className="sticky top-0 z-10 px-3 py-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-xl shrink-0">
                    <div className="flex items-center justify-between mb-2.5">
                        <h2 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 tracking-widest uppercase">
                            <Database size={12} className="text-cyan-400" />
                            Explorer
                        </h2>
                        <span className="text-[9px] text-slate-500 bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
                            {totalCount}
                        </span>
                    </div>
                    <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            placeholder="노드 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all placeholder-slate-600"
                        />
                    </div>
                </div>

                {/* Toolbar */}
                <div className="px-2 py-1.5 border-b border-zinc-800/60 flex items-center gap-1 shrink-0 bg-zinc-900/40">
                    <button
                        onClick={() => {
                            setFormData({ type: 'Vessel', title: '', description: '', properties: { riskScore: 50 } });
                            setShowAddForm(true);
                        }}
                        className="flex items-center gap-1 px-2 py-1 bg-cyan-900/30 hover:bg-cyan-800/40 text-cyan-400 hover:text-cyan-300 text-[10px] font-bold rounded transition-colors border border-cyan-800/40"
                        title="오브제 추가"
                    >
                        <Plus size={11} /> 오브제 추가
                    </button>
                    <div className="relative">
                        <button
                            onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                            disabled={isAIGenerating}
                            className="flex items-center gap-1 px-2 py-1 bg-violet-900/30 hover:bg-violet-800/40 text-violet-400 hover:text-violet-300 text-[10px] font-bold rounded transition-colors border border-violet-800/40 disabled:opacity-50"
                            title="AI 템플릿 생성"
                        >
                            {isAIGenerating ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                            AI 초안
                        </button>
                        {showTemplateMenu && (
                            <div className="absolute top-full left-0 mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 py-1">
                                <button
                                    onClick={() => handleAIGenerate()}
                                    className="w-full text-left px-3 py-2 text-[11px] text-slate-300 hover:bg-zinc-800 flex items-center gap-2"
                                >
                                    <Sparkles size={12} className="text-violet-400" /> 자동 해운 온톨로지 생성
                                </button>
                                <div className="border-t border-zinc-800 my-1" />
                                {MARITIME_TEMPLATES.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => handleAIGenerate(t.id)}
                                        className="w-full text-left px-3 py-1.5 text-[11px] text-slate-400 hover:bg-zinc-800 hover:text-slate-200"
                                    >
                                        {t.label} <span className="text-[9px] text-slate-600 ml-1">({t.objectCount})</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex-1" />
                    <button
                        onClick={handleResetDefaults}
                        className="p-1 text-slate-500 hover:text-amber-400 rounded transition-colors"
                        title="초기화"
                    >
                        <RotateCcw size={11} />
                    </button>
                </div>

                {/* AI Generation Progress */}
                {isAIGenerating && (
                    <div className="px-3 py-2 bg-violet-950/30 border-b border-violet-800/30 flex items-center gap-2">
                        <Loader2 size={12} className="animate-spin text-violet-400" />
                        <span className="text-[10px] text-violet-300 animate-pulse">AI가 해운 온톨로지를 생성 중입니다...</span>
                    </div>
                )}

                {/* ========== FILE TREE ========== */}
                <div ref={treeListRef} className="flex-1 overflow-y-auto custom-scrollbar px-1.5 py-1 min-h-0">
                    {!isHydrated ? (
                        <div className="flex items-center justify-center gap-2 mt-10">
                            <Loader2 size={14} className="animate-spin text-cyan-400" />
                            <span className="text-xs text-slate-500">Firestore 로딩 중...</span>
                        </div>
                    ) : treeFolders.length === 0 ? (
                        <div className="text-center text-xs text-slate-500 mt-10">검색 결과 없음</div>
                    ) : null}

                    {treeFolders.map(folder => {
                        const isExpanded = expandedFolders[folder.name] ?? (folder.name === '물리적 해사 자산');
                        return (
                            <div key={folder.name} className="mb-px select-none">
                                {/* Folder row */}
                                <button
                                    onClick={() => toggleFolder(folder.name)}
                                    className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-800/50 text-slate-300 transition-colors group/folder"
                                >
                                    <ChevronRight
                                        size={11}
                                        className={cn(
                                            "text-slate-500 transition-transform duration-200 shrink-0",
                                            isExpanded && "rotate-90"
                                        )}
                                    />
                                    {isExpanded
                                        ? <FolderOpen size={13} className="text-amber-500 shrink-0" />
                                        : <Folder size={13} className="text-amber-500/70 shrink-0" />
                                    }
                                    <span className="text-[11px] font-semibold tracking-wide truncate">{folder.name}</span>
                                    <span className="ml-auto text-[9px] text-slate-600 bg-zinc-800/60 px-1.5 rounded shrink-0">
                                        {folder.items.length}
                                    </span>
                                </button>

                                {/* Folder children */}
                                {isExpanded && (
                                    <div className="ml-[14px] pl-2.5 border-l border-zinc-700/50 space-y-px pb-0.5">
                                        {folder.items.map(item => {
                                            const isSelected = selectedObjectId === item.id;
                                            const effectiveRisk = (item.properties?.riskScore as number) ?? 20;

                                            return (
                                                <div
                                                    id={`tree-item-${item.id}`}
                                                    key={item.id}
                                                    onClick={() => handleSelectObject(item.id)}
                                                    className={cn(
                                                        "group/item flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-all duration-150 relative",
                                                        "before:absolute before:left-[-11px] before:top-1/2 before:w-2 before:h-px before:bg-zinc-700/50",
                                                        isSelected
                                                            ? "bg-blue-500/10 text-blue-400 border-l-2 border-l-blue-400 -ml-px pl-[9px]"
                                                            : "hover:bg-zinc-800/50 text-slate-300"
                                                    )}
                                                >
                                                    <div className="shrink-0">
                                                        {TYPE_ICONS[item.type] || <FileText size={11} className="text-slate-400" />}
                                                    </div>

                                                    {/* Title with search highlight */}
                                                    <span className={cn(
                                                        "text-[11px] truncate flex-1 leading-tight",
                                                        isSelected ? "font-semibold" : "font-medium"
                                                    )} dangerouslySetInnerHTML={searchTerm ? {
                                                        __html: item.title.replace(
                                                            new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                                                            '<mark class="bg-yellow-400/30 text-yellow-200 rounded-sm px-0.5">$1</mark>'
                                                        )
                                                    } : undefined}>
                                                        {searchTerm ? undefined : item.title}
                                                    </span>

                                                    {/* Risk dot */}
                                                    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                                                        effectiveRisk >= 70 ? 'bg-rose-500 animate-pulse' : effectiveRisk >= 40 ? 'bg-amber-500' : 'bg-emerald-500'
                                                    )} />

                                                    {/* Quick Actions — hover reveal */}
                                                    <div className="opacity-0 group-hover/item:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity duration-150">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                                                            className="p-0.5 text-slate-500 hover:text-rose-400 rounded transition-colors"
                                                            title="삭제"
                                                        >
                                                            <Trash2 size={10} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ========== RIGHT PANEL: Graph + Form + Object360 ========== */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
                {showObjectWizard && (
                    <ObjectTypeWizard
                        onClose={() => setShowObjectWizard(false)}
                        onSave={(obj) => {
                            setObjectTypes([obj, ...objectTypes]);
                            setShowObjectWizard(false);
                        }}
                    />
                )}

                {showAddForm ? (
                    /* ========== ADD FORM (replaces graph when open) ========== */
                    <div className="flex-1 bg-slate-900 flex flex-col overflow-hidden animate-slide-up">
                        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-800/30 shrink-0">
                            <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                                {TYPE_ICONS[formData.type]}
                                {editingId ? '수정하기' : '새 온톨로지 객체 등록'}
                            </h3>
                            <button onClick={closeForm} className="text-slate-500 hover:text-slate-300" title="닫기">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-8 flex-1 overflow-y-auto custom-scrollbar space-y-6 max-w-2xl">
                            {/* Object Type Selector */}
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">객체 유형 (Type)</label>
                                <div className="flex flex-wrap gap-2">
                                    {(Object.keys(TYPE_TO_CATEGORY) as OntologyObjectType[]).map(t => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, type: t }))}
                                            className={cn(
                                                'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-all',
                                                formData.type === t
                                                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                                                    : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:bg-slate-700'
                                            )}
                                        >
                                            {TYPE_ICONS[t]} {t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">이름 (Title) *</label>
                                <input type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="예: VL BREEZE, Singapore Port, Hormuz Tension" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">설명 (Description)</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="객체에 대한 설명을 입력하세요."
                                    rows={4}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 resize-none custom-scrollbar"
                                />
                            </div>

                            {/* Vessel-specific fields */}
                            {formData.type === 'Vessel' && (
                                <div className="border border-cyan-900/30 bg-cyan-950/10 p-5 rounded-xl space-y-5">
                                    <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest flex items-center gap-2 border-b border-cyan-900/50 pb-2">
                                        <Ship size={12} /> 선박 상세 정보
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {VESSEL_PRESETS.map(preset => (
                                            <button
                                                key={preset.id}
                                                type="button"
                                                onClick={() => setFormData(prev => ({
                                                    ...prev,
                                                    properties: { ...prev.properties, vesselType: preset.defaults.vesselType, dwt: preset.defaults.dwt, loa: preset.defaults.loa, beam: preset.defaults.beam },
                                                }))}
                                                className={cn('px-2.5 py-1.5 text-[10px] font-bold rounded-lg border transition-all',
                                                    formData.properties?.vesselType === preset.defaults.vesselType
                                                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                                                        : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:bg-slate-700'
                                                )}
                                            >
                                                {preset.icon} {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-medium text-slate-500 mb-1">IMO</label>
                                            <input type="text" value={formData.properties?.imo || ''} onChange={e => setFormData(prev => ({ ...prev, properties: { ...prev.properties, imo: e.target.value } }))} placeholder="9926738" maxLength={7} className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-medium text-slate-500 mb-1">Flag</label>
                                            <select value={formData.properties?.flag || ''} onChange={e => setFormData(prev => ({ ...prev, properties: { ...prev.properties, flag: e.target.value } }))} className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500">
                                                <option value="">선택...</option>
                                                {FLAG_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Risk Score */}
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">리스크 점수 (Risk Score)</label>
                                <div className="flex items-center gap-3">
                                    <input type="range" min={0} max={100} value={formData.properties?.riskScore ?? 50} onChange={e => setFormData(prev => ({ ...prev, properties: { ...prev.properties, riskScore: Number(e.target.value) } }))} className="flex-1 accent-cyan-500" />
                                    <span className={cn("text-sm font-bold w-8", (formData.properties?.riskScore ?? 50) >= 70 ? 'text-rose-400' : (formData.properties?.riskScore ?? 50) >= 40 ? 'text-amber-400' : 'text-emerald-400')}>{formData.properties?.riskScore ?? 50}</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-800 bg-slate-800/30 flex justify-end gap-3 shrink-0">
                            <button onClick={closeForm} className="px-5 py-2 text-sm text-slate-300 hover:text-white transition-colors">취소</button>
                            <button
                                onClick={handleSave}
                                className="px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 text-white bg-cyan-600 hover:bg-cyan-500 shadow-cyan-900/20"
                            >
                                <Save size={14} /> 저장하기
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ========== GRAPH + 360 Inspector ========== */
                    <div className="flex-1 flex overflow-hidden min-h-0">
                        <div className="flex-1 bg-slate-950 overflow-hidden relative min-h-0">
                            <OntologyGraph
                                onSelectObject={handleSelectObject}
                                selectedObjectId={selectedObjectId}
                                onSelectLink={(id) => { setSelectedLinkId(id); if (id) setSelectedObjectId(null); }}
                                selectedLinkId={selectedLinkId}
                                isFullScreen={isGraphFullScreen}
                                onToggleFullScreen={() => setIsGraphFullScreen(!isGraphFullScreen)}
                            />
                        </div>
                        {/* Right 360 Pane / Edge Inspector */}
                        {selectedObjectId ? (
                            <Object360Panel
                                objectId={selectedObjectId}
                                onClose={() => setSelectedObjectId(null)}
                                onNavigate={handleNavigateObject}
                            />
                        ) : selectedLinkId ? (() => {
                            const link = storeLinks.find(l => l.id === selectedLinkId);
                            if (!link) return null;
                            const srcObj = storeObjects.find(o => o.id === link.sourceId);
                            const tgtObj = storeObjects.find(o => o.id === link.targetId);

                            const RELATION_OPTS: { value: OntologyLinkRelation; label: string }[] = [
                                { value: 'OPERATES_AT', label: '운항 위치' },
                                { value: 'SAILS', label: '항해 경로' },
                                { value: 'CALLS_AT', label: '기항' },
                                { value: 'INSURES', label: '보험 관계' },
                                { value: 'TRIGGERS', label: '유발' },
                                { value: 'EXPOSES_TO', label: '리스크 노출' },
                                { value: 'AFFECTS_COST', label: '비용 영향' },
                                { value: 'AT_RISK', label: '위험 근접' },
                                { value: 'NEAR', label: '지리적 근접' },
                                { value: 'IMPACTS', label: '인과 영향' },
                                { value: 'COMPETES_WITH', label: '경쟁 관계' },
                                { value: 'OPERATES_ON', label: '운항 경로' },
                                { value: 'TRANSITS', label: '통과' },
                                { value: 'LOCATED_AT', label: '현재 위치' },
                                { value: 'MONITORS', label: '모니터링' },
                                { value: 'DEPENDS_ON', label: '의존' },
                                { value: 'HEDGES', label: '헤지' },
                                { value: 'CONSUMES_FUEL', label: '연료 소비' },
                            ];

                            return (
                                <div className="w-[360px] shrink-0 bg-zinc-900/60 border-l border-zinc-800 flex flex-col overflow-y-auto custom-scrollbar">
                                    {/* Header */}
                                    <div className="p-4 border-b border-zinc-800/60 flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
                                            <Link2 size={16} className="text-violet-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-bold text-white truncate">신경삭 편집</h3>
                                            <p className="text-[10px] text-zinc-500 font-mono truncate">{link.id}</p>
                                        </div>
                                        <button onClick={() => setSelectedLinkId(null)} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300">
                                            <X size={14} />
                                        </button>
                                    </div>

                                    {/* Source → Target */}
                                    <div className="p-4 space-y-3">
                                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">연결 노드</div>
                                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-800/40 border border-zinc-700/30">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[9px] text-zinc-500 uppercase">Source</div>
                                                <div className="text-xs text-cyan-300 font-semibold truncate">{srcObj?.title || link.sourceId}</div>
                                                <div className="text-[9px] text-zinc-600 font-mono">{srcObj?.type || '?'}</div>
                                            </div>
                                            <div className="text-violet-400 text-lg">→</div>
                                            <div className="flex-1 min-w-0 text-right">
                                                <div className="text-[9px] text-zinc-500 uppercase">Target</div>
                                                <div className="text-xs text-cyan-300 font-semibold truncate">{tgtObj?.title || link.targetId}</div>
                                                <div className="text-[9px] text-zinc-600 font-mono">{tgtObj?.type || '?'}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Relation Type */}
                                    <div className="px-4 pb-3 space-y-2">
                                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">관계 유형</div>
                                        <select
                                            value={link.relationType}
                                            onChange={(e) => updateLink(link.id, { relationType: e.target.value as OntologyLinkRelation })}
                                            className="w-full bg-zinc-800 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 outline-none"
                                        >
                                            {RELATION_OPTS.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label} ({opt.value})</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Weight Slider */}
                                    <div className="px-4 pb-4 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">가중치 (Weight)</div>
                                            <span className="text-xs font-mono text-violet-400">{link.weight.toFixed(2)}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.05"
                                            value={link.weight}
                                            onChange={(e) => updateLink(link.id, { weight: parseFloat(e.target.value) })}
                                            className="w-full accent-violet-500"
                                        />
                                        <div className="flex justify-between text-[9px] text-zinc-600">
                                            <span>약함 (0.0)</span>
                                            <span>강함 (1.0)</span>
                                        </div>
                                    </div>

                                    {/* Metadata */}
                                    {link.metadata?.createdAt && (
                                        <div className="px-4 pb-3">
                                            <div className="text-[9px] text-zinc-600">생성: {new Date(link.metadata.createdAt).toLocaleString('ko-KR')}</div>
                                        </div>
                                    )}

                                    {/* Delete button */}
                                    <div className="mt-auto p-4 border-t border-zinc-800/60">
                                        <button
                                            onClick={() => { removeLinkAction(link.id); setSelectedLinkId(null); }}
                                            className="w-full py-2 rounded-lg text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Trash2 size={12} /> 신경삭 삭제
                                        </button>
                                    </div>
                                </div>
                            );
                        })() : (
                            <div className="w-[360px] shrink-0 bg-zinc-900/60 border-l border-zinc-800 flex flex-col items-center justify-center text-center p-8">
                                <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-zinc-700/30 flex items-center justify-center mb-4">
                                    <Database size={24} className="text-zinc-600" />
                                </div>
                                <p className="text-sm font-medium text-zinc-500 mb-1">자산 또는 신경삭을 선택하여</p>
                                <p className="text-sm font-medium text-zinc-500">상세 속성을 확인하세요</p>
                                <p className="text-[10px] text-zinc-600 mt-3 max-w-[200px] leading-relaxed">
                                    좌측 트리 또는 중앙 그래프에서 노드·엣지를 클릭하면 인스펙터가 표시됩니다.
                                </p>

                                {/* AI 신경삭 생성 Button */}
                                <button
                                    onClick={async () => {
                                        setIsLinkGenerating(true);
                                        try {
                                            const count = await generateLinks();
                                            console.info(`[AI] Generated ${count} neural links`);
                                        } catch (err) {
                                            console.error('[AI] Link generation failed:', err);
                                        } finally {
                                            setIsLinkGenerating(false);
                                        }
                                    }}
                                    disabled={isLinkGenerating}
                                    className="mt-6 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-600/80 to-purple-600/80 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-900/30 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLinkGenerating ? (
                                        <><Loader2 size={14} className="animate-spin" /> AI 생성 중...</>
                                    ) : (
                                        <><Sparkles size={14} /> AI 신경삭 자동 생성</>
                                    )}
                                </button>
                                <p className="text-[9px] text-zinc-600 mt-2">객체 간 관계를 AI가 자동으로 분석합니다</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
