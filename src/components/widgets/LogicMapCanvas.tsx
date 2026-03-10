import React, { useState, useRef, useEffect } from 'react';
import { Network, Plus, Trash2, Link as LinkIcon, Download, Zap, Move } from 'lucide-react';
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
        // Prevent saving empty on initial mount if not needed, but safe to just sync
        if (nodes.length > 0 || edges.length > 0) {
            localStorage.setItem(`sidecar_logicmap_${activeScenario.id}`, JSON.stringify({ nodes, edges }));
        } else {
            localStorage.removeItem(`sidecar_logicmap_${activeScenario.id}`);
        }
    }, [nodes, edges, activeScenario.id]);

    const handleAddNode = (type: ProcessNode['type']) => {
        const newNode: ProcessNode = {
            id: `node_${Date.now()}`,
            x: 100 + Math.random() * 100,
            y: 100 + Math.random() * 100,
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

    const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
        if (mode === 'connect') {
            if (!connectingFrom) {
                setConnectingFrom(id);
            } else if (connectingFrom !== id) {
                // Check if connection already exists
                const exists = edges.find(ed => ed.source === connectingFrom && ed.target === id);
                if (!exists) {
                    setEdges(prev => [...prev, { id: `edge_${Date.now()}`, source: connectingFrom, target: id }]);
                }
                setConnectingFrom(null);
                setMode('select');
            }
            e.stopPropagation();
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
        e.stopPropagation();
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
            setMode('select');
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

    // Prepare SVG links
    const connectingSourceNode = connectingFrom ? nodes.find(n => n.id === connectingFrom) : null;

    return (
        <div className="flex flex-col h-[500px] border border-slate-700/50 rounded-xl overflow-hidden bg-slate-950/50 mt-6 relative shadow-inner">

            {/* Toolbar */}
            <div className="flex items-center justify-between p-3 bg-slate-900 border-b border-slate-700/50 z-20">
                <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                        <Network size={14} className="text-purple-400" />
                        시나리오 로직 트리
                    </span>
                    <div className="h-4 w-px bg-slate-700" />
                    <button onClick={() => setMode('select')} className={cn("p-1.5 rounded flex items-center gap-1 text-[10px] font-bold", mode === 'select' ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200")}>
                        <Move size={12} /> 이동/선택
                    </button>
                    <button onClick={() => setMode('connect')} className={cn("p-1.5 rounded flex items-center gap-1 text-[10px] font-bold", mode === 'connect' ? "bg-cyan-900/40 text-cyan-400" : "text-slate-400 hover:text-cyan-400")}>
                        <LinkIcon size={12} /> 연결하기
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => handleAddNode('trigger')} className="px-2 py-1 text-[10px] font-bold rounded border border-rose-900/50 text-rose-400 hover:bg-rose-900/30">+ Trigger</button>
                    <button onClick={() => handleAddNode('condition')} className="px-2 py-1 text-[10px] font-bold rounded border border-amber-900/50 text-amber-400 hover:bg-amber-900/30">+ Condition</button>
                    <button onClick={() => handleAddNode('action')} className="px-2 py-1 text-[10px] font-bold rounded border border-cyan-900/50 text-cyan-400 hover:bg-cyan-900/30">+ Action</button>
                    <button onClick={() => handleAddNode('outcome')} className="px-2 py-1 text-[10px] font-bold rounded border border-emerald-900/50 text-emerald-400 hover:bg-emerald-900/30">+ Outcome</button>
                    <div className="h-4 w-px bg-slate-700 mx-2" />
                    <button onClick={handleDeleteSelected} disabled={!selectedNode} className="p-1.5 text-slate-400 hover:text-rose-400 disabled:opacity-30"><Trash2 size={14} /></button>
                </div>
            </div>

            {/* Canvas Area */}
            <div
                ref={containerRef}
                className={cn("flex-1 relative cursor-crosshair overflow-hidden", mode === 'select' && "cursor-default")}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={handleBackgroundClick}
                style={{
                    backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)',
                    backgroundSize: '20px 20px'
                }}
            >
                {/* Connection Lines (SVG) */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
                        </marker>
                    </defs>

                    {/* Render saved edges */}
                    {edges.map(edge => {
                        const s = nodes.find(n => n.id === edge.source);
                        const t = nodes.find(n => n.id === edge.target);
                        if (!s || !t) return null;

                        // Center points roughly (assuming 160px width, 40px height per node)
                        const sx = s.x + 160; const sy = s.y + 20;
                        const tx = t.x; const ty = t.y + 20;

                        // Curved line with flowing dash animation
                        return (
                            <path
                                key={edge.id}
                                d={`M ${sx} ${sy} C ${sx + 50} ${sy}, ${tx - 50} ${ty}, ${tx} ${ty}`}
                                stroke="#0ea5e9" strokeWidth="2" fill="none"
                                markerEnd="url(#arrowhead)"
                                className="opacity-60"
                                strokeDasharray="5"
                                style={{ strokeDashoffset: 0, animation: 'dash 20s linear infinite' }}
                            />
                        );
                    })}

                    {/* Render active connecting line */}
                    {mode === 'connect' && connectingSourceNode && (
                        <path
                            d={`M ${connectingSourceNode.x + 160} ${connectingSourceNode.y + 20} C ${connectingSourceNode.x + 210} ${connectingSourceNode.y + 20}, ${mousePos.x - 50} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`}
                            stroke="#0ea5e9" strokeWidth="2" strokeDasharray="4 4" fill="none"
                        />
                    )}
                </svg>
                {/* Add a global style for the dash animation directly in the component for simplicity */}
                <style dangerouslySetInnerHTML={{
                    __html: `
                    @keyframes dash {
                        to { stroke-dashoffset: -1000; }
                    }
                `}} />

                {/* Nodes (HTML) */}
                {nodes.map(node => (
                    <div
                        key={node.id}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        className={cn(
                            "absolute w-40 p-2 rounded-lg border-2 shadow-lg cursor-grab active:cursor-grabbing backdrop-blur flex flex-col gap-1 transition-shadow",
                            getNodeColor(node.type),
                            selectedNode === node.id && "ring-2 ring-white ring-offset-2 ring-offset-slate-950 shadow-cyan-500/20",
                            connectingFrom === node.id && "ring-2 ring-cyan-500 animate-pulse"
                        )}
                        style={{ left: node.x, top: node.y }}
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
                            className="bg-transparent text-xs font-medium w-full focus:outline-none focus:bg-slate-900/50 rounded px-1 -mx-1"
                        />
                    </div>
                ))}
            </div>

            {/* AI Hint Footer */}
            <div className="bg-slate-900/90 border-t border-slate-700/50 p-2 flex items-center justify-between z-20">
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Zap size={10} className="text-amber-400" /> AI가 이 토큰 구조(Logic Array)를 분석하여 시나리오 브리핑에 자동 반영합니다.
                </span>
                <span className="text-[10px] text-slate-500 font-mono">{nodes.length} Nodes · {edges.length} Links</span>
            </div>
        </div>
    );
}
