import React, { useState, useEffect, useCallback } from 'react';
import {
    X, Sparkles, Save, Ship, Anchor, AlertTriangle,
    TrendingUp, Navigation, Loader2, Trash2, Info,
} from 'lucide-react';
import type { OntologyObject, OntologyObjectType, OntologyProperties } from '../../types';
import { useOntologyStore } from '../../store/ontologyStore';

// ============================================================
// TYPE-SPECIFIC FIELD DEFINITIONS
// ============================================================

interface FieldDef {
    key: string;
    label: string;
    type: 'text' | 'number' | 'select';
    options?: string[];
    placeholder?: string;
}

const COMMON_FIELDS: FieldDef[] = [
    { key: 'riskScore', label: 'Risk Score', type: 'number', placeholder: '0-100' },
    { key: 'impactValue', label: 'Impact Value', type: 'number', placeholder: '0-100' },
];

const TYPE_FIELDS: Record<OntologyObjectType, FieldDef[]> = {
    Vessel: [
        { key: 'vesselType', label: '선종', type: 'select', options: ['VLCC', 'Suezmax', 'Aframax', 'MR', 'LR1', 'LR2', 'Container', 'Bulk Carrier', 'LNG Carrier'] },
        { key: 'imo', label: 'IMO', type: 'text', placeholder: 'IMO number' },
        { key: 'mmsi', label: 'MMSI', type: 'text', placeholder: 'Maritime ID' },
        { key: 'flag', label: '선적국', type: 'text', placeholder: 'KR, PA, LR...' },
        { key: 'dwt', label: 'DWT', type: 'number', placeholder: 'Deadweight tonnage' },
        { key: 'yearBuilt', label: '건조년도', type: 'number', placeholder: '2020' },
        { key: 'location', label: '현재 위치', type: 'text', placeholder: 'Persian Gulf' },
        { key: 'lat', label: '위도', type: 'number', placeholder: '35.5' },
        { key: 'lng', label: '경도', type: 'number', placeholder: '129.3' },
        { key: 'destination', label: '목적지', type: 'text', placeholder: 'Yeosu, KR' },
        { key: 'speed', label: '속력 (kn)', type: 'number', placeholder: '12.5' },
        { key: 'fuel', label: '연료 ROB %', type: 'number', placeholder: '0-100' },
        { key: 'ciiRating', label: 'CII Rating', type: 'select', options: ['A', 'B', 'C', 'D', 'E'] },
        { key: 'charterRate', label: '용선료 ($/day)', type: 'number', placeholder: '25000' },
    ],
    Port: [
        { key: 'region', label: '지역', type: 'text', placeholder: 'Middle East' },
        { key: 'lat', label: '위도', type: 'number', placeholder: '26.2' },
        { key: 'lng', label: '경도', type: 'number', placeholder: '50.5' },
        { key: 'congestionPct', label: '혼잡도 %', type: 'number', placeholder: '0-100' },
        { key: 'baseWaitDays', label: '대기일', type: 'number', placeholder: '2' },
        { key: 'dailyTraffic', label: '일일 통행량', type: 'number', placeholder: '50' },
        { key: 'securityLevel', label: '보안등급', type: 'select', options: ['Low', 'Medium', 'High', 'Critical'] },
        { key: 'annualTEU', label: '연간 TEU', type: 'number', placeholder: '5000000' },
    ],
    Route: [
        { key: 'originPortId', label: '출발항 ID', type: 'text', placeholder: 'port-xxx' },
        { key: 'destinationPortId', label: '도착항 ID', type: 'text', placeholder: 'port-xxx' },
        { key: 'distanceNm', label: '거리 (NM)', type: 'number', placeholder: '6500' },
        { key: 'estimatedDays', label: '예상 소요일', type: 'number', placeholder: '25' },
        { key: 'fuelCostEstimateUsd', label: '연료비 ($)', type: 'number', placeholder: '150000' },
        { key: 'currentStatus', label: '상태', type: 'select', options: ['open', 'restricted', 'closed'] },
    ],
    MarketIndicator: [
        { key: 'basePrice', label: '기준가', type: 'number', placeholder: '85.00' },
        { key: 'unit', label: '단위', type: 'text', placeholder: '$/bbl' },
        { key: 'previousPrice', label: '전일가', type: 'number', placeholder: '84.50' },
        { key: 'volatility', label: '변동성', type: 'number', placeholder: '0.15' },
        { key: 'benchmarkType', label: '벤치마크', type: 'text', placeholder: 'Brent Crude' },
        { key: 'source', label: '데이터 소스', type: 'text', placeholder: 'LSEG' },
        { key: 'assetClass', label: '자산군', type: 'text', placeholder: 'Commodity' },
    ],
    RiskEvent: [
        { key: 'category', label: '카테고리', type: 'select', options: ['geopolitical', 'supply', 'operational', 'environmental', 'cyber', 'pandemic'] },
        { key: 'severity', label: '심각도', type: 'select', options: ['low', 'medium', 'high', 'critical'] },
        { key: 'region', label: '지역', type: 'text', placeholder: 'Red Sea' },
        { key: 'lat', label: '위도', type: 'number', placeholder: '12.5' },
        { key: 'lng', label: '경도', type: 'number', placeholder: '43.3' },
        { key: 'threatLevel', label: '위협수준', type: 'text', placeholder: 'Elevated' },
        { key: 'affectedVessels', label: '영향 선박 수', type: 'number', placeholder: '15' },
        { key: 'extraCostPerVoyageUsd', label: '추가 비용 ($)', type: 'number', placeholder: '500000' },
    ],
};

const TYPE_ICONS: Record<OntologyObjectType, React.ReactNode> = {
    Vessel: <Ship className="w-4 h-4" />,
    Port: <Anchor className="w-4 h-4" />,
    Route: <Navigation className="w-4 h-4" />,
    MarketIndicator: <TrendingUp className="w-4 h-4" />,
    RiskEvent: <AlertTriangle className="w-4 h-4" />,
};

const TYPE_COLORS: Record<OntologyObjectType, string> = {
    Vessel: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    Port: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
    Route: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
    MarketIndicator: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
    RiskEvent: 'from-rose-500/20 to-rose-600/10 border-rose-500/30',
};

// ============================================================
// PROPS
// ============================================================

interface OntologyObjectEditorProps {
    /** null = create mode, existing object = edit mode */
    editObject?: OntologyObject | null;
    onClose: () => void;
    onSaved?: (obj: OntologyObject) => void;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OntologyObjectEditor({ editObject, onClose, onSaved }: OntologyObjectEditorProps) {
    const isEditMode = !!editObject;
    const addObject = useOntologyStore((s) => s.addObject);
    const updateObjectProperty = useOntologyStore((s) => s.updateObjectProperty);
    const removeObject = useOntologyStore((s) => s.removeObject);
    const existingTitles = useOntologyStore((s) => s.objects.map(o => o.title));

    // Form state
    const [objectType, setObjectType] = useState<OntologyObjectType>(editObject?.type || 'Vessel');
    const [title, setTitle] = useState(editObject?.title || '');
    const [description, setDescription] = useState(editObject?.description || '');
    const [properties, setProperties] = useState<OntologyProperties>(editObject?.properties || {});
    const [status, setStatus] = useState<'active' | 'inactive' | 'archived'>(editObject?.metadata?.status || 'active');

    // AI state
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [aiConfidence, setAiConfidence] = useState<number | null>(null);

    // Delete confirmation
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Reset form when type changes (create mode only)
    useEffect(() => {
        if (!isEditMode) {
            setProperties({});
            setTitle('');
            setDescription('');
        }
    }, [objectType, isEditMode]);

    const updateProperty = useCallback((key: string, value: string | number) => {
        setProperties(prev => ({ ...prev, [key]: value }));
    }, []);

    // AI draft generation
    const handleAIDraft = useCallback(async () => {
        if (!aiPrompt.trim() || isGenerating) return;
        setIsGenerating(true);
        setAiSuggestions([]);
        setAiConfidence(null);

        try {
            const { generateObjectDraft } = await import('../../services/geminiService');
            const result = await generateObjectDraft(aiPrompt.trim(), objectType, existingTitles);

            // Fill form with AI-generated data
            setTitle(result.object.title);
            setDescription(result.object.description || '');
            setProperties(result.object.properties);
            setAiConfidence(result.confidence);
            setAiSuggestions(result.suggestions);
        } catch (err) {
            console.error('[OntologyEditor] AI draft failed:', err);
            setAiSuggestions(['AI 초안 생성에 실패했습니다. 수동으로 입력해주세요.']);
        } finally {
            setIsGenerating(false);
        }
    }, [aiPrompt, objectType, existingTitles, isGenerating]);

    // Save handler
    const handleSave = useCallback(async () => {
        if (!title.trim()) return;

        if (isEditMode && editObject) {
            // Update existing object properties one by one
            const allKeys = new Set([
                ...Object.keys(properties),
                ...Object.keys(editObject.properties),
            ]);
            for (const key of allKeys) {
                const newVal = properties[key];
                if (newVal !== editObject.properties[key]) {
                    updateObjectProperty(editObject.id, key, newVal as string | number | boolean);
                }
            }
            onSaved?.(editObject);
        } else {
            // Create new object
            const now = new Date().toISOString();
            const newObj: OntologyObject = {
                id: `${objectType.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                type: objectType,
                title: title.trim(),
                description: description.trim(),
                properties,
                metadata: {
                    createdAt: now,
                    updatedAt: now,
                    source: aiConfidence !== null ? 'AI Draft (edited)' : 'User',
                    status,
                },
            };
            await addObject(newObj);
            onSaved?.(newObj);
        }

        onClose();
    }, [title, description, properties, objectType, status, isEditMode, editObject, addObject, updateObjectProperty, onSaved, onClose, aiConfidence]);

    // Delete handler
    const handleDelete = useCallback(async () => {
        if (editObject) {
            await removeObject(editObject.id);
            onClose();
        }
    }, [editObject, removeObject, onClose]);

    const fields = TYPE_FIELDS[objectType] || [];

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-2xl max-h-[90vh] bg-[#0a0e1a] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">

                {/* ---- Header ---- */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-gradient-to-br ${TYPE_COLORS[objectType]} border`}>
                            {TYPE_ICONS[objectType]}
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">
                                {isEditMode ? '오브젝트 편집' : '새 오브젝트 등록'}
                            </h2>
                            <p className="text-xs text-white/50">
                                {isEditMode ? `ID: ${editObject?.id}` : 'AI 초안 생성 또는 수동 입력'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition" title="닫기">
                        <X className="w-5 h-5 text-white/60" />
                    </button>
                </div>

                {/* ---- Body (scrollable) ---- */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

                    {/* Type Selector (create mode only) */}
                    {!isEditMode && (
                        <div>
                            <label className="text-xs font-medium text-white/60 uppercase tracking-wide mb-2 block">타입 선택</label>
                            <div className="grid grid-cols-5 gap-2">
                                {(Object.keys(TYPE_FIELDS) as OntologyObjectType[]).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setObjectType(t)}
                                        title={t}
                                        className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${objectType === t
                                                ? `bg-gradient-to-br ${TYPE_COLORS[t]} border text-white`
                                                : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white/80'
                                            }`}
                                    >
                                        {TYPE_ICONS[t]}
                                        <span>{t}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* AI Draft Bar */}
                    {!isEditMode && (
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <label className="text-xs font-medium text-cyan-400/80 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" />
                                AI 초안 생성
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={aiPrompt}
                                    onChange={e => setAiPrompt(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAIDraft()}
                                    placeholder="예: 호르무즈 해협을 통과하는 30만 DWT급 VLCC..."
                                    className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-500/50 focus:outline-none"
                                />
                                <button
                                    onClick={handleAIDraft}
                                    disabled={isGenerating || !aiPrompt.trim()}
                                    className="px-4 py-2 bg-cyan-600/30 border border-cyan-500/30 rounded-lg text-cyan-300 text-sm font-medium hover:bg-cyan-600/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition"
                                    title="AI 초안 생성"
                                >
                                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    생성
                                </button>
                            </div>

                            {/* AI Confidence + Suggestions */}
                            {aiConfidence !== null && (
                                <div className="mt-3 flex items-center gap-2 text-xs">
                                    <span className="text-white/40">AI 신뢰도:</span>
                                    <div className="flex-1 bg-white/5 rounded-full h-1.5">
                                        <div
                                            className={`h-full rounded-full transition-all ${aiConfidence > 0.7 ? 'bg-emerald-500' : aiConfidence > 0.4 ? 'bg-amber-500' : 'bg-rose-500'
                                                }`}
                                            style={{ width: `${Math.round(aiConfidence * 100)}%` }}
                                        />
                                    </div>
                                    <span className="text-white/60">{Math.round(aiConfidence * 100)}%</span>
                                </div>
                            )}
                            {aiSuggestions.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    {aiSuggestions.map((s, i) => (
                                        <div key={i} className="flex items-start gap-1.5 text-xs text-amber-400/80">
                                            <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                            <span>{s}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Common Fields */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="text-xs font-medium text-white/60 mb-1 block">제목 *</label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="오브젝트 이름"
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:border-blue-500/50 focus:outline-none"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-medium text-white/60 mb-1 block">설명</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="간단한 설명..."
                                rows={2}
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:border-blue-500/50 focus:outline-none resize-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-white/60 mb-1 block">상태</label>
                            <select
                                value={status}
                                onChange={e => setStatus(e.target.value as 'active' | 'inactive' | 'archived')}
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                            >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                                <option value="archived">Archived</option>
                            </select>
                        </div>
                    </div>

                    {/* Type-Specific Fields */}
                    <div>
                        <label className="text-xs font-medium text-white/60 uppercase tracking-wide mb-3 block">
                            {objectType} 속성
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            {[...fields, ...COMMON_FIELDS].map(field => (
                                <div key={field.key}>
                                    <label className="text-xs text-white/40 mb-1 block">{field.label}</label>
                                    {field.type === 'select' ? (
                                        <select
                                            value={String(properties[field.key] || '')}
                                            onChange={e => updateProperty(field.key, e.target.value)}
                                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                                        >
                                            <option value="">선택...</option>
                                            {field.options?.map(opt => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type={field.type}
                                            value={properties[field.key] !== undefined ? String(properties[field.key]) : ''}
                                            onChange={e => {
                                                const val = field.type === 'number'
                                                    ? (e.target.value === '' ? '' : Number(e.target.value))
                                                    : e.target.value;
                                                updateProperty(field.key, val as string | number);
                                            }}
                                            placeholder={field.placeholder}
                                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/25 focus:border-blue-500/50 focus:outline-none"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ---- Footer ---- */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-black/30">
                    <div>
                        {isEditMode && (
                            showDeleteConfirm ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-rose-400">정말 삭제하시겠습니까?</span>
                                    <button
                                        onClick={handleDelete}
                                        className="px-3 py-1.5 bg-rose-600/30 border border-rose-500/30 rounded-lg text-rose-300 text-xs font-medium hover:bg-rose-600/50 transition"
                                    >
                                        삭제 확인
                                    </button>
                                    <button
                                        onClick={() => setShowDeleteConfirm(false)}
                                        className="px-3 py-1.5 border border-white/10 rounded-lg text-white/50 text-xs hover:bg-white/5 transition"
                                    >
                                        취소
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-rose-400/70 text-xs hover:text-rose-400 transition"
                                    title="삭제"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    삭제
                                </button>
                            )
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-white/10 rounded-lg text-white/60 text-sm hover:bg-white/5 transition"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!title.trim()}
                            className="flex items-center gap-2 px-5 py-2 bg-blue-600/30 border border-blue-500/30 rounded-lg text-blue-300 text-sm font-medium hover:bg-blue-600/40 disabled:opacity-40 disabled:cursor-not-allowed transition"
                            title="저장"
                        >
                            <Save className="w-4 h-4" />
                            {isEditMode ? '업데이트' : '등록'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
