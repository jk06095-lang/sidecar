import React, { useState } from 'react';
import { Database, Plus, ChevronRight, X, Sparkles, Box, Settings2, KeyRound, Trash2, FileText, Save, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ObjectTypeDefinition, ObjectProperty } from '../../types';

interface ObjectTypeWizardProps {
    onClose: () => void;
    onSave: (objType: ObjectTypeDefinition) => void;
}

const MOCK_DATASOURCES = [
    { id: 'ds_fleet_raw', name: 'raw_fleet_vessels_csv', rows: 1420, columns: ['vessel_id', 'name', 'type', 'lat', 'lng', 'risk_score'] },
    { id: 'ds_port_metrics', name: 'port_metrics_v2', rows: 84000, columns: ['port_id', 'name', 'congestion_level', 'wait_time_hours'] },
    { id: 'ds_crew_manifest', name: 'crew_manifest_2026', rows: 4500, columns: ['emp_id', 'full_name', 'role', 'assigned_vessel', 'status'] },
];

export default function ObjectTypeWizard({ onClose, onSave }: ObjectTypeWizardProps) {
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

    // Form Data
    const [metadata, setMetadata] = useState({
        id: '',
        displayName: '',
        pluralDisplayName: '',
        description: '',
        icon: 'Box',
        color: '#0ea5e9',
        groups: '운영 자산'
    });

    const [selectedDatasource, setSelectedDatasource] = useState<string>('');
    const [properties, setProperties] = useState<ObjectProperty[]>([]);

    // Step Validation
    const canProceedFromMetadata = metadata.id && metadata.displayName && metadata.pluralDisplayName;
    const canProceedFromDatasource = selectedDatasource !== '';
    const canProceedFromProperties = properties.length > 0 && properties.every(p => p.id && p.displayName);
    const hasPrimaryKey = properties.some(p => p.isPrimaryKey);
    const hasTitleKey = properties.some(p => p.isTitleKey);
    const canSave = hasPrimaryKey && hasTitleKey;

    const autoMapColumns = (dsId: string) => {
        const ds = MOCK_DATASOURCES.find(d => d.id === dsId);
        if (!ds) return;

        const mapped: ObjectProperty[] = ds.columns.map(col => ({
            id: col.replace(/_([a-z])/g, (g) => g[1].toUpperCase()), // snake to camelCase
            displayName: col.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            baseType: col.includes('score') || col.includes('lat') || col.includes('lng') ? 'number' : 'string',
            isPrimaryKey: col.includes('id'),
            isTitleKey: col.includes('name'),
            mappedColumn: col
        }));
        setProperties(mapped);
    };

    const handleDatasourceSelect = (id: string) => {
        setSelectedDatasource(id);
        autoMapColumns(id);
    };

    const handleSave = () => {
        onSave({
            id: metadata.id,
            displayName: metadata.displayName,
            pluralDisplayName: metadata.pluralDisplayName,
            description: metadata.description,
            icon: metadata.icon,
            color: metadata.color,
            groups: [metadata.groups],
            backingDatasource: selectedDatasource,
            properties
        });
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 animate-fade-in">
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden relative">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-700/50 bg-slate-900 z-10">
                    <div>
                        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                            <Sparkles className="text-amber-400" size={18} />
                            Create New Object Type
                        </h2>
                        <p className="text-xs text-slate-400 mt-1">객체 스키마 정의 마법사 — 데이터 기반 자산 모델링</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar Steps */}
                    <div className="w-64 bg-slate-950/50 border-r border-slate-800 p-6 flex flex-col gap-6">
                        <StepIndicator current={step} number={1} title="Object Metadata" desc="객체 기본 정보 정의" />
                        <StepIndicator current={step} number={2} title="Backing Datasource" desc="데이터 원본 연결" />
                        <StepIndicator current={step} number={3} title="Properties" desc="속성 및 컬럼 매핑" />
                        <StepIndicator current={step} number={4} title="Keys & Save" desc="식별자 지정 및 저장" />
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-slate-900/50">
                        {step === 1 && (
                            <div className="max-w-xl mx-auto space-y-6 animate-slide-up">
                                <h3 className="text-xl font-bold text-slate-200 mb-6">Object Type Metadata</h3>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">API Name (PascalCase, Unique ID)</label>
                                        <input type="text" value={metadata.id} onChange={e => setMetadata({ ...metadata, id: e.target.value.replace(/[^a-zA-Z0-9]/g, '') })} placeholder="e.g. FleetVessel" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Display Name</label>
                                            <input type="text" value={metadata.displayName} onChange={e => setMetadata({ ...metadata, displayName: e.target.value })} placeholder="e.g. Vessel" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Plural Display Name</label>
                                            <input type="text" value={metadata.pluralDisplayName} onChange={e => setMetadata({ ...metadata, pluralDisplayName: e.target.value })} placeholder="e.g. Vessels" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Description (Optional)</label>
                                        <textarea value={metadata.description} onChange={e => setMetadata({ ...metadata, description: e.target.value })} placeholder="Explain what this object represents..." className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 h-24 resize-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Group / Category</label>
                                        <input type="text" value={metadata.groups} onChange={e => setMetadata({ ...metadata, groups: e.target.value })} placeholder="e.g. Asset" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="max-w-2xl mx-auto animate-slide-up">
                                <h3 className="text-xl font-bold text-slate-200 mb-2">Choose a backing datasource</h3>
                                <p className="text-xs text-slate-400 mb-6">Select an existing dataset to automatically map columns to this Object Type.</p>

                                <div className="grid gap-4">
                                    {MOCK_DATASOURCES.map(ds => (
                                        <div
                                            key={ds.id}
                                            onClick={() => handleDatasourceSelect(ds.id)}
                                            className={cn(
                                                "p-4 rounded-xl border cursor-pointer transition-all",
                                                selectedDatasource === ds.id
                                                    ? "bg-cyan-950/30 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                                                    : "bg-slate-950/50 border-slate-800 hover:border-slate-600"
                                            )}
                                        >
                                            <div className="flex items-center gap-3 mb-2">
                                                <Database className="text-emerald-400" size={18} />
                                                <span className="font-mono text-sm text-slate-200">{ds.name}</span>
                                            </div>
                                            <div className="flex gap-4 text-xs text-slate-500">
                                                <span>Rows: {ds.rows.toLocaleString()}</span>
                                                <span>Columns: {ds.columns.length}</span>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {ds.columns.map(c => (
                                                    <span key={c} className="px-1.5 py-0.5 bg-slate-900 rounded border border-slate-800 text-[10px] font-mono text-slate-400">{c}</span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="animate-slide-up">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-200">Map Properties</h3>
                                        <p className="text-xs text-slate-400 mt-1">Columns from <span className="text-cyan-400 font-mono">{MOCK_DATASOURCES.find(d => d.id === selectedDatasource)?.name}</span> have been auto-mapped.</p>
                                    </div>
                                </div>

                                <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-900/50 border-b border-slate-800 text-xs text-slate-400">
                                            <tr>
                                                <th className="px-4 py-3 font-medium">Mapped Column</th>
                                                <th className="px-4 py-3 font-medium">Property API Name</th>
                                                <th className="px-4 py-3 font-medium">Display Name</th>
                                                <th className="px-4 py-3 font-medium">Base Type</th>
                                                <th className="px-4 py-3 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {properties.map((prop, idx) => (
                                                <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-900/30">
                                                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{prop.mappedColumn}</td>
                                                    <td className="px-4 py-3">
                                                        <input type="text" value={prop.id} onChange={e => {
                                                            const newProps = [...properties];
                                                            newProps[idx].id = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
                                                            setProperties(newProps);
                                                        }} className="bg-transparent border-b border-slate-700 focus:border-cyan-500 focus:outline-none py-1 w-full font-mono text-cyan-200" />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input type="text" value={prop.displayName} onChange={e => {
                                                            const newProps = [...properties];
                                                            newProps[idx].displayName = e.target.value;
                                                            setProperties(newProps);
                                                        }} className="bg-transparent border-b border-slate-700 focus:border-cyan-500 focus:outline-none py-1 w-full text-slate-200" />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <select value={prop.baseType} onChange={e => {
                                                            const newProps = [...properties];
                                                            newProps[idx].baseType = e.target.value as any;
                                                            setProperties(newProps);
                                                        }} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none">
                                                            <option value="string">String</option>
                                                            <option value="number">Number</option>
                                                            <option value="boolean">Boolean</option>
                                                            <option value="date">Date</option>
                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button onClick={() => setProperties(properties.filter((_, i) => i !== idx))} className="text-slate-500 hover:text-rose-400 p-1"><Trash2 size={14} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="max-w-2xl mx-auto animate-slide-up">
                                <h3 className="text-xl font-bold text-slate-200 mb-2">Configure Keys</h3>
                                <p className="text-xs text-slate-400 mb-8">Every object type requires a Primary Key (unique identifier) and a Title Key (display name).</p>

                                <div className="space-y-6">
                                    <div className="bg-slate-950 border border-amber-900/30 rounded-xl p-5 relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
                                        <h4 className="text-sm font-bold text-amber-200 mb-3 flex items-center gap-2">
                                            <KeyRound size={14} className="text-amber-400" /> Primary Key
                                        </h4>
                                        <div className="text-xs text-slate-400 mb-4">Each row in the backing datasource must have a unique value for this property.</div>
                                        <div className="flex flex-wrap gap-2">
                                            {properties.map((p, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => {
                                                        setProperties(properties.map(prop => ({ ...prop, isPrimaryKey: prop.id === p.id })));
                                                    }}
                                                    className={cn("px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors", p.isPrimaryKey ? "bg-amber-500/20 border-amber-500 text-amber-300" : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500")}
                                                >
                                                    {p.id}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-slate-950 border border-cyan-900/30 rounded-xl p-5 relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500" />
                                        <h4 className="text-sm font-bold text-cyan-200 mb-3 flex items-center gap-2">
                                            <FileText size={14} className="text-cyan-400" /> Title Key
                                        </h4>
                                        <div className="text-xs text-slate-400 mb-4">The property that acts as a human-readable display name for instances.</div>
                                        <div className="flex flex-wrap gap-2">
                                            {properties.map((p, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => {
                                                        setProperties(properties.map(prop => ({ ...prop, isTitleKey: prop.id === p.id })));
                                                    }}
                                                    className={cn("px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors", p.isTitleKey ? "bg-cyan-500/20 border-cyan-500 text-cyan-300" : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500")}
                                                >
                                                    {p.id}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 border-t border-slate-700/50 bg-slate-900 flex items-center justify-between z-10">
                    <div>
                        {step > 1 && (
                            <button onClick={() => setStep(step - 1 as any)} className="px-5 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors">
                                Back
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2 text-sm font-semibold text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>

                        {step < 4 ? (
                            <button
                                onClick={() => setStep(step + 1 as any)}
                                disabled={(step === 1 && !canProceedFromMetadata) || (step === 2 && !canProceedFromDatasource) || (step === 3 && !canProceedFromProperties)}
                                className="flex items-center gap-2 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-bold rounded-lg transition-colors"
                            >
                                Continue <ChevronRight size={16} />
                            </button>
                        ) : (
                            <button
                                onClick={handleSave}
                                disabled={!canSave}
                                className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-bold rounded-lg transition-colors"
                            >
                                <Save size={16} /> Save Object Type
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StepIndicator({ current, number, title, desc }: { current: number, number: number, title: string, desc: string }) {
    const isPast = current > number;
    const isCurrent = current === number;

    return (
        <div className={cn("flex gap-4 relative", !isCurrent && !isPast && "opacity-40")}>
            <div className="relative shrink-0 flex items-start justify-center pt-1">
                <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold z-10",
                    isPast ? "bg-emerald-500 text-slate-950" : isCurrent ? "bg-cyan-500 text-slate-950 ring-4 ring-cyan-500/20" : "bg-slate-800 text-slate-400"
                )}>
                    {isPast ? <CheckCircle2 size={12} strokeWidth={3} /> : number}
                </div>
                {number < 4 && (
                    <div className={cn("absolute top-7 bottom-[-24px] w-px", isPast ? "bg-emerald-500/50" : "bg-slate-800")} />
                )}
            </div>
            <div>
                <div className={cn("text-sm font-bold", isCurrent ? "text-cyan-400" : isPast ? "text-slate-300" : "text-slate-500")}>{title}</div>
                <div className="text-[10px] text-slate-500 mt-1">{desc}</div>
            </div>
        </div>
    );
}
