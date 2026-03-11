import React, { useState, useRef, useEffect } from 'react';
import { Network, Plus, Trash2, Link as LinkIcon, Zap, Move, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Scenario } from '../../types';

interface ProcessNode {
    id: string;
    x: number;
    y: number;
    type: 'trigger' | 'condition' | 'action' | 'outcome';
    text: string;
}

interface ProcessEdge {
    id: string;
    source: string;
    target: string;
}

interface LogicMapCanvasProps {
    activeScenario: Scenario;
}

const NODE_W = 160;
const NODE_H = 44;

export default function LogicMapCanvas({ activeScenario }: LogicMapCanvasProps) {
    const [nodes, setNodes] = useState<ProcessNode[]>([]);
    const [edges, setEdges] = useState<ProcessEdge[]>([]);

    const [mode, setMode] = useState<'select' | 'connect'>('select');
    const [selectedNode, setSelectedNode] = useState<string | null>(null);
    const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    const containerRef = useRef<HTMLDivElement>(null);
    const draggingNodeRef = useRef<string | null>(null);
    const dragOffsetRef = useRef({ x: 0, y: 0 });

    // Load map from localStorage when scenario changes
    useEffect(() => {
        try {
            const savedMap = localStorage.getItem(`sidecar_logicmap_${activeScenario.id}`);
            if (savedMap) {
                const parsed = JSON.parse(savedMap);
                setNodes(parsed.nodes || []);
                setEdges(parsed.edges || []);
            } else {
                setNodes([]);
                setEdges([]);
            }
        } catch (e) {
            setNodes([]);
            setEdges([]);
        }
        setMode('select');
        setSelectedNode(null);
        setConnectingFrom(null);
    }, [activeScenario.id]);

    // Save automatically
    useEffect(() => {
        if (nodes.length > 0 || edges.length > 0) {
            localStorage.setItem(`sidecar_logicmap_${activeScenario.id}`, JSON.stringify({ nodes, edges }));
        } else {
            localStorage.removeItem(`sidecar_logicmap_${activeScenario.id}`);
        }
    }, [nodes, edges, activeScenario.id]);

    const handleAddNode = (type: ProcessNode['type']) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const cx = rect ? rect.width / 2 - NODE_W / 2 : 100;
        const cy = rect ? rect.height / 2 - NODE_H / 2 : 100;
        const newNode: ProcessNode = {
            id: `node_${Date.now()}`,
            x: cx + (Math.random() - 0.5) * 120,
            y: cy + (Math.random() - 0.5) * 80,
            type,
            text: type === 'trigger' ? '새로운 조건 발생' : type === 'condition' ? '판단 로직' : type === 'action' ? '대응 조치' : '최종 결론'
        };
        setNodes(prev => [...prev, newNode]);
        setSelectedNode(newNode.id);
        setMode('select');
    };

    const handleDeleteSelected = () => {
        if (!selectedNode) return;
        setNodes(nodes.filter(n => n.id !== selectedNode));
        setEdges(edges.filter(e => e.source !== selectedNode && e.target !== selectedNode));
        setSelectedNode(null);
    };

    const handleDeleteEdge = (edgeId: string) => {
        setEdges(edges.filter(e => e.id !== edgeId));
    };

    const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();

        if (mode === 'connect') {
            if (!connectingFrom) {
                setConnectingFrom(id);
            } else if (connectingFrom !== id) {
                const exists = edges.find(ed => ed.source === connectingFrom && ed.target === id);
                if (!exists) {
                    setEdges(prev => [...prev, { id: `edge_${Date.now()}`, source: connectingFrom, target: id }]);
                }
                // Stay in connect mode for chaining
                setConnectingFrom(null);
            }
            return;
        }

        // Selection / Drag setup
        setSelectedNode(id);
        const node = nodes.find(n => n.id === id);
        if (node && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            dragOffsetRef.current = {
                x: e.clientX - rect.left - node.x,
                y: e.clientY - rect.top - node.y
            };
            draggingNodeRef.current = id;
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setMousePos({ x, y });

        if (draggingNodeRef.current && mode === 'select') {
            const nodeId = draggingNodeRef.current;
            setNodes(nodes.map(n => n.id === nodeId ? {
                ...n,
                x: Math.max(0, x - dragOffsetRef.current.x),
                y: Math.max(0, y - dragOffsetRef.current.y)
            } : n));
        }
    };

    const handleMouseUp = () => {
        draggingNodeRef.current = null;
    };

    const handleBackgroundClick = () => {
        setSelectedNode(null);
        if (mode === 'connect') {
            setConnectingFrom(null);
        }
    };

    const getNodeColor = (type: string) => {
        switch (type) {
            case 'trigger': return 'border-rose-500/50 bg-rose-950/40 text-rose-200';
            case 'condition': return 'border-amber-500/50 bg-amber-950/40 text-amber-200';
            case 'action': return 'border-cyan-500/50 bg-cyan-950/40 text-cyan-200';
            case 'outcome': return 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200';
            default: return 'border-slate-500/50 bg-slate-800 text-slate-200';
        }
    };

    const getEdgeColor = (sourceType: string) => {
        switch (sourceType) {
            case 'trigger': return '#f43f5e';
            case 'condition': return '#f59e0b';
            case 'action': return '#06b6d4';
            case 'outcome': return '#10b981';
            default: return '#64748b';
        }
    };

    // Prepare SVG links
    const connectingSourceNode = connectingFrom ? nodes.find(n => n.id === connectingFrom) : null;

    return (
        <div className="flex flex-col h-[500px] border border-slate-700/50 rounded-xl overflow-hidden bg-slate-950/50 mt-4 relative shadow-inner">

            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-700/50 z-20">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                        <Network size={12} className="text-purple-400" />
                        로직 트리
                    </span>
                    <div className="h-4 w-px bg-slate-700" />
                    <button
                        onClick={() => { setMode('select'); setConnectingFrom(null); }}
                        title="이동/선택 모드"
                        className={cn("px-2 py-1 rounded flex items-center gap-1 text-[10px] font-bold transition-all", mode === 'select' ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200")}
                    >
                        <Move size={11} /> 이동
                    </button>
                    <button
                        onClick={() => { setMode('connect'); setConnectingFrom(null); }}
                        title="연결 모드 — 노드를 순서대로 클릭하여 연결"
                        className={cn("px-2 py-1 rounded flex items-center gap-1 text-[10px] font-bold transition-all", mode === 'connect' ? "bg-cyan-900/40 text-cyan-400 ring-1 ring-cyan-500/30" : "text-slate-400 hover:text-cyan-400")}
                    >
                        <LinkIcon size={11} /> 연결
                    </button>
                </div>
                <div className="flex items-center gap-1.5">
                    <button onClick={() => handleAddNode('trigger')} title="트리거 추가" className="px-2 py-1 text-[10px] font-bold rounded border border-rose-900/50 text-rose-400 hover:bg-rose-900/30 transition">+ Trigger</button>
                    <button onClick={() => handleAddNode('condition')} title="조건 추가" className="px-2 py-1 text-[10px] font-bold rounded border border-amber-900/50 text-amber-400 hover:bg-amber-900/30 transition">+ Condition</button>
                    <button onClick={() => handleAddNode('action')} title="액션 추가" className="px-2 py-1 text-[10px] font-bold rounded border border-cyan-900/50 text-cyan-400 hover:bg-cyan-900/30 transition">+ Action</button>
                    <button onClick={() => handleAddNode('outcome')} title="결과 추가" className="px-2 py-1 text-[10px] font-bold rounded border border-emerald-900/50 text-emerald-400 hover:bg-emerald-900/30 transition">+ Outcome</button>
                    <div className="h-4 w-px bg-slate-700 mx-1" />
                    <button onClick={handleDeleteSelected} disabled={!selectedNode} title="선택 노드 삭제" className="p-1.5 text-slate-400 hover:text-rose-400 disabled:opacity-30 transition"><Trash2 size={13} /></button>
                </div>
            </div>

            {/* Connect mode banner */}
            {mode === 'connect' && (
                <div className="absolute top-[44px] left-1/2 -translate-x-1/2 z-30 bg-cyan-900/90 border border-cyan-500/40 px-4 py-1.5 rounded-b-lg text-[10px] text-cyan-200 font-bold flex items-center gap-2 shadow-lg backdrop-blur">
                    <LinkIcon size={10} />
                    {connectingFrom
                        ? '타겟 노드를 클릭하세요'
                        : '소스 노드를 클릭하세요'
                    }
                    <button onClick={() => { setMode('select'); setConnectingFrom(null); }} className="ml-2 p-0.5 text-cyan-400 hover:text-white" title="연결 모드 취소"><X size={12} /></button>
                </div>
            )}

            {/* Canvas Area */}
            <div
                ref={containerRef}
                className={cn("flex-1 relative overflow-hidden", mode === 'connect' ? "cursor-crosshair" : "cursor-default")}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={handleBackgroundClick}
                style={{
                    backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)',
                    backgroundSize: '20px 20px'
                }}
            >
                {/* Connection Lines (SVG) */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                    <defs>
                        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                            <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
                        </marker>
                        <marker id="arrowhead-hover" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                            <polygon points="0 0, 8 3, 0 6" fill="#ef4444" />
                        </marker>
                    </defs>

                    {/* Render saved edges */}
                    {edges.map(edge => {
                        const s = nodes.find(n => n.id === edge.source);
                        const t = nodes.find(n => n.id === edge.target);
                        if (!s || !t) return null;

                        // Right center of source → left center of target
                        const sx = s.x + NODE_W;
                        const sy = s.y + NODE_H / 2;
                        const tx = t.x;
                        const ty = t.y + NODE_H / 2;
                        const dx = Math.abs(tx - sx) * 0.4;
                        const edgeColor = getEdgeColor(s.type);

                        return (
                            <g key={edge.id}>
                                {/* Invisible click target */}
                                <path
                                    d={`M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`}
                                    stroke="transparent" strokeWidth="12" fill="none"
                                    className="pointer-events-auto cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteEdge(edge.id); }}
                                />
                                {/* Visible line */}
                                <path
                                    d={`M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`}
                                    stroke={edgeColor} strokeWidth="2" fill="none"
                                    markerEnd="url(#arrowhead)"
                                    opacity="0.7"
                                    className="pointer-events-none"
                                />
                                {/* Animated flow dots */}
                                <circle r="3" fill={edgeColor} opacity="0.8">
                                    <animateMotion
                                        dur="3s" repeatCount="indefinite"
                                        path={`M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`}
                                    />
                                </circle>
                            </g>
                        );
                    })}

                    {/* Render active connecting line */}
                    {mode === 'connect' && connectingSourceNode && (
                        <path
                            d={`M ${connectingSourceNode.x + NODE_W} ${connectingSourceNode.y + NODE_H / 2} C ${connectingSourceNode.x + NODE_W + 60} ${connectingSourceNode.y + NODE_H / 2}, ${mousePos.x - 60} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`}
                            stroke="#06b6d4" strokeWidth="2" strokeDasharray="6 4" fill="none" opacity="0.8"
                        />
                    )}
                </svg>

                <style dangerouslySetInnerHTML={{
                    __html: `
                    @keyframes dash { to { stroke-dashoffset: -1000; } }
                `}} />

                {/* Nodes (HTML) */}
                {nodes.map(node => (
                    <div
                        key={node.id}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        className={cn(
                            "absolute p-2.5 rounded-lg border-2 shadow-lg backdrop-blur flex flex-col gap-0.5 transition-all duration-150",
                            mode === 'select' ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                            getNodeColor(node.type),
                            selectedNode === node.id && "ring-2 ring-white/70 ring-offset-2 ring-offset-slate-950 shadow-xl",
                            connectingFrom === node.id && "ring-2 ring-cyan-400 animate-pulse shadow-cyan-500/30 shadow-xl",
                            mode === 'connect' && connectingFrom && connectingFrom !== node.id && "hover:ring-2 hover:ring-cyan-400/50"
                        )}
                        style={{ left: node.x, top: node.y, width: NODE_W }}
                    >
                        <div className="text-[9px] font-bold uppercase opacity-60 tracking-wider">
                            {node.type}
                        </div>
                        <input
                            type="text"
                            value={node.text}
                            onChange={(e) => {
                                setNodes(nodes.map(n => n.id === node.id ? { ...n, text: e.target.value } : n));
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="노드 설명 입력"
                            className="bg-transparent text-xs font-medium w-full focus:outline-none focus:bg-slate-900/50 rounded px-1 -mx-1"
                        />
                    </div>
                ))}

                {/* Empty state */}
                {nodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-center">
                        <div>
                            <Network size={32} className="text-slate-700 mx-auto mb-3" />
                            <p className="text-sm text-slate-500 font-medium">시나리오 로직 트리가 비어있습니다</p>
                            <p className="text-[10px] text-slate-600 mt-1">상단 버튼으로 Trigger, Condition, Action, Outcome 노드를 추가하세요</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="bg-slate-900/90 border-t border-slate-700/50 px-3 py-1.5 flex items-center justify-between z-20">
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Zap size={10} className="text-amber-400" /> AI가 이 로직 구조를 분석하여 브리핑에 자동 반영합니다.
                </span>
                <span className="text-[10px] text-slate-500 font-mono">{nodes.length} Nodes · {edges.length} Links</span>
            </div>
        </div>
    );
}
