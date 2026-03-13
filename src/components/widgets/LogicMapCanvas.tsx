/**
 * LogicMapCanvas — Interactive Causal Logic Tree
 *
 * Node types:
 *   trigger   — event that initiates the chain (e.g. "호르무즈 봉쇄")
 *   condition — guard or threshold (e.g. "유가 > $100")
 *   action    — response action (e.g. "희망봉 우회 발동")
 *   outcome   — result (e.g. "TCE +15%")
 *   variable  — bound to a ScenarioVariable by ID
 *   vessel    — bound to an OntologyObject of type Vessel
 *
 * Edges can have labels describing the cause-effect relationship.
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
    Network, Plus, Trash2, Link as LinkIcon, Zap, X,
    Ship, Fuel, AlertTriangle, Shield, TrendingUp,
    ChevronDown, Search,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Scenario } from '../../types';
import { useOntologyStore } from '../../store/ontologyStore';
import { SCENARIO_VARIABLE_CATALOG, CATEGORY_META, VARIABLE_MAP } from '../../data/scenarioVariables';
import { loadLogicMap as firestoreLoadLogicMap, saveLogicMap as firestoreSaveLogicMap } from '../../services/firestoreService';

// ============================================================
// TYPES
// ============================================================

export type LogicNodeType = 'trigger' | 'condition' | 'action' | 'outcome' | 'variable' | 'vessel';

export interface ProcessNode {
    id: string;
    x: number;
    y: number;
    type: LogicNodeType;
    text: string;
    /** For variable nodes: the ScenarioVariable.id */
    variableId?: string;
    /** For vessel nodes: the OntologyObject.id */
    objectId?: string;
}

export interface ProcessEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
}

interface LogicMapCanvasProps {
    activeScenario: Scenario;
    /** Called when edges change — parent can use for quant analysis */
    onEdgesChange?: (edges: ProcessEdge[]) => void;
}

const NODE_W = 180;
const NODE_H = 50;

const EDGE_LABEL_PRESETS = [
    'increases', 'decreases', 'delays', 'triggers',
    'blocks', 'reroutes', 'raises OPEX', 'raises TCE',
];

// ============================================================
// COMPONENT
// ============================================================

export default function LogicMapCanvas({ activeScenario, onEdgesChange }: LogicMapCanvasProps) {
    const [nodes, setNodes] = useState<ProcessNode[]>([]);
    const [edges, setEdges] = useState<ProcessEdge[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [linkMode, setLinkMode] = useState<string | null>(null);
    const [dragState, setDragState] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
    const [showAddMenu, setShowAddMenu] = useState<LogicNodeType | null>(null);
    const [varSearch, setVarSearch] = useState('');
    const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    // Ontology store for vessel nodes
    const ontologyObjects = useOntologyStore(s => s.objects);
    const vessels = useMemo(() => ontologyObjects.filter(o => o.type === 'Vessel' && o.metadata.status === 'active'), [ontologyObjects]);

    // ── Persistence ──
    useEffect(() => {
        (async () => {
            try {
                const map = await firestoreLoadLogicMap(activeScenario.id);
                if (map) {
                    setNodes(map.nodes || []);
                    setEdges(map.edges || []);
                }
            } catch {
                // Ignore load errors — start with empty canvas
            }
        })();
    }, [activeScenario.id]);

    const autoSave = useCallback((n: ProcessNode[], e: ProcessEdge[]) => {
        try { firestoreSaveLogicMap(activeScenario.id, n, e); } catch { /* ignore */ }
        onEdgesChange?.(e);
    }, [activeScenario.id, onEdgesChange]);

    // ── Node creation helpers ──
    const addGenericNode = (type: LogicNodeType, text: string, extra?: Partial<ProcessNode>) => {
        const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const offsetY = nodes.length * 70;
        const newNode: ProcessNode = { id, x: 40 + Math.random() * 200, y: 40 + offsetY % 400, type, text, ...extra };
        const next = [...nodes, newNode];
        setNodes(next);
        autoSave(next, edges);
        setShowAddMenu(null);
        setVarSearch('');
    };

    const addVariableNode = (variableId: string) => {
        const v = VARIABLE_MAP.get(variableId);
        if (!v) return;
        addGenericNode('variable', v.nameKo, { variableId });
    };

    const addVesselNode = (objectId: string) => {
        const obj = ontologyObjects.find(o => o.id === objectId);
        if (!obj) return;
        addGenericNode('vessel', obj.title, { objectId });
    };

    // ── Deletion ──
    const handleDeleteSelected = () => {
        if (!selectedNodeId) return;
        const nextNodes = nodes.filter(n => n.id !== selectedNodeId);
        const nextEdges = edges.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId);
        setNodes(nextNodes);
        setEdges(nextEdges);
        setSelectedNodeId(null);
        autoSave(nextNodes, nextEdges);
    };

    const handleDeleteEdge = (edgeId: string) => {
        const next = edges.filter(e => e.id !== edgeId);
        setEdges(next);
        autoSave(nodes, next);
    };

    // ── Drag logic ──
    const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();

        if (linkMode) {
            if (linkMode !== id) {
                const edgeId = `edge-${Date.now()}`;
                const exists = edges.some(
                    edge => (edge.source === linkMode && edge.target === id) ||
                        (edge.source === id && edge.target === linkMode)
                );
                if (!exists) {
                    const nextEdges = [...edges, { id: edgeId, source: linkMode, target: id, label: '' }];
                    setEdges(nextEdges);
                    autoSave(nodes, nextEdges);
                }
            }
            setLinkMode(null);
            return;
        }

        setSelectedNodeId(id);
        const node = nodes.find(n => n.id === id);
        if (!node || !canvasRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        setDragState({
            id,
            offsetX: e.clientX - rect.left - node.x,
            offsetY: e.clientY - rect.top - node.y,
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragState || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width - NODE_W, e.clientX - rect.left - dragState.offsetX));
        const y = Math.max(0, Math.min(rect.height - NODE_H, e.clientY - rect.top - dragState.offsetY));

        setNodes(prev => prev.map(n => n.id === dragState.id ? { ...n, x, y } : n));
    };

    const handleMouseUp = () => {
        if (dragState) {
            autoSave(nodes, edges);
        }
        setDragState(null);
    };

    const handleBackgroundClick = () => {
        setSelectedNodeId(null);
        setLinkMode(null);
        setShowAddMenu(null);
    };

    // ── Node colors ──
    const getNodeStyle = (type: LogicNodeType) => {
        switch (type) {
            case 'trigger': return { bg: 'bg-rose-950/40', border: 'border-rose-700/50', text: 'text-rose-300', icon: <Zap size={13} className="text-rose-400" /> };
            case 'condition': return { bg: 'bg-amber-950/40', border: 'border-amber-700/50', text: 'text-amber-300', icon: <AlertTriangle size={13} className="text-amber-400" /> };
            case 'action': return { bg: 'bg-cyan-950/40', border: 'border-cyan-700/50', text: 'text-cyan-300', icon: <Shield size={13} className="text-cyan-400" /> };
            case 'outcome': return { bg: 'bg-emerald-950/40', border: 'border-emerald-700/50', text: 'text-emerald-300', icon: <TrendingUp size={13} className="text-emerald-400" /> };
            case 'variable': return { bg: 'bg-violet-950/40', border: 'border-violet-700/50', text: 'text-violet-300', icon: <Fuel size={13} className="text-violet-400" /> };
            case 'vessel': return { bg: 'bg-sky-950/40', border: 'border-sky-700/50', text: 'text-sky-300', icon: <Ship size={13} className="text-sky-400" /> };
        }
    };

    const getEdgeColor = (sourceType: LogicNodeType) => {
        switch (sourceType) {
            case 'trigger': return '#f43f5e';
            case 'condition': return '#f59e0b';
            case 'action': return '#06b6d4';
            case 'outcome': return '#10b981';
            case 'variable': return '#8b5cf6';
            case 'vessel': return '#0ea5e9';
            default: return '#64748b';
        }
    };

    // ── Filtered variable list ──
    const filteredVars = useMemo(() => {
        if (!varSearch.trim()) return SCENARIO_VARIABLE_CATALOG.slice(0, 12);
        const q = varSearch.toLowerCase();
        return SCENARIO_VARIABLE_CATALOG.filter(v =>
            v.nameKo.toLowerCase().includes(q) || v.name.toLowerCase().includes(q)
        ).slice(0, 12);
    }, [varSearch]);

    // ── Update edge label ──
    const updateEdgeLabel = (edgeId: string, label: string) => {
        const next = edges.map(e => e.id === edgeId ? { ...e, label } : e);
        setEdges(next);
        autoSave(nodes, next);
    };

    return (
        <div className="relative select-none">
            {/* Toolbar */}
            <div className="flex items-center gap-1 mb-3 flex-wrap">
                {/* Standard node types */}
                {(['trigger', 'condition', 'action', 'outcome'] as LogicNodeType[]).map(type => {
                    const style = getNodeStyle(type);
                    const labels: Record<string, string> = {
                        trigger: '트리거', condition: '조건', action: '대응', outcome: '결과',
                    };
                    return (
                        <button
                            key={type}
                            onClick={() => addGenericNode(type, `${labels[type]} ${nodes.filter(n => n.type === type).length + 1}`)}
                            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all hover:scale-105",
                                style.bg, style.border, style.text
                            )}
                        >
                            <Plus size={10} /> {labels[type]}
                        </button>
                    );
                })}

                <div className="w-px h-5 bg-slate-700 mx-1" />

                {/* Variable node dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setShowAddMenu(showAddMenu === 'variable' ? null : 'variable')}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-violet-950/40 border-violet-700/50 text-violet-300 text-[10px] font-bold transition-all hover:scale-105"
                    >
                        <Plus size={10} /> 변수 <ChevronDown size={9} />
                    </button>
                    {showAddMenu === 'variable' && (
                        <div className="absolute top-full left-0 mt-1 w-[240px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-2" onClick={e => e.stopPropagation()}>
                            <div className="relative mb-2">
                                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="text" value={varSearch} onChange={e => setVarSearch(e.target.value)}
                                    placeholder="변수 검색..." title="변수 검색"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-[10px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500"
                                    autoFocus
                                />
                            </div>
                            <div className="max-h-[200px] overflow-y-auto custom-scrollbar space-y-0.5">
                                {filteredVars.map(v => {
                                    const meta = CATEGORY_META[v.category];
                                    const alreadyAdded = nodes.some(n => n.variableId === v.id);
                                    return (
                                        <button
                                            key={v.id}
                                            onClick={() => !alreadyAdded && addVariableNode(v.id)}
                                            disabled={alreadyAdded}
                                            className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[10px] transition-all",
                                                alreadyAdded ? "text-slate-600 cursor-default" : "text-slate-300 hover:bg-slate-800"
                                            )}
                                        >
                                            <span className="text-[9px]">{meta.icon}</span>
                                            <span className="flex-1 truncate">{v.nameKo}</span>
                                            {alreadyAdded && <span className="text-[8px] text-violet-600">추가됨</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Vessel node dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setShowAddMenu(showAddMenu === 'vessel' ? null : 'vessel')}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-sky-950/40 border-sky-700/50 text-sky-300 text-[10px] font-bold transition-all hover:scale-105"
                    >
                        <Plus size={10} /> 선박 <ChevronDown size={9} />
                    </button>
                    {showAddMenu === 'vessel' && (
                        <div className="absolute top-full left-0 mt-1 w-[240px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-2" onClick={e => e.stopPropagation()}>
                            <div className="max-h-[200px] overflow-y-auto custom-scrollbar space-y-0.5">
                                {vessels.map(v => {
                                    const alreadyAdded = nodes.some(n => n.objectId === v.id);
                                    return (
                                        <button
                                            key={v.id}
                                            onClick={() => !alreadyAdded && addVesselNode(v.id)}
                                            disabled={alreadyAdded}
                                            className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[10px] transition-all",
                                                alreadyAdded ? "text-slate-600 cursor-default" : "text-slate-300 hover:bg-slate-800"
                                            )}
                                        >
                                            <Ship size={11} className="text-sky-400" />
                                            <span className="flex-1 truncate">{v.title}</span>
                                            <span className="text-[8px] text-slate-500">{`${v.properties.riskScore || 0}`}</span>
                                            {alreadyAdded && <span className="text-[8px] text-sky-600">추가됨</span>}
                                        </button>
                                    );
                                })}
                                {vessels.length === 0 && <div className="text-[10px] text-slate-500 text-center py-3">선박 없음</div>}
                            </div>
                        </div>
                    )}
                </div>

                <div className="w-px h-5 bg-slate-700 mx-1" />

                {/* Link + Delete controls */}
                <button
                    onClick={() => selectedNodeId ? setLinkMode(selectedNodeId) : null}
                    className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border",
                        linkMode ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "bg-slate-800/40 border-slate-700/40 text-slate-400 hover:text-slate-200"
                    )}
                    title="노드 연결 (노드 선택 후 클릭)"
                >
                    <LinkIcon size={10} /> 연결
                </button>
                <button
                    onClick={handleDeleteSelected}
                    disabled={!selectedNodeId}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-400 hover:text-rose-400 text-[10px] font-bold transition-all disabled:opacity-30"
                    title="선택 노드 삭제"
                >
                    <Trash2 size={10} /> 삭제
                </button>

                {linkMode && (
                    <div className="flex items-center gap-1 text-[9px] text-amber-400 animate-pulse">
                        <span>→ 대상 노드를 클릭하세요</span>
                        <button onClick={() => setLinkMode(null)} className="text-slate-500 hover:text-slate-300"><X size={10} /></button>
                    </div>
                )}

                {/* Node count */}
                <span className="ml-auto text-[9px] text-slate-600 font-mono">{nodes.length} nodes · {edges.length} edges</span>
            </div>

            {/* Canvas */}
            <div
                ref={canvasRef}
                className="relative w-full bg-slate-950/60 border border-slate-800/50 rounded-xl overflow-hidden cursor-crosshair"
                style={{ height: 420 }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={handleBackgroundClick}
            >
                {/* Grid pattern */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#334155" strokeWidth="0.3" opacity="0.4" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>

                {/* Edges */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                            <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
                        </marker>
                    </defs>
                    {edges.map(edge => {
                        const src = nodes.find(n => n.id === edge.source);
                        const tgt = nodes.find(n => n.id === edge.target);
                        if (!src || !tgt) return null;

                        const x1 = src.x + NODE_W / 2;
                        const y1 = src.y + NODE_H / 2;
                        const x2 = tgt.x + NODE_W / 2;
                        const y2 = tgt.y + NODE_H / 2;
                        const mx = (x1 + x2) / 2;
                        const my = (y1 + y2) / 2;
                        const color = getEdgeColor(src.type);

                        return (
                            <g key={edge.id}>
                                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2} opacity={0.6} markerEnd="url(#arrowhead)" />
                                {/* Click target (invisible wider line) */}
                                <line
                                    x1={x1} y1={y1} x2={x2} y2={y2}
                                    stroke="transparent" strokeWidth={12}
                                    className="pointer-events-auto cursor-pointer"
                                    onClick={e => { e.stopPropagation(); setEditingEdgeId(editingEdgeId === edge.id ? null : edge.id); }}
                                />
                                {/* Edge label */}
                                {edge.label && (
                                    <text x={mx} y={my - 6} textAnchor="middle" fill={color} fontSize={9} fontWeight="bold" className="pointer-events-none">
                                        {edge.label}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>

                {/* Edge label editor popup */}
                {editingEdgeId && (() => {
                    const edge = edges.find(e => e.id === editingEdgeId);
                    if (!edge) return null;
                    const src = nodes.find(n => n.id === edge.source);
                    const tgt = nodes.find(n => n.id === edge.target);
                    if (!src || !tgt) return null;
                    const mx = (src.x + tgt.x) / 2 + NODE_W / 2;
                    const my = (src.y + tgt.y) / 2 + NODE_H / 2;
                    return (
                        <div
                            className="absolute z-50 bg-slate-900 border border-slate-700 rounded-lg p-2 shadow-xl"
                            style={{ left: mx - 80, top: my + 10 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="text-[9px] text-slate-500 mb-1">관계 라벨</div>
                            <div className="flex flex-wrap gap-1 mb-1.5">
                                {EDGE_LABEL_PRESETS.map(label => (
                                    <button
                                        key={label}
                                        onClick={() => { updateEdgeLabel(editingEdgeId, label); setEditingEdgeId(null); }}
                                        className="px-1.5 py-0.5 rounded text-[8px] bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 transition-colors"
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    defaultValue={edge.label || ''}
                                    placeholder="커스텀 라벨"
                                    className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500"
                                    onKeyDown={e => { if (e.key === 'Enter') { updateEdgeLabel(editingEdgeId, (e.target as HTMLInputElement).value); setEditingEdgeId(null); } }}
                                />
                                <button
                                    onClick={() => { handleDeleteEdge(editingEdgeId); setEditingEdgeId(null); }}
                                    className="px-1.5 py-1 text-rose-400 hover:bg-rose-950/30 rounded border border-rose-700/30"
                                    title="엣지 삭제"
                                >
                                    <Trash2 size={10} />
                                </button>
                            </div>
                        </div>
                    );
                })()}

                {/* Nodes */}
                {nodes.map(node => {
                    const style = getNodeStyle(node.type);
                    const isSelected = selectedNodeId === node.id;
                    const isLinkSource = linkMode === node.id;

                    return (
                        <div
                            key={node.id}
                            className={cn(
                                "absolute rounded-xl border-2 px-3 py-2 cursor-grab active:cursor-grabbing transition-shadow",
                                style.bg, style.border,
                                isSelected && "ring-2 ring-cyan-500/50 shadow-lg shadow-cyan-500/10",
                                isLinkSource && "ring-2 ring-amber-500/50",
                                linkMode && !isLinkSource && "hover:ring-2 hover:ring-amber-400/40"
                            )}
                            style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
                            onMouseDown={e => handleNodeMouseDown(e, node.id)}
                        >
                            <div className="flex items-center gap-1.5">
                                {style.icon}
                                <span className={cn("text-[10px] font-bold truncate flex-1", style.text)}>
                                    {node.text}
                                </span>
                            </div>
                            <div className="text-[8px] text-slate-500 mt-0.5 truncate">
                                {node.type === 'variable' && node.variableId && (
                                    <span className="text-violet-500">{VARIABLE_MAP.get(node.variableId)?.unit || ''}</span>
                                )}
                                {node.type === 'vessel' && <span className="text-sky-500">Vessel Object</span>}
                                {!['variable', 'vessel'].includes(node.type) && (
                                    <span className="uppercase tracking-widest">{node.type}</span>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* Empty state */}
                {nodes.length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
                        <Network size={32} className="mb-2 opacity-40" />
                        <p className="text-xs font-medium">인과관계 로직 트리</p>
                        <p className="text-[10px] mt-1">상단 버튼으로 노드를 추가하고 연결하세요</p>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Export helper: extract causal edges for quantEngine consumption.
 * Returns a simplified list of cause→effect pairs.
 */
export function getLogicMapEdges(edges: ProcessEdge[], nodes: ProcessNode[]): Array<{
    sourceType: LogicNodeType;
    sourceLabel: string;
    sourceVariableId?: string;
    targetType: LogicNodeType;
    targetLabel: string;
    targetObjectId?: string;
    label: string;
}> {
    return edges.map(e => {
        const src = nodes.find(n => n.id === e.source);
        const tgt = nodes.find(n => n.id === e.target);
        if (!src || !tgt) return null;
        return {
            sourceType: src.type,
            sourceLabel: src.text,
            sourceVariableId: src.variableId,
            targetType: tgt.type,
            targetLabel: tgt.text,
            targetObjectId: tgt.objectId,
            label: e.label || '',
        };
    }).filter(Boolean) as any;
}
