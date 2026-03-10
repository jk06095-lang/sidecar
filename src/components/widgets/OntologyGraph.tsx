import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Network, Plus, Share2, Workflow, Save, Trash2, GitMerge, MousePointer2, PlusCircle, Folder, Sparkles, Loader2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { fetchGeminiBriefing } from '../../services/geminiService';

interface Node {
    id: string;
    label: string;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    type: 'news' | 'factor' | 'system' | 'object';
    radius: number;
    color: string;
}

interface Link {
    source: string;
    target: string;
    value: number;
    aiInsight?: string;
    id: string; // Needed for selection
}

interface OntologyGraphProps {
    data: any[];
}

const COLORS = {
    system: '#06b6d4', // cyan-500
    factor: '#f59e0b', // amber-500
    news: '#10b981',   // emerald-500
    object: '#3b82f6', // blue-500
};

export default function OntologyGraph({ data }: OntologyGraphProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [links, setLinks] = useState<Link[]>([]);
    const [multiverses, setMultiverses] = useState<{ id: string, name: string }[]>([{ id: 'default', name: 'Main Database' }]);
    const [activeMultiverse, setActiveMultiverse] = useState('default');

    // Interaction states
    const [mode, setMode] = useState<'pan' | 'connect' | 'add'>('pan');
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [selectedLink, setSelectedLink] = useState<Link | null>(null);
    const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
    const [hoveredLink, setHoveredLink] = useState<Link | null>(null);

    // AI Generation State
    const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
    const draggedNodeRef = useRef<Node | null>(null);
    const connectingSourceRef = useRef<Node | null>(null);
    const mousePosRef = useRef({ x: 0, y: 0 });

    const nodesRef = useRef<Node[]>([]);
    const linksRef = useRef<Link[]>([]);

    // Use a stable fingerprint of data IDs to avoid re-running loadNetwork on every parent re-render
    const dataFingerprint = JSON.stringify(data.map((d: any) => d.id).sort());

    // Initialize from props and local storage
    useEffect(() => {
        const savedMeta = localStorage.getItem('sidecar_multiverses');
        if (savedMeta) {
            setMultiverses(JSON.parse(savedMeta));
        }

        const loadNetwork = () => {
            const savedNetwork = localStorage.getItem(`sidecar_network_${activeMultiverse}`);
            if (savedNetwork) {
                const { savedNodes, savedLinks } = JSON.parse(savedNetwork);

                // Sync with canonical data to ensure we don't lose updates from the list view
                const syncedNodes = savedNodes.map((n: Node) => {
                    const canonical = data.find(d => d.id === n.id);
                    if (canonical) {
                        return { ...n, label: canonical.title.substring(0, 15) + '...' };
                    }
                    return n;
                });

                // Add any newly created data from the list view that isn't in this multiverse yet
                data.forEach(item => {
                    if (!syncedNodes.find((n: Node) => n.id === item.id)) {
                        syncedNodes.push({
                            id: item.id,
                            label: item.title.substring(0, 15) + '...',
                            type: item.type === 'factor' ? 'factor' : item.type === 'object_instance' ? 'object' : 'news',
                            radius: item.type === 'factor' ? 20 : item.type === 'object_instance' ? 22 : 15,
                            color: item.type === 'factor' ? COLORS.factor : item.type === 'object_instance' ? COLORS.object : COLORS.news,
                            x: Math.random() * 600 + 100,
                            y: Math.random() * 400 + 100,
                            vx: 0, vy: 0
                        });
                    }
                });

                setNodes(syncedNodes);
                setLinks(savedLinks);
                nodesRef.current = syncedNodes;
                linksRef.current = savedLinks;
            } else {
                // Initialize default
                let parsedNodes: Node[] = [
                    { id: 'core', label: 'SIDECAR Core', type: 'system', radius: 30, color: COLORS.system, x: 400, y: 300, vx: 0, vy: 0 }
                ];
                let parsedLinks: Link[] = [];

                data.forEach((item) => {
                    parsedNodes.push({
                        id: item.id,
                        label: item.title.substring(0, 15) + '...',
                        type: item.type === 'factor' ? 'factor' : item.type === 'object_instance' ? 'object' : 'news',
                        radius: item.type === 'factor' ? 20 : item.type === 'object_instance' ? 22 : 15,
                        color: item.type === 'factor' ? COLORS.factor : item.type === 'object_instance' ? COLORS.object : COLORS.news,
                        x: Math.random() * 600 + 100,
                        y: Math.random() * 400 + 100,
                        vx: 0, vy: 0
                    });
                    parsedLinks.push({ id: `link_${Date.now()}_${item.id}`, source: 'core', target: item.id, value: 1 });
                });

                setNodes(parsedNodes);
                setLinks(parsedLinks);
                nodesRef.current = parsedNodes;
                linksRef.current = parsedLinks;
            }
        };

        loadNetwork();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataFingerprint, activeMultiverse]);

    // CRITICAL: Keep refs always in sync with state
    useEffect(() => {
        nodesRef.current = nodes;
    }, [nodes]);
    useEffect(() => {
        linksRef.current = links;
    }, [links]);

    // Save functionality
    const saveNetwork = useCallback(() => {
        localStorage.setItem(`sidecar_network_${activeMultiverse}`, JSON.stringify({
            savedNodes: nodesRef.current,
            savedLinks: linksRef.current
        }));
        localStorage.setItem('sidecar_multiverses', JSON.stringify(multiverses));
    }, [activeMultiverse, multiverses]);

    const handleCreateMultiverse = () => {
        const id = `mv_${Date.now()}`;
        const name = prompt('새로운 멀티버스 이름을 입력하세요:');
        if (!name) return;
        const newMvs = [...multiverses, { id, name }];
        setMultiverses(newMvs);
        localStorage.setItem('sidecar_multiverses', JSON.stringify(newMvs));
        setActiveMultiverse(id);
    };

    const handleDeleteSelected = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!selectedNode || selectedNode.id === 'core') return;
        if (confirm(`'${selectedNode.label}' 노드를 이 신경망에서 삭제하시겠습니까?`)) {
            const newNodes = nodesRef.current.filter(n => n.id !== selectedNode.id);
            const newLinks = linksRef.current.filter(l => l.source !== selectedNode.id && l.target !== selectedNode.id);
            setNodes(newNodes);
            setLinks(newLinks);
            nodesRef.current = newNodes;
            linksRef.current = newLinks;
            setSelectedNode(null);
            setSelectedLink(null);
            saveNetwork();
        }
    };

    const handleDeleteSelectedLink = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!selectedLink) return;
        if (confirm(`선택한 연결(신경삭)을 삭제하시겠습니까?`)) {
            const newLinks = linksRef.current.filter(l => l.id !== selectedLink.id);
            setLinks(newLinks);
            linksRef.current = newLinks;
            setSelectedLink(null);
            saveNetwork();
        }
    };

    const handleAddNode = () => {
        const title = prompt('새로운 경영 요소(직접 추가)의 이름을 입력하세요:');
        if (!title) return;

        const newNode: Node = {
            id: `custom_${Date.now()}`,
            label: title.substring(0, 15),
            type: 'factor',
            radius: 20,
            color: COLORS.factor,
            x: 400,
            y: 300,
            vx: 0, vy: 0
        };

        const newNodes = [...nodesRef.current, newNode];
        setNodes(newNodes);
        nodesRef.current = newNodes;
        setSelectedNode(newNode);
        setMode('pan');
        saveNetwork();
    };

    // Physics Engine
    useEffect(() => {
        if (!canvasRef.current || nodes.length === 0) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const updateSize = () => {
            const rect = canvas.parentElement?.getBoundingClientRect();
            if (rect) {
                canvas.width = rect.width;
                canvas.height = rect.height;
            }
        };

        updateSize();
        window.addEventListener('resize', updateSize);

        let animationFrameId: number;
        // Tuned for mature, heavy physics
        const alpha = 0.05;
        const friction = 0.6;
        const repulsion = 100;

        const tick = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const currentNodes = nodesRef.current;
            const currentLinks = linksRef.current;
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;

            currentNodes.forEach(node => {
                if (draggedNodeRef.current?.id === node.id) {
                    node.vx = 0; node.vy = 0;
                    return; // Don't apply physics to dragged node
                }

                if (node.x === undefined || node.y === undefined) return;

                // Gentle gravity to center to keep things in view
                node.vx! += (cx - node.x) * 0.001 * alpha;
                node.vy! += (cy - node.y) * 0.001 * alpha;

                // Repulsion
                currentNodes.forEach(other => {
                    if (node === other) return;
                    if (other.x === undefined || other.y === undefined) return;
                    const dx = node.x - other.x;
                    const dy = node.y - other.y;
                    let l = Math.sqrt(dx * dx + dy * dy);
                    if (l === 0) l = 0.1;

                    if (l < repulsion) {
                        const f = alpha * (repulsion - l) / l;
                        node.vx! += dx * f;
                        node.vy! += dy * f;
                    }
                });
            });

            // Link Attraction
            currentLinks.forEach(link => {
                const source = currentNodes.find(n => n.id === link.source);
                const target = currentNodes.find(n => n.id === link.target);
                if (source?.x !== undefined && source?.y !== undefined && target?.x !== undefined && target?.y !== undefined) {
                    const dx = target.x - source.x;
                    const dy = target.y - source.y;
                    const l = Math.sqrt(dx * dx + dy * dy);
                    if (l > 0) {
                        const f = 0.02 * alpha * (l - 120);
                        if (draggedNodeRef.current?.id !== source.id) {
                            source.vx! += dx * f;
                            source.vy! += dy * f;
                        }
                        if (draggedNodeRef.current?.id !== target.id) {
                            target.vx! -= dx * f;
                            target.vy! -= dy * f;
                        }
                    }
                }
            });

            // Apply mechanics
            currentNodes.forEach(node => {
                if (draggedNodeRef.current?.id === node.id) return;
                if (node.x !== undefined && node.y !== undefined && node.vx !== undefined && node.vy !== undefined) {
                    node.x += node.vx;
                    node.y += node.vy;
                    node.vx *= friction;
                    node.vy *= friction;

                    // Bounds
                    node.x = Math.max(node.radius, Math.min(canvas.width - node.radius, node.x));
                    node.y = Math.max(node.radius, Math.min(canvas.height - node.radius, node.y));
                }
            });

            // Draw Links
            currentLinks.forEach(link => {
                const source = currentNodes.find(n => n.id === link.source);
                const target = currentNodes.find(n => n.id === link.target);
                if (source?.x !== undefined && source?.y !== undefined && target?.x !== undefined && target?.y !== undefined) {
                    ctx.beginPath();
                    ctx.moveTo(source.x, source.y);
                    const cp1x = source.x + (target.x - source.x) / 3;
                    const cp1y = source.y + (target.y - source.y) / 3 + 15;
                    const cp2x = source.x + 2 * (target.x - source.x) / 3;
                    const cp2y = source.y + 2 * (target.y - source.y) / 3 - 15;
                    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, target.x, target.y);

                    const isSelected = selectedLink?.id === link.id;
                    const isHovered = hoveredLink?.id === link.id;

                    const gradient = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
                    if (isSelected || isHovered) {
                        gradient.addColorStop(0, `${source.color}`);
                        gradient.addColorStop(1, `${target.color}`);
                    } else {
                        gradient.addColorStop(0, `${source.color}60`);
                        gradient.addColorStop(1, `${target.color}60`);
                    }

                    ctx.strokeStyle = gradient;
                    ctx.lineWidth = isSelected ? 3 : (isHovered ? 2 : 1.5);
                    if (link.aiInsight) {
                        ctx.setLineDash([8, 4]); // Dashed line for AI-analyzed edges
                    } else {
                        ctx.setLineDash([]);
                    }
                    ctx.stroke();
                    ctx.setLineDash([]); // Reset
                }
            });

            // Draw Connecting Line if in Connect mode
            if (connectingSourceRef.current && mode === 'connect') {
                const src = connectingSourceRef.current;
                if (src.x !== undefined && src.y !== undefined) {
                    ctx.beginPath();
                    ctx.moveTo(src.x, src.y);
                    ctx.lineTo(mousePosRef.current.x, mousePosRef.current.y);
                    ctx.strokeStyle = '#38bdf8'; // sky-400
                    ctx.setLineDash([5, 5]);
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }

            // Draw Nodes
            currentNodes.forEach(node => {
                if (node.x === undefined || node.y === undefined) return;

                const isSelected = selectedNode?.id === node.id;
                const isHovered = hoveredNode?.id === node.id;

                // Selection glow
                if (isSelected || isHovered) {
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, node.radius + (isSelected ? 6 : 3), 0, Math.PI * 2);
                    ctx.fillStyle = `${node.color}${isSelected ? '50' : '30'}`;
                    ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
                ctx.fillStyle = '#0f172a';
                ctx.fill();
                ctx.strokeStyle = node.color;
                ctx.lineWidth = isSelected ? 3 : 2;
                ctx.stroke();

                ctx.font = isSelected ? 'bold 11px Inter, sans-serif' : '10px Inter, sans-serif';
                ctx.fillStyle = isSelected ? '#ffffff' : '#94a3b8';
                ctx.textAlign = 'center';
                ctx.fillText(node.label, node.x, node.y + node.radius + 14);
            });

            animationFrameId = requestAnimationFrame(tick);
        };

        tick();

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', updateSize);
        };
    }, [nodes, links, selectedNode, hoveredNode, selectedLink, hoveredLink, mode]);

    // Canvas Mouse Handlers
    const getMousePos = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    const getNodeAt = (x: number, y: number) => {
        return nodesRef.current.find(n => {
            if (n.x === undefined || n.y === undefined) return false;
            const dx = n.x - x;
            const dy = n.y - y;
            return Math.sqrt(dx * dx + dy * dy) <= n.radius + 5;
        }) || null;
    };

    // Point to Line segment distance for edge hovering/clicking
    const getLinkAt = (x: number, y: number) => {
        return linksRef.current.find(l => {
            const s = nodesRef.current.find(n => n.id === l.source);
            const t = nodesRef.current.find(n => n.id === l.target);
            if (!s?.x || !s?.y || !t?.x || !t?.y) return false;

            const A = x - s.x;
            const B = y - s.y;
            const C = t.x - s.x;
            const D = t.y - s.y;

            const dot = A * C + B * D;
            const len_sq = C * C + D * D;
            let param = -1;
            if (len_sq !== 0) param = dot / len_sq;

            let xx, yy;
            if (param < 0) {
                xx = s.x; yy = s.y;
            } else if (param > 1) {
                xx = t.x; yy = t.y;
            } else {
                xx = s.x + param * C;
                yy = s.y + param * D;
            }

            const dx = x - xx;
            const dy = y - yy;
            return Math.sqrt(dx * dx + dy * dy) < 8; // 8px hit radius for edge
        }) || null;
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const { x, y } = getMousePos(e);
        const clickedNode = getNodeAt(x, y);
        const clickedLink = getLinkAt(x, y);

        if (clickedNode) {
            setSelectedNode(clickedNode);
            setSelectedLink(null);
            if (mode === 'connect') {
                connectingSourceRef.current = clickedNode;
            } else {
                draggedNodeRef.current = clickedNode;
            }
        } else if (clickedLink) {
            setSelectedLink(clickedLink);
            setSelectedNode(null);
        } else {
            setSelectedNode(null);
            setSelectedLink(null);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const pos = getMousePos(e);
        mousePosRef.current = pos;

        const node = getNodeAt(pos.x, pos.y);
        if (node !== hoveredNode) setHoveredNode(node);

        if (!node) {
            const link = getLinkAt(pos.x, pos.y);
            if (link !== hoveredLink) setHoveredLink(link);
        } else {
            setHoveredLink(null);
        }

        if (draggedNodeRef.current && mode === 'pan') {
            draggedNodeRef.current.x = pos.x;
            draggedNodeRef.current.y = pos.y;
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (mode === 'connect' && connectingSourceRef.current) {
            const { x, y } = getMousePos(e);
            const targetNode = getNodeAt(x, y);

            if (targetNode && targetNode.id !== connectingSourceRef.current.id) {
                // Check if link exists
                const existing = linksRef.current.find(l =>
                    (l.source === connectingSourceRef.current!.id && l.target === targetNode.id) ||
                    (l.target === connectingSourceRef.current!.id && l.source === targetNode.id)
                );

                if (!existing) {
                    const newLinkId = `link_${Date.now()}`;
                    const newLinks = [...linksRef.current, {
                        id: newLinkId,
                        source: connectingSourceRef.current.id,
                        target: targetNode.id,
                        value: 1
                    }];
                    setLinks(newLinks);
                    linksRef.current = newLinks;
                    saveNetwork();

                    // Generate AI Insight for this new edge
                    generateEdgeInsight(connectingSourceRef.current, targetNode, newLinkId);
                }
            }
            connectingSourceRef.current = null;
        }
        draggedNodeRef.current = null;
    };

    const generateEdgeInsight = async (source: Node, target: Node, linkId: string) => {
        const apiKey = localStorage.getItem('gemini_api_key');
        if (!apiKey) return;

        setIsGeneratingInsight(true);
        try {
            // Find full canonical data if possible
            const srcDoc = data.find(d => d.id === source.id) || { title: source.label, content: '사용자 정의 노드' };
            const tgtDoc = data.find(d => d.id === target.id) || { title: target.label, content: '사용자 정의 노드' };

            const prompt = `당신은 최고 수준의 엔터프라이즈 인텔리전스 AI입니다. 사용자가 온톨로지 신경망에서 두 개의 데이터 노드를 연결했습니다. 이 두 데이터가 어떻게 융합되어 어떤 비즈니스 시나리오 결론을 도출하는지 2~3문장으로 날카롭게 요약하세요. 
            노드 A: [${srcDoc.title}] - ${srcDoc.content}
            노드 B: [${tgtDoc.title}] - ${tgtDoc.content}`;

            const insight = await fetchGeminiBriefing(apiKey, prompt);

            // Update the link with the generated insight
            setLinks(prev => {
                const updated = prev.map(l => l.id === linkId ? { ...l, aiInsight: insight } : l);
                linksRef.current = updated;
                return updated;
            });
            saveNetwork();

        } catch (e) {
            console.error("Fusion failed", e);
        } finally {
            setIsGeneratingInsight(false);
        }
    };

    return (
        <div className="w-full h-full relative bg-slate-950 overflow-hidden flex flex-col">
            {/* Toolbar Row - sits ABOVE the canvas */}
            <div className="shrink-0 bg-slate-900/80 border-b border-slate-700/50 p-2.5 flex items-center gap-4 z-20" onMouseDown={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 pr-4 border-r border-slate-700">
                    <Folder className="text-cyan-400" size={16} />
                    <select
                        value={activeMultiverse}
                        onChange={(e) => { saveNetwork(); setActiveMultiverse(e.target.value); }}
                        className="bg-transparent text-sm font-semibold text-slate-100 focus:outline-none"
                    >
                        {multiverses.map(mv => (
                            <option key={mv.id} value={mv.id} className="bg-slate-900">{mv.name}</option>
                        ))}
                    </select>
                    <button onClick={handleCreateMultiverse} title="새로운 멀티버스 생성" className="text-slate-400 hover:text-cyan-400 p-1">
                        <PlusCircle size={14} />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setMode('pan')}
                        className={cn("p-1.5 rounded-md transition-colors flex items-center text-xs gap-1", mode === 'pan' ? "bg-cyan-500/20 text-cyan-400" : "text-slate-400 hover:text-slate-200")}
                        title="선택 및 이동"
                    >
                        <MousePointer2 size={16} /> 선택/이동
                    </button>
                    <button
                        onClick={() => setMode('connect')}
                        className={cn("p-1.5 rounded-md transition-colors flex items-center text-xs gap-1", mode === 'connect' ? "bg-purple-500/20 text-purple-400" : "text-slate-400 hover:text-slate-200")}
                        title="노드 드래그하여 연결"
                    >
                        <GitMerge size={16} /> 연결망 그리기
                    </button>
                    <button
                        onClick={handleAddNode}
                        className="p-1.5 rounded-md transition-colors flex items-center text-xs gap-1 text-slate-400 hover:text-amber-400"
                        title="새 노드 추가"
                    >
                        <Plus size={16} /> 새 노드
                    </button>
                    <div className="w-px h-4 bg-slate-700 mx-1"></div>
                    <button
                        onClick={saveNetwork}
                        className="p-1.5 rounded-md transition-colors flex items-center text-xs gap-1 text-slate-400 hover:text-emerald-400"
                        title="현재 멀티버스 저장"
                    >
                        <Save size={16} /> 저장
                    </button>
                </div>
            </div>

            {/* Main canvas area */}
            <div className="flex-1 relative overflow-hidden">
                <canvas
                    ref={canvasRef}
                    className={cn(
                        "w-full h-full",
                        mode === 'connect' ? "cursor-crosshair" : hoveredNode ? "cursor-pointer" : "cursor-default"
                    )}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)', backgroundSize: '24px 24px' }}
                />

                {/* Selection info panels - overlayed on bottom-left */}
                <div className="absolute bottom-4 left-4 z-30 flex flex-col gap-3 pointer-events-auto" onMouseDown={e => e.stopPropagation()}>
                    {selectedNode && (
                        <div className="bg-slate-900/90 backdrop-blur border border-slate-700 p-3 rounded-xl shadow-xl w-64 animate-slide-up">
                            <div className="text-[10px] font-bold tracking-widest uppercase mb-1 flex items-center justify-between" style={{ color: selectedNode.color }}>
                                <span>Selected {selectedNode.type}</span>
                                {selectedNode.id !== 'core' && (
                                    <button onClick={(e) => handleDeleteSelected(e)} className="text-slate-500 hover:text-rose-400 p-1"><Trash2 size={12} /></button>
                                )}
                            </div>
                            <div className="font-semibold text-slate-100 text-sm mb-2">{selectedNode.label}</div>
                            <p className="text-xs text-slate-400 leading-relaxed mb-3">
                                ID: {selectedNode.id.substring(0, 8)}...<br />
                                연결된 신경망: {links.filter(l => l.source === selectedNode.id || l.target === selectedNode.id).length}개
                            </p>
                            <button onClick={() => setSelectedNode(null)} className="w-full py-1.5 text-xs text-slate-400 bg-slate-800 hover:bg-slate-700 rounded transition-colors">닫기</button>
                        </div>
                    )}

                    {selectedLink && (
                        <div className="bg-slate-900/90 backdrop-blur border border-slate-700 p-4 rounded-xl shadow-2xl w-80 animate-slide-up relative">
                            <button onClick={() => setSelectedLink(null)} className="absolute top-3 right-3 text-slate-500 hover:text-slate-300"><X size={14} /></button>
                            <div className="text-[10px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2 text-purple-400">
                                <Sparkles size={12} /> AI Fusion Insight
                            </div>
                            <div className="flex items-center gap-2 mb-3 text-xs bg-slate-950 p-2 rounded border border-slate-800">
                                <span className="text-slate-300 truncate w-[110px]">{nodes.find(n => n.id === selectedLink.source)?.label}</span>
                                <GitMerge size={12} className="text-slate-500 shrink-0" />
                                <span className="text-slate-300 truncate w-[110px]">{nodes.find(n => n.id === selectedLink.target)?.label}</span>
                            </div>
                            {selectedLink.aiInsight ? (
                                <div className="text-sm text-slate-200 leading-relaxed bg-purple-950/20 p-3 rounded-lg border border-purple-900/30 font-serif">
                                    {selectedLink.aiInsight}
                                </div>
                            ) : (
                                <div className="text-xs text-slate-500 italic py-2 text-center">
                                    수동 연결됨. AI 분석 데이터가 없습니다.
                                </div>
                            )}
                            <div className="mt-4 flex justify-end">
                                <button onClick={(e) => handleDeleteSelectedLink(e)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-400 hover:bg-slate-800 rounded transition-colors">
                                    <Trash2 size={12} /> 연결 끊기
                                </button>
                            </div>
                        </div>
                    )}

                    {isGeneratingInsight && (
                        <div className="bg-purple-900/40 backdrop-blur border border-purple-500/30 p-3 rounded-xl shadow-xl w-64 flex flex-col items-center justify-center gap-2 animate-pulse">
                            <Loader2 size={20} className="text-purple-400 animate-spin" />
                            <span className="text-xs font-semibold text-purple-300">AI 융합 결론 도출 중 (Gemini)...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
