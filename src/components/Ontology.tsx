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
    '운영 자산': <Ship size={13} className="text-cyan-400" />,
    '비상 대응 지침': <AlertTriangle size={13} className="text-rose-400" />,
    '운영 요소': <TrendingUp size={13} className="text-amber-400" />,
    '규제 요소': <Shield size={13} className="text-emerald-400" />,
    '내부 지침': <FileText size={13} className="text-blue-400" />,
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
        { id: 'obj_oceanic_titan', category: '운영 자산', title: 'Oceanic Titan', content: 'VLCC급 원유 운반선. 현재 페르시아만 호르무즈 해협 통과 중.', lastUpdated: new Date().toLocaleDateString('ko-KR'), isActive: true, type: 'object_instance', objectTypeId: 'FleetVessel', properties: { vesselId: 'V-001', name: 'Oceanic Titan', type: 'VLCC', location: 'Hormuz Strait (Persian Gulf)', riskScore: 55 } },
        { id: 'obj_pacific_pioneer', category: '운영 자산', title: 'Pacific Pioneer', content: 'Suezmax급 유조선. 서아프리카 라고스 정박 후 출항.', lastUpdated: new Date().toLocaleDateString('ko-KR'), isActive: true, type: 'object_instance', objectTypeId: 'FleetVessel', properties: { vesselId: 'V-002', name: 'Pacific Pioneer', type: 'Suezmax', location: 'West Africa (Lagos Anchorage)', riskScore: 20 } },
        { id: 'obj_gulf_voyager', category: '운영 자산', title: 'Gulf Voyager', content: 'Aframax급 유조선. 중동 푸자이라 인근에서 급유 대기.', lastUpdated: new Date().toLocaleDateString('ko-KR'), isActive: true, type: 'object_instance', objectTypeId: 'FleetVessel', properties: { vesselId: 'V-003', name: 'Gulf Voyager', type: 'Aframax', location: 'Middle East (Fujairah)', riskScore: 50 } },
        { id: 'obj_nordic_carrier', category: '운영 자산', title: 'Nordic Carrier', content: 'VLCC급. 북유럽 로테르담 인근 항해 중. 안정구역.', lastUpdated: new Date().toLocaleDateString('ko-KR'), isActive: true, type: 'object_instance', objectTypeId: 'FleetVessel', properties: { vesselId: 'V-004', name: 'Nordic Carrier', type: 'VLCC', location: 'North Sea (Rotterdam)', riskScore: 10 } },
        { id: '1', category: '비상 대응 지침', title: '페르시아만/호르무즈 해협 통항 행동 지침', content: '이란/이스라엘 통항 레벨 3 격상. UKMTO 보고 필수.', lastUpdated: new Date().toLocaleDateString('ko-KR'), isActive: true, type: 'document' },
        { id: 'f_vlcc', category: '운영 요소', subCategory: '자산 (Asset)', title: 'VLCC Fleet Size (보유 선대)', content: '현재 운영 중인 초대형 원유 운반선 총 톤수 및 댓수. (연결 노드: VLSFO, 운임)', lastUpdated: new Date().toLocaleDateString('ko-KR'), isActive: true, type: 'factor' },
        { id: 'f_port_congestion', category: '운영 요소', title: 'Port Congestion Index (항만 체선율)', content: '글로벌 주요 허브 항만(상하이, 싱가포르 등)의 물류 지연 및 대기 시간 지표. 공급망 마비 시 상승.', lastUpdated: new Date().toLocaleDateString('ko-KR'), isActive: true, type: 'factor' },
        { id: 'f_eco_compliance', category: '규제 요소', title: '대체 연비 규제 (CII/EEXI) 달성률', content: 'IMO 환경 규제 대응을 위한 선대 효율성 달성 지표. 위반 시 운항 정지 스크랩.', lastUpdated: new Date().toLocaleDateString('ko-KR'), isActive: true, type: 'factor' },
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
        const order = ['운영 자산', '비상 대응 지침', '운영 요소', '규제 요소', '내부 지침'];
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
        <div className="flex h-full bg-slate-950 overflow-hidden">
            {/* ========== LEFT PANEL: File Tree Explorer ========== */}
            <div className="w-[320px] shrink-0 flex flex-col bg-slate-900/70 border-r border-slate-800/60 overflow-hidden">
                {/* Tree Header */}
                <div className="px-4 py-3.5 border-b border-slate-800/60 bg-slate-900/90 shrink-0">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2 tracking-wide uppercase">
                            <Database size={14} className="text-cyan-400" />
                            Object Explorer
                        </h2>
                        <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full font-mono">
                            {totalCount} nodes
                        </span>
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            placeholder="노드 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-800/80 border border-slate-700/50 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-colors placeholder-slate-500"
                        />
                    </div>
                </div>

                {/* Toolbar: Add buttons */}
                <div className="px-3 py-2 border-b border-slate-800/40 flex items-center gap-1.5 shrink-0 bg-slate-900/40">
                    <button
                        onClick={() => { setFormData({ ...formData, type: 'document', category: '내부 지침' }); setShowAddForm(true); }}
                        className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-[10px] font-medium rounded-md transition-colors border border-slate-700/50"
                        title="문서 추가"
                    >
                        <Plus size={10} /> 객체 추가
                    </button>
                    <button
                        onClick={() => { setFormData({ category: '운영 요소', title: '', content: '', type: 'factor', subCategory: '자산 (Asset)', defaultValue: 50 }); setShowAddForm(true); }}
                        className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-[10px] font-medium rounded-md transition-colors border border-slate-700/50"
                        title="관계 연결"
                    >
                        <Link2 size={10} /> 관계 연결
                    </button>
                    <div className="flex-1" />
                    <button
                        onClick={() => setShowObjectWizard(true)}
                        className="flex items-center gap-1 px-2 py-1.5 bg-cyan-900/30 hover:bg-cyan-800/40 text-cyan-400 text-[10px] font-bold rounded-md transition-colors border border-cyan-700/30"
                        title="Create Object Type"
                    >
                        <Sparkles size={10} /> Type
                    </button>
                    <button
                        onClick={handleResetDefaults}
                        className="p-1.5 text-slate-500 hover:text-amber-400 rounded-md transition-colors"
                        title="초기화"
                    >
                        <RotateCcw size={11} />
                    </button>
                </div>

                {/* Object Types Section (collapsed by default) */}
                {objectTypes.length > 0 && (
                    <div className="px-2 pt-2 pb-1 shrink-0">
                        <div className="text-[9px] text-slate-500 uppercase tracking-widest px-2 mb-1 font-bold">Schema Types</div>
                        {objectTypes.map(ot => (
                            <div key={ot.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-800/40 group/ot transition-colors">
                                <Sparkles size={11} className="text-cyan-500 shrink-0" />
                                <span className="text-[11px] text-slate-300 truncate flex-1">{ot.displayName}</span>
                                <span className="text-[9px] text-slate-600 font-mono">{ot.properties.length}p</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const defaultProps: Record<string, any> = {};
                                        ot.properties.forEach(p => defaultProps[p.id] = p.baseType === 'number' ? 0 : '');
                                        setFormData({ category: ot.groups[0] || 'Object Instance', title: `New ${ot.displayName}`, content: `Instance of ${ot.displayName}`, type: 'object_instance', objectTypeId: ot.id, properties: defaultProps });
                                        setShowAddForm(true);
                                    }}
                                    className="opacity-0 group-hover/ot:opacity-100 p-0.5 text-cyan-500 hover:text-cyan-300 transition-all"
                                    title="Add Instance"
                                >
                                    <Plus size={11} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setObjectTypes(objectTypes.filter(o => o.id !== ot.id)); }}
                                    className="opacity-0 group-hover/ot:opacity-100 p-0.5 text-slate-600 hover:text-rose-400 transition-all"
                                    title="Delete Type"
                                >
                                    <Trash2 size={10} />
                                </button>
                            </div>
                        ))}
                        <div className="border-b border-slate-800/40 mt-1.5 mb-1" />
                    </div>
                )}

                {/* ========== FILE TREE ========== */}
                <div ref={treeListRef} className="flex-1 overflow-y-auto custom-scrollbar px-2 py-1 min-h-0">
                    {treeFolders.length === 0 && (
                        <div className="text-center text-xs text-slate-500 mt-10">검색 결과 없음</div>
                    )}

                    {treeFolders.map(folder => {
                        const isExpanded = expandedFolders[folder.name] ?? (folder.name === '운영 자산');
                        return (
                            <div key={folder.name} className="mb-0.5 select-none">
                                {/* Folder row */}
                                <button
                                    onClick={() => toggleFolder(folder.name)}
                                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-slate-800/40 text-slate-300 transition-colors group/folder"
                                >
                                    <ChevronRight
                                        size={12}
                                        className={cn(
                                            "text-slate-500 transition-transform duration-200 shrink-0",
                                            isExpanded && "rotate-90"
                                        )}
                                    />
                                    {isExpanded
                                        ? <FolderOpen size={14} className="text-amber-500 shrink-0" />
                                        : <Folder size={14} className="text-amber-500/70 shrink-0" />
                                    }
                                    <span className="text-[11px] font-semibold tracking-wide truncate">{folder.name}</span>
                                    <span className="ml-auto text-[9px] text-slate-600 bg-slate-800/50 px-1.5 py-0.5 rounded-full shrink-0">
                                        {folder.items.length}
                                    </span>
                                </button>

                                {/* Folder children with indent + guide line */}
                                {isExpanded && (
                                    <div className="ml-[14px] pl-3 border-l border-slate-800/50 space-y-px pb-1">
                                        {folder.items.map(item => {
                                            const isSelected = selectedObjectId === item.id;
                                            const riskScore = item.properties?.riskScore;
                                            const riskLevel = item.vesselData?.riskLevel;

                                            return (
                                                <div
                                                    id={`tree-item-${item.id}`}
                                                    key={item.id}
                                                    onClick={() => handleSelectObject(item.id)}
                                                    className={cn(
                                                        "group/item flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-all relative",
                                                        "before:absolute before:left-[-13px] before:top-1/2 before:w-2.5 before:h-px before:bg-slate-800/50",
                                                        isSelected
                                                            ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                                                            : item.isActive
                                                                ? "hover:bg-slate-800/30 text-slate-300"
                                                                : "hover:bg-slate-800/20 text-slate-500 opacity-50"
                                                    )}
                                                >
                                                    {/* Item type icon */}
                                                    <div className="shrink-0">
                                                        {ITEM_TYPE_ICONS[item.type || 'document'] || <FileText size={12} className="text-slate-400" />}
                                                    </div>

                                                    {/* Title */}
                                                    <span className={cn(
                                                        "text-[11px] truncate flex-1 leading-tight",
                                                        isSelected ? "font-semibold" : "font-medium"
                                                    )}>
                                                        {item.title}
                                                    </span>

                                                    {/* Risk indicator dot */}
                                                    {riskLevel && (
                                                        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", RISK_DOT[riskLevel] || 'bg-slate-500')} />
                                                    )}
                                                    {riskScore !== undefined && riskScore >= 40 && !riskLevel && (
                                                        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                                                            riskScore >= 70 ? 'bg-rose-500' : riskScore >= 50 ? 'bg-amber-500' : 'bg-cyan-500'
                                                        )} />
                                                    )}

                                                    {/* Hover actions */}
                                                    <div className="hidden group-hover/item:flex items-center gap-0.5 shrink-0">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); editItem(item); }}
                                                            className="p-1 text-slate-500 hover:text-cyan-400 rounded transition-colors"
                                                            title="편집"
                                                        >
                                                            <Edit2 size={10} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                                                            className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
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
                                <div className="border border-cyan-900/30 bg-cyan-950/10 p-5 rounded-xl space-y-4">
                                    <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-cyan-900/50 pb-2">
                                        <Sparkles size={12} /> Object Properties ({formData.objectTypeId})
                                    </p>
                                    <div className="grid grid-cols-2 gap-4">
                                        {objectTypes.find(ot => ot.id === formData.objectTypeId)?.properties.map(prop => (
                                            <div key={prop.id}>
                                                <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
                                                    {prop.displayName}
                                                    {prop.isPrimaryKey && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[8px] uppercase tracking-wider">PK</span>}
                                                    {prop.isTitleKey && <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 text-[8px] uppercase tracking-wider">Title</span>}
                                                </label>
                                                <input
                                                    type={prop.baseType === 'number' ? 'number' : 'text'}
                                                    value={formData.properties?.[prop.id] !== undefined ? formData.properties[prop.id] : ''}
                                                    onChange={e => {
                                                        const val = prop.baseType === 'number' ? Number(e.target.value) : e.target.value;
                                                        setFormData(prev => {
                                                            const newProps = { ...prev.properties, [prop.id]: val };
                                                            const isTitle = prop.isTitleKey;
                                                            return { ...prev, properties: newProps, title: isTitle ? String(val) : prev.title };
                                                        });
                                                    }}
                                                    placeholder={`Enter ${prop.displayName}`}
                                                    className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                                                />
                                            </div>
                                        ))}
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
                    /* ========== GRAPH + Object360 Panel ========== */
                    <div className="flex-1 flex overflow-hidden min-h-0">
                        <div className="flex-1 bg-slate-900/50 overflow-hidden relative min-h-0">
                            <OntologyGraph onSelectObject={handleSelectObject} selectedObjectId={selectedObjectId} />
                        </div>
                        {selectedObjectId && (
                            <Object360Panel
                                objectId={selectedObjectId}
                                onClose={() => setSelectedObjectId(null)}
                                onNavigate={handleNavigateObject}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
