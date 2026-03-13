import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Database, Plus, Search, Trash2, Edit2, Save, X, FileText,
    CheckCircle2, RotateCcw, Box, Sparkles, ChevronDown, ChevronRight,
    FolderOpen, Folder, Ship, Anchor, Fuel, AlertTriangle, Globe,
    Shield, TrendingUp, Link2, Hash
} from 'lucide-react';
import { cn } from '../lib/utils';
import OntologyGraph from './widgets/OntologyGraph';
import Object360Panel from './widgets/Object360Panel';
import ObjectTypeWizard from './widgets/ObjectTypeWizard';
import { VESSEL_PRESETS, FLAG_OPTIONS } from '../services/maritimeIntegrationService';
import type { ObjectTypeDefinition } from '../types';

interface OntologyItem {
    id: string;
    category: string;
    title: string;
    content: string;
    lastUpdated: string;
    isActive: boolean;
    type?: 'document' | 'factor' | 'object_instance';
    subCategory?: string;
    defaultValue?: number;
    vesselData?: {
        vessel_type: string;
        location: string;
        riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
    };
    objectTypeId?: string;
    properties?: Record<string, any>;
}

// ============================================================
// TREE CATEGORY CONFIG
// ============================================================

interface TreeFolder {
    name: string;
    icon: React.ReactNode;
    items: OntologyItem[];
    type: 'category';
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    '거시 경제 & 리스크': <AlertTriangle size={13} className="text-rose-400" />,
    '물리적 해사 자산': <Ship size={13} className="text-cyan-400" />,
    '글로벌 병목 & 항만': <Anchor size={13} className="text-purple-400" />,
    'Object Instance': <Sparkles size={13} className="text-cyan-400" />,
};

const ITEM_TYPE_ICONS: Record<string, React.ReactNode> = {
    'object_instance': <Sparkles size={12} className="text-cyan-400" />,
    'factor': <Box size={12} className="text-amber-400" />,
    'document': <FileText size={12} className="text-slate-400" />,
};

const RISK_DOT: Record<string, string> = {
    'Critical': 'bg-rose-500',
    'High': 'bg-amber-500',
    'Medium': 'bg-cyan-500',
    'Low': 'bg-emerald-500',
};

export default function Ontology() {
    // Pre-seeded Object Type Definitions
    const DEFAULT_OBJECT_TYPES: ObjectTypeDefinition[] = [
        {
            id: 'FleetVessel',
            displayName: 'Vessel (선박)',
            pluralDisplayName: 'Vessels (선박들)',
            description: '운영 선대에 속하는 개별 선박 자산을 나타내는 객체 타입입니다.',
            icon: 'Ship',
            color: '#06b6d4',
            groups: ['운영 자산'],
            backingDatasource: 'ds_fleet_raw',
            properties: [
                { id: 'vesselId', displayName: 'Vessel ID', baseType: 'string', isPrimaryKey: true, isTitleKey: false, mappedColumn: 'vessel_id' },
                { id: 'name', displayName: 'Name (선명)', baseType: 'string', isPrimaryKey: false, isTitleKey: true, mappedColumn: 'name' },
                { id: 'type', displayName: 'Type (선종)', baseType: 'string', isPrimaryKey: false, isTitleKey: false, mappedColumn: 'type' },
                { id: 'location', displayName: 'Location (위치)', baseType: 'string', isPrimaryKey: false, isTitleKey: false, mappedColumn: 'location' },
                { id: 'riskScore', displayName: 'Risk Score', baseType: 'number', isPrimaryKey: false, isTitleKey: false, mappedColumn: 'risk_score' },
            ]
        }
    ];

    const defaultOntology: OntologyItem[] = [
        // ── Physical Vessel Objects (editable/deletable) ──
        { id: 'vessel-vl-breeze', category: '물리적 해사 자산', title: '🚢 VL BREEZE', content: 'VLCC 319K DWT Crude Oil Tanker. 대한민국 국적 (IMO 9926738). Ras Laffan → Ulsan. 현재 Persian Gulf 대기.', lastUpdated: new Date().toLocaleDateString('ko-KR'), isActive: true, type: 'object_instance', objectTypeId: 'FleetVessel', properties: { vesselId: 'V-001', name: 'VL BREEZE', type: 'Crude Oil Tanker (VLCC)', location: 'Persian Gulf — Ras Laffan OPL', riskScore: 72 } },
        { id: 'vessel-star-maria', category: '물리적 해사 자산', title: '🚢 STAR MARIA', content: 'Bulk Carrier 82K DWT. 마셜아일랜드 국적 (IMO 9401489). Sharjah → Shinas. Arabian Sea 항해 중.', lastUpdated: new Date().toLocaleDateString('ko-KR'), isActive: true, type: 'object_instance', objectTypeId: 'FleetVessel', properties: { vesselId: 'V-002', name: 'STAR MARIA', type: 'Bulk Carrier', location: 'Arabian Sea — En Route to Shinas', riskScore: 55 } },
        // ── Macro & Risk Documents ──
        { id: 'doc_hormuz_sop', category: '거시 경제 & 리스크', title: '페르시아만/호르무즈 해협 통항 행동 지침', content: '이란/이스라엘 통항 레벨 3 격상. UKMTO 보고 필수. 모든 선박은 사전 72시간 통보 의무.', lastUpdated: new Date().toLocaleDateString('ko-KR'), isActive: true, type: 'document' },
        { id: 'doc_imo_cii', category: '거시 경제 & 리스크', title: 'IMO CII/EEXI 규제 달성률 보고', content: 'IMO 환경 규제 대응을 위한 선대 효율성 달성 지표. 위반 시 운항 정지 리스크.', lastUpdated: new Date().toLocaleDateString('ko-KR'), isActive: true, type: 'document' },
    ];

    const [items, setItems] = useState<OntologyItem[]>(() => {
        try {
            const saved = localStorage.getItem('sidecar_ontology');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.length > 0) return parsed;
            }
        } catch { return []; }
        return defaultOntology;
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [showObjectWizard, setShowObjectWizard] = useState(false);
    const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
    const treeListRef = useRef<HTMLDivElement>(null);

    const handleSelectObject = useCallback((id: string | null) => {
        setSelectedObjectId(id);
        // Graph → Tree: auto-expand the folder containing this object
        if (id) {
            const item = items.find(i => i.id === id);
            if (item) {
                setExpandedFolders(prev => ({ ...prev, [item.category]: true }));
                // Scroll to the item in tree
                setTimeout(() => {
                    const el = document.getElementById(`tree-item-${id}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 100);
            }
        }
    }, [items]);

    const handleNavigateObject = useCallback((id: string) => {
        setSelectedObjectId(id);
    }, []);

    const [objectTypes, setObjectTypes] = useState<ObjectTypeDefinition[]>(() => {
        try {
            const saved = localStorage.getItem('sidecar_object_types');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.length > 0) return parsed;
            }
        } catch { return DEFAULT_OBJECT_TYPES; }
        return DEFAULT_OBJECT_TYPES;
    });

    useEffect(() => {
        localStorage.setItem('sidecar_object_types', JSON.stringify(objectTypes));
    }, [objectTypes]);

    const [formData, setFormData] = useState<{
        category: string;
        title: string;
        content: string;
        type: 'document' | 'factor' | 'object_instance';
        subCategory?: string;
        defaultValue?: number;
        vesselData?: {
            vessel_type: string;
            location: string;
            riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
        };
        objectTypeId?: string;
        properties?: Record<string, any>;
    }>({
        category: '내부 지침',
        title: '',
        content: '',
        type: 'document',
        subCategory: '일반',
        defaultValue: 50,
        properties: {}
    });

    const handleResetDefaults = () => {
        if (confirm('모든 사용자 데이터를 삭제하고 AI 권장 기본 해양/시나리오 데이터로 초기화하시겠습니까?')) {
            setItems(defaultOntology);
        }
    };

    useEffect(() => {
        localStorage.setItem('sidecar_ontology', JSON.stringify(items));
        window.dispatchEvent(new Event('ontology_updated'));
    }, [items]);

    const handleSave = () => {
        if (!formData.title.trim() || !formData.content.trim()) return;
        if (editingId) {
            setItems(items.map(item => item.id === editingId ? { ...item, ...formData, lastUpdated: new Date().toLocaleDateString('ko-KR') } : item));
        } else {
            setItems([{
                id: formData.type === 'factor' ? `factor_${Date.now()}` : Date.now().toString(),
                ...formData,
                lastUpdated: new Date().toLocaleDateString('ko-KR'),
                isActive: true
            }, ...items]);
        }
        closeForm();
    };

    const closeForm = () => {
        setShowAddForm(false);
        setEditingId(null);
        setFormData({ category: '내부 지침', title: '', content: '', type: 'document' });
    };

    const editItem = (item: OntologyItem) => {
        setFormData({
            category: item.category,
            title: item.title,
            content: item.content,
            type: item.type || 'document',
            subCategory: item.subCategory || '일반',
            defaultValue: item.defaultValue || 50,
            vesselData: item.vesselData
        });
        setEditingId(item.id);
        setShowAddForm(true);
    };

    const deleteItem = (id: string) => {
        if (confirm('삭제하시겠습니까?')) {
            setItems(items.filter(item => item.id !== id));
        }
    };

    const toggleActive = (id: string) => {
        setItems(items.map(item => item.id === id ? { ...item, isActive: !item.isActive } : item));
    };

    const filteredItems = items.filter(item =>
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // ============================================================
    // BUILD TREE STRUCTURE: Group items by category
    // ============================================================
    const treeFolders = useMemo((): TreeFolder[] => {
        const categoryMap = new Map<string, OntologyItem[]>();
        filteredItems.forEach(item => {
            const cat = item.category || 'Uncategorized';
            if (!categoryMap.has(cat)) categoryMap.set(cat, []);
            categoryMap.get(cat)!.push(item);
        });

        // Sort categories for consistent order
        const order = ['물리적 해사 자산', '거시 경제 & 리스크', '글로벌 병목 & 항만'];
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
                            setFormData({
                                category: '물리적 해사 자산',
                                title: '',
                                content: '',
                                type: 'object_instance',
                                objectTypeId: 'FleetVessel',
                                properties: { vesselId: `V-${String(Date.now()).slice(-4)}`, name: '', type: '', location: '', riskScore: 50 },
                            });
                            setShowAddForm(true);
                        }}
                        className="flex items-center gap-1 px-2 py-1 bg-cyan-900/30 hover:bg-cyan-800/40 text-cyan-400 hover:text-cyan-300 text-[10px] font-bold rounded transition-colors border border-cyan-800/40"
                        title="오브제 추가"
                    >
                        <Plus size={11} /> 오브제 추가
                    </button>
                    <button
                        onClick={() => { setFormData({ category: '거시 경제 & 리스크', title: '', content: '', type: 'document' }); setShowAddForm(true); }}
                        className="flex items-center gap-1 px-2 py-1 bg-zinc-800/60 hover:bg-zinc-700 text-slate-400 hover:text-slate-200 text-[10px] font-medium rounded transition-colors border border-zinc-700/50"
                        title="문서 추가"
                    >
                        <FileText size={10} /> 문서
                    </button>
                    <div className="flex-1" />
                    <button
                        onClick={() => setShowObjectWizard(true)}
                        className="p-1 text-slate-500 hover:text-cyan-400 rounded transition-colors"
                        title="Create Object Type"
                    >
                        <Sparkles size={11} />
                    </button>
                    <button
                        onClick={handleResetDefaults}
                        className="p-1 text-slate-500 hover:text-amber-400 rounded transition-colors"
                        title="초기화"
                    >
                        <RotateCcw size={11} />
                    </button>
                </div>

                {/* Object Types are intentionally not rendered as tree nodes.
                    Vessels are physical objects, not abstract schema types.
                    The graph shows real object instances from the Zustand store. */}

                {/* ========== FILE TREE ========== */}
                <div ref={treeListRef} className="flex-1 overflow-y-auto custom-scrollbar px-1.5 py-1 min-h-0">
                    {treeFolders.length === 0 && (
                        <div className="text-center text-xs text-slate-500 mt-10">검색 결과 없음</div>
                    )}

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

                                {/* Folder children — VS Code depth guide */}
                                {isExpanded && (
                                    <div className="ml-[14px] pl-2.5 border-l border-zinc-700/50 space-y-px pb-0.5">
                                        {folder.items.map(item => {
                                            const isSelected = selectedObjectId === item.id;
                                            const riskScore = item.properties?.riskScore;
                                            const riskLevel = item.vesselData?.riskLevel;
                                            const effectiveRisk = riskScore ?? (riskLevel === 'Critical' ? 90 : riskLevel === 'High' ? 70 : riskLevel === 'Medium' ? 50 : 20);

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
                                                            : item.isActive
                                                                ? "hover:bg-zinc-800/50 text-slate-300"
                                                                : "hover:bg-zinc-800/30 text-slate-500 opacity-50"
                                                    )}
                                                >
                                                    <div className="shrink-0">
                                                        {ITEM_TYPE_ICONS[item.type || 'document'] || <FileText size={11} className="text-slate-400" />}
                                                    </div>

                                                    {/* Title with search highlight */}
                                                    <span className={cn(
                                                        "text-sm truncate flex-1 leading-tight",
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
                                                            onClick={(e) => { e.stopPropagation(); editItem(item); }}
                                                            className="p-0.5 text-slate-500 hover:text-cyan-400 rounded transition-colors"
                                                            title="편집"
                                                        >
                                                            <Edit2 size={10} />
                                                        </button>
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
                    /* ========== FORM (replaces graph when open) ========== */
                    <div className="flex-1 bg-slate-900 flex flex-col overflow-hidden animate-slide-up">
                        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-800/30 shrink-0">
                            <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                                {formData.type === 'factor' ? <Box size={16} className="text-amber-400" /> : formData.type === 'object_instance' ? <Sparkles size={16} className="text-cyan-400" /> : <FileText size={16} className="text-cyan-400" />}
                                {editingId ? '수정하기' : (formData.type === 'factor' ? '새로운 경영 요소(Factor) 등록' : formData.type === 'object_instance' ? '새 객체 인스턴스 등록' : '새로운 지식 문서 등록')}
                            </h3>
                            <button onClick={closeForm} className="text-slate-500 hover:text-slate-300" title="닫기">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-8 flex-1 overflow-y-auto custom-scrollbar space-y-6 max-w-2xl">
                            {formData.type !== 'object_instance' && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">구분</label>
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                                            <input type="radio" checked={formData.type === 'document'} onChange={() => setFormData({ ...formData, type: 'document', category: '내부 지침' })} className="accent-cyan-500" />
                                            문서/가이드라인
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                                            <input type="radio" checked={formData.type === 'factor'} onChange={() => setFormData({ ...formData, type: 'factor', category: '운영 요소' })} className="accent-amber-500" />
                                            경영 요소(Factor)
                                        </label>
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">카테고리</label>
                                <input type="text" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">이름 (Title)</label>
                                <input type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder={formData.type === 'factor' ? "예: 글로벌 Fleet 규모, 아시아 권역 리스크" : "예: 호르무즈 해협 우회 가이드라인"} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" />
                            </div>

                            {formData.type === 'factor' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5">상세 분류 (Sub-category)</label>
                                        <select value={formData.subCategory} onChange={e => setFormData({ ...formData, subCategory: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500">
                                            <option value="자산 (Asset)">자산 (Asset: Fleet, 시설 등)</option>
                                            <option value="인사 (HR)">인사 및 조직 (HR)</option>
                                            <option value="재무 (Finance)">재무 및 예산 (Finance)</option>
                                            <option value="재고 (Inventory)">재고 및 부품 (Inventory)</option>
                                            <option value="규제 (Compliance)">사내 규칙 및 규제 (Compliance)</option>
                                            <option value="기타 (Other)">기타 운영 요소</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5">초기 기본값 설정 (Default Value)</label>
                                        <div className="flex items-center gap-3">
                                            <input type="range" min="0" max="100" value={formData.defaultValue} onChange={e => setFormData({ ...formData, defaultValue: parseInt(e.target.value) })} className="flex-1 accent-amber-500" />
                                            <span className="text-sm font-bold text-amber-500 w-8">{formData.defaultValue}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {formData.type === 'factor' && formData.subCategory === '자산 (Asset)' && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border border-rose-900/30 bg-rose-950/10 p-4 rounded-lg">
                                    <div className="sm:col-span-3">
                                        <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <Box size={10} /> 자산(Fleet Status) 연동 설정
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-slate-400 mb-1.5 uppercase">선종 (Vessel Type)</label>
                                        <input type="text" placeholder="예: VLCC, Suezmax" value={formData.vesselData?.vessel_type || ''} onChange={e => setFormData({ ...formData, vesselData: { ...formData.vesselData, vessel_type: e.target.value, location: formData.vesselData?.location || '', riskLevel: formData.vesselData?.riskLevel || 'Low' } })} className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-slate-400 mb-1.5 uppercase">위치 (Location)</label>
                                        <input type="text" placeholder="예: 중동, 북해 등" value={formData.vesselData?.location || ''} onChange={e => setFormData({ ...formData, vesselData: { ...formData.vesselData, location: e.target.value, vessel_type: formData.vesselData?.vessel_type || '', riskLevel: formData.vesselData?.riskLevel || 'Low' } })} className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-slate-400 mb-1.5 uppercase">기본 리스크 (Risk)</label>
                                        <select value={formData.vesselData?.riskLevel || 'Low'} onChange={e => setFormData({ ...formData, vesselData: { ...formData.vesselData, riskLevel: e.target.value as any, vessel_type: formData.vesselData?.vessel_type || '', location: formData.vesselData?.location || '' } })} className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500">
                                            <option value="Low">Low</option>
                                            <option value="Medium">Medium</option>
                                            <option value="High">High</option>
                                            <option value="Critical">Critical</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {formData.type === 'object_instance' && formData.objectTypeId && (
                                <div className="border border-cyan-900/30 bg-cyan-950/10 p-5 rounded-xl space-y-5">
                                    <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest flex items-center gap-2 border-b border-cyan-900/50 pb-2">
                                        <Ship size={12} /> 선박 등록 — Vessel Preset
                                    </p>

                                    {/* Vessel Type Preset Selector */}
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-2">선종 프리셋 (Quick Select)</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {VESSEL_PRESETS.map(preset => (
                                                <button
                                                    key={preset.id}
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({
                                                        ...prev,
                                                        properties: {
                                                            ...prev.properties,
                                                            type: preset.defaults.vesselType,
                                                            dwt: preset.defaults.dwt,
                                                            loa: preset.defaults.loa,
                                                            beam: preset.defaults.beam,
                                                            speedCp: preset.defaults.speedCp,
                                                            avgIfo: preset.defaults.avgIfo,
                                                        },
                                                    }))}
                                                    title={preset.labelKo}
                                                    className={cn(
                                                        'px-2.5 py-1.5 text-[10px] font-bold rounded-lg border transition-all',
                                                        formData.properties?.type === preset.defaults.vesselType
                                                            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                                                            : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                                                    )}
                                                >
                                                    {preset.icon} {preset.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Core Identity Fields */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <label className="block text-xs font-medium text-slate-400 mb-1.5">선명 (Vessel Name) *</label>
                                            <input
                                                type="text"
                                                value={formData.properties?.name || ''}
                                                onChange={e => setFormData(prev => ({ ...prev, title: `🚢 ${e.target.value}`, properties: { ...prev.properties, name: e.target.value } }))}
                                                placeholder="예: VL BREEZE"
                                                className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1.5">IMO 번호</label>
                                            <input
                                                type="text"
                                                value={formData.properties?.imo || ''}
                                                onChange={e => setFormData(prev => ({ ...prev, properties: { ...prev.properties, imo: e.target.value } }))}
                                                placeholder="7자리 (예: 9926738)"
                                                maxLength={7}
                                                className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1.5">MMSI</label>
                                            <input
                                                type="text"
                                                value={formData.properties?.mmsi || ''}
                                                onChange={e => setFormData(prev => ({ ...prev, properties: { ...prev.properties, mmsi: e.target.value } }))}
                                                placeholder="9자리 (예: 441345000)"
                                                maxLength={9}
                                                className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Call Sign (호출부호)</label>
                                            <input
                                                type="text"
                                                value={formData.properties?.callSign || ''}
                                                onChange={e => setFormData(prev => ({ ...prev, properties: { ...prev.properties, callSign: e.target.value } }))}
                                                placeholder="예: D7YP"
                                                className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1.5">국적 (Flag)</label>
                                            <select
                                                value={formData.properties?.flag || ''}
                                                onChange={e => setFormData(prev => ({ ...prev, properties: { ...prev.properties, flag: e.target.value } }))}
                                                title="국적 선택"
                                                className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                                            >
                                                <option value="">선택...</option>
                                                {FLAG_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Physical Specifications */}
                                    <div>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                            <Anchor size={10} /> 선체 제원 (Physical Specs)
                                        </p>
                                        <div className="grid grid-cols-4 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-medium text-slate-500 mb-1">DWT (t)</label>
                                                <input type="number" value={formData.properties?.dwt || ''} onChange={e => setFormData(prev => ({ ...prev, properties: { ...prev.properties, dwt: Number(e.target.value) } }))} placeholder="300000" className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-medium text-slate-500 mb-1">LOA (m)</label>
                                                <input type="number" value={formData.properties?.loa || ''} onChange={e => setFormData(prev => ({ ...prev, properties: { ...prev.properties, loa: Number(e.target.value) } }))} placeholder="333" className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-medium text-slate-500 mb-1">Beam (m)</label>
                                                <input type="number" value={formData.properties?.beam || ''} onChange={e => setFormData(prev => ({ ...prev, properties: { ...prev.properties, beam: Number(e.target.value) } }))} placeholder="60" className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-medium text-slate-500 mb-1">건조년도</label>
                                                <input type="number" value={formData.properties?.yearBuilt || ''} onChange={e => setFormData(prev => ({ ...prev, properties: { ...prev.properties, yearBuilt: Number(e.target.value) } }))} placeholder="2022" className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Operational defaults */}
                                    <div>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                            <Fuel size={10} /> 운항 초기값 (Operational Defaults)
                                        </p>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-medium text-slate-500 mb-1">위치 (Location)</label>
                                                <input type="text" value={formData.properties?.location || ''} onChange={e => setFormData(prev => ({ ...prev, properties: { ...prev.properties, location: e.target.value } }))} placeholder="예: Persian Gulf" className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-medium text-slate-500 mb-1">Risk Score</label>
                                                <input type="number" min={0} max={100} value={formData.properties?.riskScore ?? 50} onChange={e => setFormData(prev => ({ ...prev, properties: { ...prev.properties, riskScore: Number(e.target.value) } }))} className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-medium text-slate-500 mb-1">선종 (Type)</label>
                                                <input type="text" value={formData.properties?.type || ''} onChange={e => setFormData(prev => ({ ...prev, properties: { ...prev.properties, type: e.target.value } }))} placeholder="Auto-filled by preset" className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">상세 내용 및 연결 관계 명시</label>
                                <textarea
                                    value={formData.content}
                                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                                    placeholder="AI가 참조할 명확한 사실과 가이드라인을 작성하세요. 다른 변수와의 연관성을 적으면 망(Network)에 반영됩니다."
                                    rows={8}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 resize-none custom-scrollbar"
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-800 bg-slate-800/30 flex justify-end gap-3 shrink-0">
                            <button onClick={closeForm} className="px-5 py-2 text-sm text-slate-300 hover:text-white transition-colors">취소</button>
                            <button
                                onClick={handleSave}
                                className={cn("px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 text-white", formData.type === 'factor' ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/20' : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-900/20')}
                            >
                                <Save size={14} /> 저장하기
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ========== GRAPH + 360 Inspector ========== */
                    <div className="flex-1 flex overflow-hidden min-h-0">
                        <div className="flex-1 bg-slate-950 overflow-hidden relative min-h-0">
                            <OntologyGraph onSelectObject={handleSelectObject} selectedObjectId={selectedObjectId} />
                        </div>
                        {/* Right 360 Pane — always visible */}
                        {selectedObjectId ? (
                            <Object360Panel
                                objectId={selectedObjectId}
                                onClose={() => setSelectedObjectId(null)}
                                onNavigate={handleNavigateObject}
                            />
                        ) : (
                            <div className="w-[360px] shrink-0 bg-zinc-900/60 border-l border-zinc-800 flex flex-col items-center justify-center text-center p-8">
                                <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-zinc-700/30 flex items-center justify-center mb-4">
                                    <Database size={24} className="text-zinc-600" />
                                </div>
                                <p className="text-sm font-medium text-zinc-500 mb-1">자산을 선택하여</p>
                                <p className="text-sm font-medium text-zinc-500">상세 속성을 확인하세요</p>
                                <p className="text-[10px] text-zinc-600 mt-3 max-w-[200px] leading-relaxed">
                                    좌측 트리 또는 중앙 그래프에서 노드를 클릭하면 360° 인스펙터가 표시됩니다.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
