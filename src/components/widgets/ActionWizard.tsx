import React, { useState, useMemo } from 'react';
import { X, Zap, AlertTriangle, ArrowRight, Check, TrendingUp, TrendingDown, Shield } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useOntologyStore } from '../../store/ontologyStore';
import type { OntologyObject, OntologyActionType } from '../../types';

// ============================================================
// ACTION DEFINITIONS — what actions each object type supports
// ============================================================

interface ActionDefinition {
    type: OntologyActionType;
    label: string;
    labelKo: string;
    icon: React.ReactNode;
    color: string;
    description: string;
    fields: ActionField[];
}

interface ActionField {
    key: string;
    label: string;
    type: 'number' | 'text' | 'select';
    options?: { value: string; label: string }[];
    min?: number;
    max?: number;
    step?: number;
    placeholder?: string;
}

const ACTION_DEFS: Record<string, ActionDefinition[]> = {
    Vessel: [
        {
            type: 'RerouteVessel',
            label: 'Reroute Vessel',
            labelKo: '대체 항로 지시',
            icon: <ArrowRight size={14} />,
            color: 'cyan',
            description: '선박의 항로를 변경합니다. 리스크 지역을 우회하여 안전한 경로로 전환합니다.',
            fields: [
                {
                    key: 'newLocation',
                    label: '새 위치/항로',
                    type: 'select',
                    options: [
                        { value: 'Cape of Good Hope Route', label: '🌍 희망봉 우회 항로' },
                        { value: 'Suez Canal Route', label: '🏛 수에즈 운하 경유' },
                        { value: 'North Sea (Rotterdam)', label: '🇳🇱 북해 (로테르담)' },
                        { value: 'Singapore Strait', label: '🇸🇬 싱가포르 해협' },
                        { value: 'West Africa (Lagos Anchorage)', label: '🌍 서아프리카 (라고스)' },
                        { value: 'East Asia (Ulsan)', label: '🇰🇷 동아시아 (울산)' },
                    ],
                },
                {
                    key: 'newRiskScore',
                    label: '예상 리스크 점수',
                    type: 'number',
                    min: 0,
                    max: 100,
                    step: 5,
                },
            ],
        },
        {
            type: 'UpdateRiskLevel',
            label: 'Update Risk Level',
            labelKo: '리스크 등급 수동 조정',
            icon: <AlertTriangle size={14} />,
            color: 'amber',
            description: '선박의 리스크 등급을 수동으로 조정합니다.',
            fields: [
                {
                    key: 'riskScore',
                    label: '새로운 리스크 점수 (0-100)',
                    type: 'number',
                    min: 0,
                    max: 100,
                    step: 5,
                },
            ],
        },
    ],
    Port: [
        {
            type: 'FlagPort',
            label: 'Flag Port Risk',
            labelKo: '항구 위험 플래그',
            icon: <Shield size={14} />,
            color: 'rose',
            description: '항구의 리스크 수준 및 대기 시간을 갱신합니다.',
            fields: [
                {
                    key: 'riskScore',
                    label: '리스크 점수 (0-100)',
                    type: 'number',
                    min: 0,
                    max: 100,
                    step: 5,
                },
                {
                    key: 'baseWaitDays',
                    label: '기본 대기일 (days)',
                    type: 'number',
                    min: 0,
                    max: 30,
                    step: 0.5,
                },
            ],
        },
    ],
    MacroEvent: [
        {
            type: 'EscalateMacroEvent',
            label: 'Escalate Event',
            labelKo: '이벤트 심각도 격상',
            icon: <Zap size={14} />,
            color: 'rose',
            description: '거시 경제 이벤트의 심각도와 영향 범위를 변경합니다.',
            fields: [
                {
                    key: 'severity',
                    label: '심각도',
                    type: 'select',
                    options: [
                        { value: 'low', label: 'Low (낮음)' },
                        { value: 'medium', label: 'Medium (중간)' },
                        { value: 'high', label: 'High (높음)' },
                        { value: 'critical', label: 'Critical (심각)' },
                    ],
                },
                {
                    key: 'riskScore',
                    label: '리스크 점수 (0-100)',
                    type: 'number',
                    min: 0,
                    max: 100,
                    step: 5,
                },
                {
                    key: 'supplyChainImpact',
                    label: '공급망 충격 (%)',
                    type: 'number',
                    min: 0,
                    max: 100,
                    step: 5,
                },
            ],
        },
    ],
    Commodity: [
        {
            type: 'UpdateCommodityPrice',
            label: 'Update Price',
            labelKo: '원자재 가격 갱신',
            icon: <TrendingUp size={14} />,
            color: 'amber',
            description: '원자재의 기준 가격을 변경합니다.',
            fields: [
                {
                    key: 'price',
                    label: '새 기준 가격',
                    type: 'number',
                    min: 0,
                    max: 10000,
                    step: 10,
                },
            ],
        },
    ],
    Insurance: [
        {
            type: 'AdjustInsurance',
            label: 'Adjust Insurance',
            labelKo: '보험료율 조정',
            icon: <Shield size={14} />,
            color: 'orange',
            description: '보험 요율 및 리스크 프리미엄을 갱신합니다.',
            fields: [
                {
                    key: 'riskScore',
                    label: '리스크 점수 (0-100)',
                    type: 'number',
                    min: 0,
                    max: 100,
                    step: 5,
                },
                {
                    key: 'rateTo',
                    label: '신규 요율 (소수, 예: 0.05)',
                    type: 'number',
                    min: 0,
                    max: 1,
                    step: 0.005,
                },
            ],
        },
    ],
    RiskFactor: [
        {
            type: 'UpdateRiskLevel',
            label: 'Adjust Risk Impact',
            labelKo: '리스크 영향도 조정',
            icon: <AlertTriangle size={14} />,
            color: 'rose',
            description: '리스크 요소의 기본 영향도를 갱신합니다.',
            fields: [
                {
                    key: 'riskScore',
                    label: '리스크 점수 (0-100)',
                    type: 'number',
                    min: 0,
                    max: 100,
                    step: 5,
                },
            ],
        },
    ],
};

export function getActionsForType(type: string): ActionDefinition[] {
    return ACTION_DEFS[type] || [];
}

// ============================================================
// ACTION WIZARD COMPONENT
// ============================================================

interface ActionWizardProps {
    object: OntologyObject;
    actionDef: ActionDefinition;
    onClose: () => void;
}

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; button: string }> = {
    cyan: { bg: 'bg-cyan-950/30', border: 'border-cyan-800/50', text: 'text-cyan-400', button: 'bg-cyan-600 hover:bg-cyan-500' },
    amber: { bg: 'bg-amber-950/30', border: 'border-amber-800/50', text: 'text-amber-400', button: 'bg-amber-600 hover:bg-amber-500' },
    rose: { bg: 'bg-rose-950/30', border: 'border-rose-800/50', text: 'text-rose-400', button: 'bg-rose-600 hover:bg-rose-500' },
    orange: { bg: 'bg-orange-950/30', border: 'border-orange-800/50', text: 'text-orange-400', button: 'bg-orange-600 hover:bg-orange-500' },
    emerald: { bg: 'bg-emerald-950/30', border: 'border-emerald-800/50', text: 'text-emerald-400', button: 'bg-emerald-600 hover:bg-emerald-500' },
};

export default function ActionWizard({ object, actionDef, onClose }: ActionWizardProps) {
    const executeAction = useOntologyStore((s) => s.executeAction);
    const recalculate = useOntologyStore((s) => s.recalculate);
    const objects = useOntologyStore((s) => s.objects);
    const links = useOntologyStore((s) => s.links);

    const [isSubmitted, setIsSubmitted] = useState(false);

    // Initialize form values from the object's current properties
    const [formValues, setFormValues] = useState<Record<string, string | number>>(() => {
        const init: Record<string, string | number> = {};
        actionDef.fields.forEach((f) => {
            const currentVal = object.properties[f.key];
            if (currentVal !== undefined) {
                init[f.key] = typeof currentVal === 'number' ? currentVal : String(currentVal);
            } else {
                init[f.key] = f.type === 'number' ? (f.min || 0) : '';
            }
        });
        return init;
    });

    const colorStyle = COLOR_MAP[actionDef.color] || COLOR_MAP.cyan;

    // ============================================================
    // RISK PREVIEW CALCULATION
    // ============================================================
    const preview = useMemo(() => {
        const currentRisk = (object.properties.riskScore as number) || 0;
        let newRisk = currentRisk;

        // Calculate expected risk based on action type and form values
        if (formValues.riskScore !== undefined && formValues.riskScore !== '') {
            newRisk = Number(formValues.riskScore);
        } else if (actionDef.type === 'RerouteVessel') {
            newRisk = Number(formValues.newRiskScore || currentRisk);
        }

        // Propagation: calculate how connected objects' risks would change
        const connectedLinks = links.filter(
            (l) => l.sourceId === object.id || l.targetId === object.id,
        );
        const propagatedChanges: { id: string; title: string; currentRisk: number; expectedRisk: number; weight: number }[] = [];

        connectedLinks.forEach((link) => {
            const otherId = link.sourceId === object.id ? link.targetId : link.sourceId;
            const otherObj = objects.find((o) => o.id === otherId);
            if (!otherObj) return;

            const otherCurrentRisk = (otherObj.properties.riskScore as number) || 0;
            const riskDelta = newRisk - currentRisk;
            const propagatedDelta = riskDelta * link.weight * 0.5; // attenuated propagation
            const expectedOtherRisk = Math.max(0, Math.min(100, Math.round(otherCurrentRisk + propagatedDelta)));

            if (Math.abs(propagatedDelta) > 0.5) {
                propagatedChanges.push({
                    id: otherId,
                    title: otherObj.title,
                    currentRisk: otherCurrentRisk,
                    expectedRisk: expectedOtherRisk,
                    weight: link.weight,
                });
            }
        });

        return {
            currentRisk,
            newRisk,
            delta: newRisk - currentRisk,
            propagatedChanges,
        };
    }, [formValues, object, links, objects, actionDef.type]);

    // ============================================================
    // SUBMIT — write-back to store
    // ============================================================
    const handleSubmit = () => {
        const payload: Record<string, unknown> = {};

        actionDef.fields.forEach((f) => {
            const val = formValues[f.key];
            payload[f.key] = f.type === 'number' ? Number(val) : val;
        });

        // For RerouteVessel: also set new risk score if provided
        if (actionDef.type === 'RerouteVessel' && formValues.newRiskScore !== undefined) {
            payload.riskScore = Number(formValues.newRiskScore);
        }

        // Execute the action in the store (optimistic write-back)
        executeAction({
            id: `action-${Date.now()}`,
            type: actionDef.type,
            targetObjectId: object.id,
            payload,
            timestamp: new Date().toISOString(),
            executedBy: 'user',
        });

        // Handle action types not covered by the default executeAction switch
        const store = useOntologyStore.getState();

        if (actionDef.type === 'FlagPort') {
            const updatedObjects = store.objects.map((o) =>
                o.id === object.id
                    ? {
                        ...o,
                        properties: {
                            ...o.properties,
                            riskScore: Number(payload.riskScore ?? o.properties.riskScore ?? 0),
                            baseWaitDays: Number(payload.baseWaitDays ?? o.properties.baseWaitDays ?? 0),
                        },
                        metadata: { ...o.metadata, updatedAt: new Date().toISOString() },
                    }
                    : o,
            );
            useOntologyStore.setState({ objects: updatedObjects });
        }

        if (actionDef.type === 'EscalateMacroEvent') {
            const updatedObjects = store.objects.map((o) =>
                o.id === object.id
                    ? {
                        ...o,
                        properties: {
                            ...o.properties,
                            severity: String(payload.severity ?? o.properties.severity ?? ''),
                            riskScore: Number(payload.riskScore ?? o.properties.riskScore ?? 0),
                            supplyChainImpact: Number(payload.supplyChainImpact ?? o.properties.supplyChainImpact ?? 0),
                        },
                        metadata: { ...o.metadata, updatedAt: new Date().toISOString() },
                    }
                    : o,
            );
            useOntologyStore.setState({ objects: updatedObjects });
        }

        if (actionDef.type === 'AdjustInsurance') {
            const updatedObjects = store.objects.map((o) =>
                o.id === object.id
                    ? {
                        ...o,
                        properties: {
                            ...o.properties,
                            riskScore: Number(payload.riskScore ?? o.properties.riskScore ?? 0),
                            rateTo: Number(payload.rateTo ?? o.properties.rateTo ?? 0),
                        },
                        metadata: { ...o.metadata, updatedAt: new Date().toISOString() },
                    }
                    : o,
            );
            useOntologyStore.setState({ objects: updatedObjects });
        }

        // Propagate risk changes to connected objects
        preview.propagatedChanges.forEach(({ id, expectedRisk }) => {
            useOntologyStore.getState().updateObjectProperty(id, 'riskScore', expectedRisk);
        });

        // Trigger global recalculation
        setTimeout(() => recalculate(), 0);

        setIsSubmitted(true);
        setTimeout(() => onClose(), 1200);
    };

    const handleFieldChange = (key: string, val: string | number) => {
        setFormValues((prev) => ({ ...prev, [key]: val }));
    };

    if (isSubmitted) {
        return (
            <div className="p-6 flex flex-col items-center justify-center gap-3 animate-fade-in">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                    <Check size={24} className="text-emerald-400" />
                </div>
                <div className="text-sm font-semibold text-emerald-400">Action 실행 완료</div>
                <div className="text-xs text-slate-400 text-center">
                    스토어가 업데이트되었습니다. 그래프와 위젯이 즉시 반영됩니다.
                </div>
            </div>
        );
    }

    return (
        <div className={cn('border rounded-xl overflow-hidden animate-slide-up', colorStyle.bg, colorStyle.border)}>
            {/* Header */}
            <div className="p-3 border-b border-slate-700/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={cn('p-1 rounded', colorStyle.text)}>{actionDef.icon}</div>
                    <div>
                        <div className={cn('text-xs font-bold', colorStyle.text)}>{actionDef.labelKo}</div>
                        <div className="text-[9px] text-slate-500 font-mono">{actionDef.type}</div>
                    </div>
                </div>
                <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
                    <X size={14} />
                </button>
            </div>

            {/* Description */}
            <div className="px-3 py-2 text-[10px] text-slate-400 leading-relaxed border-b border-slate-800/30">
                {actionDef.description}
            </div>

            {/* Fields */}
            <div className="p-3 space-y-3">
                {actionDef.fields.map((field) => (
                    <div key={field.key}>
                        <label className="block text-[10px] font-medium text-slate-400 mb-1 uppercase tracking-wider">{field.label}</label>
                        {field.type === 'select' ? (
                            <select
                                value={formValues[field.key] || ''}
                                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                className="w-full bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
                            >
                                <option value="" disabled>선택하세요</option>
                                {field.options?.map((opt) => (
                                    <option key={opt.value} value={opt.value} className="bg-slate-900">{opt.label}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type={field.type}
                                value={formValues[field.key] ?? ''}
                                onChange={(e) => handleFieldChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                placeholder={field.placeholder}
                                className="w-full bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                            />
                        )}
                        {field.type === 'number' && field.min !== undefined && field.max !== undefined && (
                            <input
                                type="range"
                                value={Number(formValues[field.key] || field.min)}
                                onChange={(e) => handleFieldChange(field.key, Number(e.target.value))}
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                className="w-full mt-1 accent-cyan-500"
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* Risk Preview */}
            <div className="mx-3 mb-3 p-3 bg-slate-950/50 rounded-lg border border-slate-700/30">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Zap size={10} /> 예상 변동 프리뷰 (Impact Preview)
                </div>

                {/* Self-risk change */}
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-slate-400 w-16">본 객체</span>
                    <span className="text-xs font-mono text-slate-300">{preview.currentRisk}</span>
                    <ArrowRight size={10} className="text-slate-600" />
                    <span className={cn('text-xs font-bold font-mono', {
                        'text-emerald-400': preview.delta < 0,
                        'text-rose-400': preview.delta > 0,
                        'text-slate-400': preview.delta === 0,
                    })}>
                        {preview.newRisk}
                    </span>
                    {preview.delta !== 0 && (
                        <span className={cn('text-[10px] font-mono flex items-center gap-0.5', {
                            'text-emerald-400': preview.delta < 0,
                            'text-rose-400': preview.delta > 0,
                        })}>
                            {preview.delta > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {preview.delta > 0 ? '+' : ''}{preview.delta}
                        </span>
                    )}
                </div>

                {/* Propagated changes */}
                {preview.propagatedChanges.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-700/30">
                        <div className="text-[9px] text-slate-500 mb-1.5">리스크 전파 (Connected Objects)</div>
                        <div className="space-y-1">
                            {preview.propagatedChanges.slice(0, 5).map((p) => (
                                <div key={p.id} className="flex items-center gap-2 text-[10px]">
                                    <span className="text-slate-400 truncate w-24">{p.title}</span>
                                    <span className="text-slate-500 font-mono">{p.currentRisk}</span>
                                    <ArrowRight size={8} className="text-slate-600" />
                                    <span className={cn('font-mono font-bold', {
                                        'text-emerald-400': p.expectedRisk < p.currentRisk,
                                        'text-rose-400': p.expectedRisk > p.currentRisk,
                                        'text-slate-400': p.expectedRisk === p.currentRisk,
                                    })}>
                                        {p.expectedRisk}
                                    </span>
                                    <span className="text-slate-600 font-mono text-[8px]">w:{p.weight.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Submit */}
            <div className="p-3 pt-0">
                <button
                    onClick={handleSubmit}
                    className={cn('w-full py-2.5 rounded-lg text-xs font-bold text-white transition-colors flex items-center justify-center gap-2 shadow-lg', colorStyle.button)}
                >
                    <Zap size={14} />
                    Action 실행 (Store Write-back)
                </button>
            </div>
        </div>
    );
}
