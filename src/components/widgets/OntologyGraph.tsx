import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Network, Plus, Share2, Workflow, Save, Trash2, GitMerge, MousePointer2, PlusCircle, Folder, Sparkles, Loader2, X, Maximize2, Minimize2, Link2, Unlink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useOntologyStore } from '../../store/ontologyStore';
import type { OntologyObject, OntologyLink as OntologyLinkType, OntologyObjectType, OntologyLinkRelation } from '../../types';

// ============================================================
// TYPES
// ============================================================
interface GraphNode {
    id: string;
    label: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    type: OntologyObjectType;
    radius: number;
    color: string;
    borderColor: string;
    riskScore: number;
    expanded: boolean; // whether connected nodes are revealed
    visible: boolean;  // whether this node is visible in the graph
    /** Module 2: true when this node is affected by a QuantMetrics riskAlert */
    isQuantRiskAlert: boolean;
}

interface GraphLink {
    id: string;
    source: string;
    target: string;
    weight: number;
    relationType: string;
    visible: boolean;
}

interface OntologyGraphProps {
    onSelectObject?: (id: string | null) => void;
    selectedObjectId?: string | null;
    onSelectLink?: (linkId: string | null) => void;
    selectedLinkId?: string | null;
    isFullScreen?: boolean;
    onToggleFullScreen?: () => void;
}

const RELATION_OPTIONS: { value: OntologyLinkRelation; label: string; color: string }[] = [
    { value: 'OPERATES_AT', label: '운항 위치', color: '#06b6d4' },
    { value: 'SAILS', label: '항해 경로', color: '#38bdf8' },
    { value: 'CALLS_AT', label: '기항', color: '#a855f7' },
    { value: 'INSURES', label: '보험 관계', color: '#22c55e' },
    { value: 'TRIGGERS', label: '유발', color: '#f97316' },
    { value: 'EXPOSES_TO', label: '리스크 노출', color: '#ef4444' },
    { value: 'AFFECTS_COST', label: '비용 영향', color: '#eab308' },
    { value: 'AT_RISK', label: '위험 근접', color: '#f43f5e' },
    { value: 'NEAR', label: '지리적 근접', color: '#64748b' },
    { value: 'IMPACTS', label: '인과 영향', color: '#f59e0b' },
    { value: 'COMPETES_WITH', label: '경쟁 관계', color: '#8b5cf6' },
];

// ============================================================
// CONSTANTS
// ============================================================
const TYPE_CONFIG: Record<string, { color: string; icon: string; baseRadius: number }> = {
    Vessel: { color: '#06b6d4', icon: '⛴', baseRadius: 22 },
    Port: { color: '#a855f7', icon: '⚓', baseRadius: 20 },
    Route: { color: '#38bdf8', icon: '🧭', baseRadius: 18 },
    MarketIndicator: { color: '#10b981', icon: '📊', baseRadius: 18 },
    RiskEvent: { color: '#ef4444', icon: '⚡', baseRadius: 24 },
};

function getRiskColor(score: number): string {
    if (score >= 80) return '#f43f5e'; // rose
    if (score >= 55) return '#f97316'; // orange
    if (score >= 30) return '#f59e0b'; // amber
    return '#10b981'; // emerald
}

function getRiskRadius(baseRadius: number, score: number): number {
    return baseRadius + Math.min(12, score / 10);
}

// ============================================================
// COMPONENT
// ============================================================
export default function OntologyGraph({ onSelectObject, selectedObjectId, onSelectLink, selectedLinkId, isFullScreen, onToggleFullScreen }: OntologyGraphProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Zustand store
    const storeObjects = useOntologyStore((s) => s.objects);
    const storeLinks = useOntologyStore((s) => s.links);
    const lsegQuantMetrics = useOntologyStore((s) => s.lsegQuantMetrics);

    // Graph state
    const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
    const [graphLinks, setGraphLinks] = useState<GraphLink[]>([]);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Interaction
    const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
    const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);
    const draggedNodeRef = useRef<GraphNode | null>(null);

    // Link creation mode
    const [linkCreationMode, setLinkCreationMode] = useState(false);
    const [linkDragSource, setLinkDragSource] = useState<GraphNode | null>(null);
    const linkDragCursorRef = useRef<{ x: number; y: number } | null>(null);
    const linkDragSourceRef = useRef<GraphNode | null>(null);
    const [showRelationPicker, setShowRelationPicker] = useState<{ sourceId: string; targetId: string; screenX: number; screenY: number } | null>(null);

    // Keep ref in sync with state for canvas tick closure
    useEffect(() => { linkDragSourceRef.current = linkDragSource; }, [linkDragSource]);

    // Selected link ref for canvas tick
    const selectedLinkIdRef = useRef<string | null>(null);
    useEffect(() => { selectedLinkIdRef.current = selectedLinkId ?? null; }, [selectedLinkId]);

    // Store actions
    const addLink = useOntologyStore((s) => s.addLink);
    const removeLink = useOntologyStore((s) => s.removeLink);

    // Figma-like pan/zoom
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);
    const [zoom, setZoom] = useState(1);
    const spaceHeldRef = useRef(false);
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

    const nodesRef = useRef<GraphNode[]>([]);
    const linksRef = useRef<GraphLink[]>([]);
    const animFrameRef = useRef<number>(0);
    const timeRef = useRef(0);
    const panRef = useRef({ x: 0, y: 0 });
    const zoomRef = useRef(1);

    // Sync pan/zoom refs
    useEffect(() => { panRef.current = { x: panX, y: panY }; }, [panX, panY]);
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    // Spacebar listener
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); spaceHeldRef.current = true; } };
        const onKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') { spaceHeldRef.current = false; isPanningRef.current = false; } };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
    }, []);

    // ============================================================
    // BUILD GRAPH NODES FROM STORE (only re-runs when objects change)
    // ============================================================
    useEffect(() => {
        const seedTypes: OntologyObjectType[] = ['Vessel', 'RiskEvent'];
        const seedIds = new Set<string>();

        const newNodes: GraphNode[] = [];
        const canvasW = canvasRef.current?.width || 800;
        const canvasH = canvasRef.current?.height || 600;
        const cx = canvasW / 2;
        const cy = canvasH / 2;

        storeObjects.forEach((obj, i) => {
            const cfg = TYPE_CONFIG[obj.type] || { color: '#64748b', icon: '?', baseRadius: 16 };
            const riskScore = (obj.properties.riskScore as number) || 0;
            const isSeed = seedTypes.includes(obj.type);

            if (isSeed) seedIds.add(obj.id);

            let isQuantRiskAlert = false;
            const ric = String(obj.properties.ric || obj.properties.symbol || '');
            if (ric && lsegQuantMetrics[ric]?.riskAlert) {
                isQuantRiskAlert = true;
            }
            if (obj.type === 'Vessel' && obj.properties.bunkerCostRisk === 'High') {
                isQuantRiskAlert = true;
            }

            // Preserve existing position if node already exists
            const existing = nodesRef.current.find(n => n.id === obj.id);
            const angle = (i / storeObjects.length) * Math.PI * 2;
            const radius_spread = isSeed ? 180 : 280;

            newNodes.push({
                id: obj.id,
                label: obj.title,
                x: existing?.x ?? (cx + Math.cos(angle) * radius_spread + (Math.random() - 0.5) * 40),
                y: existing?.y ?? (cy + Math.sin(angle) * radius_spread + (Math.random() - 0.5) * 40),
                vx: 0,
                vy: 0,
                type: obj.type,
                radius: getRiskRadius(cfg.baseRadius, riskScore),
                color: cfg.color,
                borderColor: getRiskColor(riskScore),
                riskScore,
                expanded: existing?.expanded ?? isSeed,
                visible: existing?.visible ?? isSeed,
                isQuantRiskAlert,
            });
        });

        setGraphNodes(newNodes);
        nodesRef.current = newNodes;
        setExpandedIds(prev => prev.size > 0 ? prev : seedIds);
    }, [storeObjects, lsegQuantMetrics]);

    // ============================================================
    // BUILD GRAPH LINKS FROM STORE (runs when links or nodes change)
    // ============================================================
    useEffect(() => {
        const currentNodes = nodesRef.current;
        const newLinks: GraphLink[] = storeLinks.map((link) => ({
            id: link.id,
            source: link.sourceId,
            target: link.targetId,
            weight: link.weight,
            relationType: link.relationType,
            visible: false,
        }));

        // Make links visible if both endpoints are visible
        newLinks.forEach((link) => {
            const src = currentNodes.find((n) => n.id === link.source);
            const tgt = currentNodes.find((n) => n.id === link.target);
            link.visible = !!(src?.visible && tgt?.visible);
        });

        setGraphLinks(newLinks);
        linksRef.current = newLinks;
    }, [storeLinks, graphNodes]);

    // Sync refs
    useEffect(() => { nodesRef.current = graphNodes; }, [graphNodes]);
    useEffect(() => { linksRef.current = graphLinks; }, [graphLinks]);

    // ============================================================
    // EXPAND NODE (double-click): reveal connected objects
    // ============================================================
    const expandNode = useCallback((nodeId: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            next.add(nodeId);
            return next;
        });

        setGraphNodes((prevNodes) => {
            const clickedNode = prevNodes.find((n) => n.id === nodeId);
            if (!clickedNode) return prevNodes;

            const connectedLinks = linksRef.current.filter(
                (l) => l.source === nodeId || l.target === nodeId,
            );

            const connectedIds = new Set<string>();
            connectedLinks.forEach((l) => {
                connectedIds.add(l.source === nodeId ? l.target : l.source);
            });

            // Reveal connected nodes with position near the parent
            const updated = prevNodes.map((node) => {
                if (connectedIds.has(node.id) && !node.visible) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 100 + Math.random() * 60;
                    return {
                        ...node,
                        visible: true,
                        x: clickedNode.x + Math.cos(angle) * dist,
                        y: clickedNode.y + Math.sin(angle) * dist,
                        vx: Math.cos(angle) * 2,
                        vy: Math.sin(angle) * 2,
                    };
                }
                if (node.id === nodeId) {
                    return { ...node, expanded: true };
                }
                return node;
            });

            // Update link visibility
            setGraphLinks((prevLinks) =>
                prevLinks.map((link) => {
                    const src = updated.find((n) => n.id === link.source);
                    const tgt = updated.find((n) => n.id === link.target);
                    return { ...link, visible: !!(src?.visible && tgt?.visible) };
                }),
            );

            return updated;
        });
    }, []);

    // ============================================================
    // COLLAPSE NODE (alt+click): hide non-seed connected nodes
    // ============================================================
    const collapseNode = useCallback((nodeId: string) => {
        const seedTypes: OntologyObjectType[] = ['Vessel', 'RiskEvent'];

        setExpandedIds((prev) => {
            const next = new Set(prev);
            next.delete(nodeId);
            return next;
        });

        setGraphNodes((prevNodes) => {
            const connectedLinks = linksRef.current.filter(
                (l) => l.source === nodeId || l.target === nodeId,
            );
            const connectedIds = new Set<string>();
            connectedLinks.forEach((l) => {
                connectedIds.add(l.source === nodeId ? l.target : l.source);
            });

            const updated = prevNodes.map((node) => {
                if (connectedIds.has(node.id) && !seedTypes.includes(node.type)) {
                    // Only hide if no other expanded node is connected to it
                    const otherExpandedConnection = linksRef.current.some(
                        (l) =>
                            ((l.source === node.id && l.target !== nodeId) || (l.target === node.id && l.source !== nodeId)) &&
                            prevNodes.find((n) => n.id === (l.source === node.id ? l.target : l.source))?.expanded,
                    );
                    if (!otherExpandedConnection) {
                        return { ...node, visible: false };
                    }
                }
                if (node.id === nodeId) {
                    return { ...node, expanded: false };
                }
                return node;
            });

            setGraphLinks((prevLinks) =>
                prevLinks.map((link) => {
                    const src = updated.find((n) => n.id === link.source);
                    const tgt = updated.find((n) => n.id === link.target);
                    return { ...link, visible: !!(src?.visible && tgt?.visible) };
                }),
            );

            return updated;
        });
    }, []);

    // ============================================================
    // CANVAS PHYSICS + RENDERING ENGINE
    // ============================================================
    useEffect(() => {
        if (!canvasRef.current) return;

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

        const alpha = 0.04;
        const friction = 0.65;
        const repulsion = 120;

        const tick = () => {
            timeRef.current += 0.016;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const currentNodes = nodesRef.current;
            const currentLinks = linksRef.current;
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;

            // Apply pan/zoom transform
            ctx.save();
            ctx.translate(panRef.current.x, panRef.current.y);
            ctx.scale(zoomRef.current, zoomRef.current);

            const visibleNodes = currentNodes.filter((n) => n.visible);
            const visibleLinks = currentLinks.filter((l) => l.visible);

            // Physics
            visibleNodes.forEach((node) => {
                if (draggedNodeRef.current?.id === node.id) {
                    node.vx = 0;
                    node.vy = 0;
                    return;
                }

                // Gravity
                node.vx += (cx - node.x) * 0.0008 * alpha;
                node.vy += (cy - node.y) * 0.0008 * alpha;

                // Repulsion
                visibleNodes.forEach((other) => {
                    if (node === other) return;
                    const dx = node.x - other.x;
                    const dy = node.y - other.y;
                    let l = Math.sqrt(dx * dx + dy * dy);
                    if (l === 0) l = 0.1;
                    if (l < repulsion) {
                        const f = alpha * (repulsion - l) / l * 1.5;
                        node.vx += dx * f;
                        node.vy += dy * f;
                    }
                });
            });

            // Link attraction
            visibleLinks.forEach((link) => {
                const source = visibleNodes.find((n) => n.id === link.source);
                const target = visibleNodes.find((n) => n.id === link.target);
                if (!source || !target) return;
                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const l = Math.sqrt(dx * dx + dy * dy);
                if (l > 0) {
                    const idealLength = 140 + (1 - link.weight) * 60;
                    const f = 0.015 * alpha * (l - idealLength);
                    if (draggedNodeRef.current?.id !== source.id) {
                        source.vx += dx * f;
                        source.vy += dy * f;
                    }
                    if (draggedNodeRef.current?.id !== target.id) {
                        target.vx -= dx * f;
                        target.vy -= dy * f;
                    }
                }
            });

            // Apply velocity
            visibleNodes.forEach((node) => {
                if (draggedNodeRef.current?.id === node.id) return;
                node.x += node.vx;
                node.y += node.vy;
                node.vx *= friction;
                node.vy *= friction;
                node.x = Math.max(node.radius + 5, Math.min(canvas.width - node.radius - 5, node.x));
                node.y = Math.max(node.radius + 5, Math.min(canvas.height - node.radius - 5, node.y));
            });

            // Time variable for animations (used in both links and nodes)
            const t = timeRef.current;

            // ---- DRAW LINKS ----
            visibleLinks.forEach((link) => {
                const source = visibleNodes.find((n) => n.id === link.source);
                const target = visibleNodes.find((n) => n.id === link.target);
                if (!source || !target) return;

                const isHovered = hoveredLink?.id === link.id;
                const isConnectedToSelected = selectedObjectId && (link.source === selectedObjectId || link.target === selectedObjectId);

                // Module 2: Red dashed animated link between quant-risk-alerted nodes
                const isBothQuantRisk = source.isQuantRiskAlert && target.isQuantRiskAlert;
                // Part 3: Risk propagation edge — one side is risk-alerted market, other is vessel
                const isRiskPropagation = !isBothQuantRisk && (
                    (source.isQuantRiskAlert && target.type === 'Vessel') ||
                    (target.isQuantRiskAlert && source.type === 'Vessel')
                );
                const isAtRisk = link.relationType === 'AT_RISK';

                ctx.beginPath();
                const cp1x = source.x + (target.x - source.x) / 3;
                const cp1y = source.y + (target.y - source.y) / 3 + 12;
                const cp2x = source.x + 2 * (target.x - source.x) / 3;
                const cp2y = source.y + 2 * (target.y - source.y) / 3 - 12;
                ctx.moveTo(source.x, source.y);
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, target.x, target.y);

                if (isBothQuantRisk) {
                    // Animated red dashed line for risk-linked pairs
                    ctx.strokeStyle = `rgba(255, 23, 68, ${0.4 + Math.sin(t * 4) * 0.2})`;
                    ctx.lineWidth = 3;
                    ctx.setLineDash([6, 4]);
                    ctx.lineDashOffset = -t * 30;
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.lineDashOffset = 0;
                } else if (isRiskPropagation) {
                    // Part 3: Thicker animated red-orange gradient for risk propagation to vessels
                    // Background glow stroke
                    ctx.save();
                    ctx.strokeStyle = `rgba(239, 68, 68, ${0.08 + Math.sin(t * 2) * 0.05})`;
                    ctx.lineWidth = 10;
                    ctx.stroke();
                    ctx.restore();

                    // Foreground animated dashed line
                    ctx.beginPath();
                    ctx.moveTo(source.x, source.y);
                    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, target.x, target.y);
                    const riskGrad = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
                    riskGrad.addColorStop(0, `rgba(239, 68, 68, ${0.5 + Math.sin(t * 3) * 0.2})`);
                    riskGrad.addColorStop(0.5, `rgba(249, 115, 22, ${0.6 + Math.sin(t * 3 + 1) * 0.2})`);
                    riskGrad.addColorStop(1, `rgba(239, 68, 68, ${0.5 + Math.sin(t * 3 + 2) * 0.2})`);
                    ctx.strokeStyle = riskGrad;
                    ctx.lineWidth = 4;
                    ctx.setLineDash([8, 5]);
                    ctx.lineDashOffset = -t * 40;
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.lineDashOffset = 0;

                    // "RISK" label at midpoint
                    const midX = (source.x + target.x) / 2;
                    const midY = (source.y + target.y) / 2;
                    ctx.font = 'bold 8px "JetBrains Mono", monospace';
                    ctx.fillStyle = '#0f172aDD';
                    const lbl = '⚡ RISK';
                    const lblW = ctx.measureText(lbl).width;
                    ctx.fillRect(midX - lblW / 2 - 4, midY - 6, lblW + 8, 14);
                    ctx.fillStyle = `rgba(239, 68, 68, ${0.7 + Math.sin(t * 3) * 0.3})`;
                    ctx.textAlign = 'center';
                    ctx.fillText(lbl, midX, midY + 4);
                } else if (isAtRisk) {
                    // AT_RISK: Animated orange-red dashed line for proximity-based risk
                    ctx.save();
                    ctx.strokeStyle = `rgba(251, 146, 60, ${0.1 + Math.sin(t * 2.5) * 0.06})`;
                    ctx.lineWidth = 8;
                    ctx.stroke();
                    ctx.restore();

                    ctx.beginPath();
                    ctx.moveTo(source.x, source.y);
                    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, target.x, target.y);
                    ctx.strokeStyle = `rgba(251, 146, 60, ${0.6 + Math.sin(t * 3) * 0.3})`;
                    ctx.lineWidth = 3;
                    ctx.setLineDash([5, 6]);
                    ctx.lineDashOffset = -t * 25;
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.lineDashOffset = 0;

                    // "⚠ AT_RISK" label
                    const midX = (source.x + target.x) / 2;
                    const midY = (source.y + target.y) / 2;
                    ctx.font = 'bold 7px "JetBrains Mono", monospace';
                    const atLabel = '⚠ AT_RISK';
                    const atLblW = ctx.measureText(atLabel).width;
                    ctx.fillStyle = '#0f172aDD';
                    ctx.fillRect(midX - atLblW / 2 - 3, midY - 5, atLblW + 6, 12);
                    ctx.fillStyle = `rgba(251, 146, 60, ${0.7 + Math.sin(t * 3) * 0.3})`;
                    ctx.textAlign = 'center';
                    ctx.fillText(atLabel, midX, midY + 3);
                } else {
                    const gradient = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
                    const opacityMultiplier = isConnectedToSelected || isHovered ? 1 : 0.35;
                    gradient.addColorStop(0, `${source.color}${Math.round(opacityMultiplier * 200).toString(16).padStart(2, '0')}`);
                    gradient.addColorStop(1, `${target.color}${Math.round(opacityMultiplier * 200).toString(16).padStart(2, '0')}`);

                    ctx.strokeStyle = gradient;
                    ctx.lineWidth = Math.max(1, link.weight * 3) * (isHovered || isConnectedToSelected ? 1.5 : 1);
                    ctx.stroke();
                }

                // Relation label at midpoint
                if (isHovered || isConnectedToSelected) {
                    const midX = (source.x + target.x) / 2;
                    const midY = (source.y + target.y) / 2;
                    ctx.font = '9px "JetBrains Mono", monospace';
                    ctx.fillStyle = '#94a3b8';
                    ctx.textAlign = 'center';
                    const labelBg = ctx.measureText(link.relationType);
                    ctx.fillStyle = '#0f172aCC';
                    ctx.fillRect(midX - labelBg.width / 2 - 4, midY - 6, labelBg.width + 8, 14);
                    ctx.fillStyle = '#94a3b8';
                    ctx.fillText(link.relationType, midX, midY + 4);
                }
            });

            // ---- DRAW NODES ----
            visibleNodes.forEach((node) => {
                const isSelected = selectedObjectId === node.id;
                const isHovered = hoveredNode?.id === node.id;
                const cfg = TYPE_CONFIG[node.type] || { icon: '?', baseRadius: 16 };

                // Module 2: Quant Risk Alert — Red pulse shadow (drawn BEFORE existing glow)
                if (node.isQuantRiskAlert) {
                    // Outer pulse ring — wide, soft red glow
                    const outerAlpha = 0.08 + Math.sin(t * 2.5 + 1.0) * 0.07;
                    const outerRadius = node.radius + 14 + Math.sin(t * 1.8) * 5;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, outerRadius, 0, Math.PI * 2);
                    const outerGlow = ctx.createRadialGradient(node.x, node.y, node.radius, node.x, node.y, outerRadius);
                    outerGlow.addColorStop(0, `rgba(255, 23, 68, ${outerAlpha})`);
                    outerGlow.addColorStop(1, 'rgba(255, 23, 68, 0)');
                    ctx.fillStyle = outerGlow;
                    ctx.fill();

                    // Inner pulse ring — tighter, brighter red
                    const innerAlpha = 0.2 + Math.sin(t * 3.5) * 0.1;
                    const innerRadius = node.radius + 6 + Math.sin(t * 3.0 + 0.5) * 3;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, innerRadius, 0, Math.PI * 2);
                    const innerGlow = ctx.createRadialGradient(node.x, node.y, node.radius - 2, node.x, node.y, innerRadius);
                    innerGlow.addColorStop(0, `rgba(255, 23, 68, ${innerAlpha})`);
                    innerGlow.addColorStop(1, 'rgba(255, 23, 68, 0)');
                    ctx.fillStyle = innerGlow;
                    ctx.fill();
                }

                // Risk-based pulsing glow for high-risk nodes
                if (node.riskScore >= 70) {
                    const pulseAlpha = 0.15 + Math.sin(t * 3 + node.riskScore * 0.1) * 0.1;
                    const pulseRadius = node.radius + 8 + Math.sin(t * 2.5) * 4;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, pulseRadius, 0, Math.PI * 2);
                    const glow = ctx.createRadialGradient(node.x, node.y, node.radius, node.x, node.y, pulseRadius);
                    glow.addColorStop(0, `${node.borderColor}${Math.round(pulseAlpha * 255).toString(16).padStart(2, '0')}`);
                    glow.addColorStop(1, `${node.borderColor}00`);
                    ctx.fillStyle = glow;
                    ctx.fill();
                }

                // Selection/hover ring
                if (isSelected || isHovered) {
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, node.radius + (isSelected ? 8 : 4), 0, Math.PI * 2);
                    ctx.fillStyle = `${node.borderColor}${isSelected ? '40' : '25'}`;
                    ctx.fill();

                    if (isSelected) {
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
                        ctx.strokeStyle = `${node.borderColor}60`;
                        ctx.lineWidth = 1;
                        ctx.setLineDash([4, 4]);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }
                }

                // Node body
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
                const bodyGrad = ctx.createRadialGradient(node.x - node.radius * 0.3, node.y - node.radius * 0.3, 0, node.x, node.y, node.radius);
                bodyGrad.addColorStop(0, '#1e293b');
                bodyGrad.addColorStop(1, '#0f172a');
                ctx.fillStyle = bodyGrad;
                ctx.fill();

                // Border with risk color
                ctx.strokeStyle = node.borderColor;
                ctx.lineWidth = isSelected ? 3 : 2;
                ctx.stroke();

                // Type icon
                ctx.font = `${Math.max(12, node.radius * 0.6)}px serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(cfg.icon, node.x, node.y);

                // Label
                ctx.font = isSelected ? 'bold 11px Inter, sans-serif' : '10px Inter, sans-serif';
                ctx.fillStyle = isSelected ? '#ffffff' : isHovered ? '#e2e8f0' : '#94a3b8';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                // Truncate long labels
                const maxLabelWidth = 90;
                let displayLabel = node.label;
                if (ctx.measureText(displayLabel).width > maxLabelWidth) {
                    while (ctx.measureText(displayLabel + '…').width > maxLabelWidth && displayLabel.length > 3) {
                        displayLabel = displayLabel.slice(0, -1);
                    }
                    displayLabel += '…';
                }
                ctx.fillText(displayLabel, node.x, node.y + node.radius + 6);

                // Small risk score badge
                if (node.riskScore > 0) {
                    const badgeX = node.x + node.radius * 0.7;
                    const badgeY = node.y - node.radius * 0.7;
                    const badgeR = 9;
                    ctx.beginPath();
                    ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
                    ctx.fillStyle = node.borderColor;
                    ctx.fill();
                    ctx.font = 'bold 8px "JetBrains Mono", monospace';
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(String(node.riskScore), badgeX, badgeY);
                }

                // Expand indicator (if connected but not expanded)
                if (!node.expanded) {
                    const connectedCount = linksRef.current.filter(
                        (l) => l.source === node.id || l.target === node.id,
                    ).length;
                    const hiddenCount = connectedCount - linksRef.current.filter(
                        (l) => l.visible && (l.source === node.id || l.target === node.id),
                    ).length;

                    if (hiddenCount > 0) {
                        const indX = node.x - node.radius * 0.7;
                        const indY = node.y - node.radius * 0.7;
                        ctx.beginPath();
                        ctx.arc(indX, indY, 8, 0, Math.PI * 2);
                        ctx.fillStyle = '#334155';
                        ctx.fill();
                        ctx.strokeStyle = '#64748b';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        ctx.font = 'bold 8px "JetBrains Mono", monospace';
                        ctx.fillStyle = '#94a3b8';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`+${hiddenCount}`, indX, indY);
                    }
                }
            });

            // ---- RUBBER-BAND LINE (link creation drag) ----
            const dragSrc = linkDragSourceRef.current;
            if (dragSrc && linkDragCursorRef.current) {
                const src = visibleNodes.find(n => n.id === dragSrc.id);
                if (src) {
                    const cursor = linkDragCursorRef.current;
                    ctx.beginPath();
                    ctx.moveTo(src.x, src.y);
                    ctx.lineTo(cursor.x, cursor.y);
                    ctx.strokeStyle = 'rgba(167, 139, 250, 0.7)';
                    ctx.lineWidth = 2.5;
                    ctx.setLineDash([6, 4]);
                    ctx.lineDashOffset = -timeRef.current * 30;
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.lineDashOffset = 0;

                    // Glow circle at source
                    ctx.beginPath();
                    ctx.arc(src.x, src.y, src.radius + 4, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(167, 139, 250, 0.5)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }

            // ---- HIGHLIGHT SELECTED LINK ----
            const curSelectedLinkId = selectedLinkIdRef.current;
            if (curSelectedLinkId) {
                const selLink = visibleLinks.find(l => l.id === curSelectedLinkId);
                if (selLink) {
                    const src = visibleNodes.find(n => n.id === selLink.source);
                    const tgt = visibleNodes.find(n => n.id === selLink.target);
                    if (src && tgt) {
                        ctx.beginPath();
                        ctx.moveTo(src.x, src.y);
                        ctx.lineTo(tgt.x, tgt.y);
                        ctx.strokeStyle = 'rgba(139, 92, 246, 0.9)';
                        ctx.lineWidth = 4;
                        ctx.setLineDash([8, 4]);
                        ctx.lineDashOffset = -timeRef.current * 25;
                        ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.lineDashOffset = 0;
                    }
                }
            }

            ctx.restore();

            animFrameRef.current = requestAnimationFrame(tick);
        };

        tick();

        return () => {
            cancelAnimationFrame(animFrameRef.current);
            window.removeEventListener('resize', updateSize);
        };
    }, [graphNodes, graphLinks, selectedObjectId, hoveredNode, hoveredLink]);

    // ============================================================
    // MOUSE HANDLERS
    // ============================================================
    const getMousePos = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        // Transform screen coords through inverse pan/zoom
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        return {
            x: (screenX - panRef.current.x) / zoomRef.current,
            y: (screenY - panRef.current.y) / zoomRef.current,
        };
    };

    const getNodeAt = (x: number, y: number) => {
        return nodesRef.current.filter((n) => n.visible).find((n) => {
            const dx = n.x - x;
            const dy = n.y - y;
            return Math.sqrt(dx * dx + dy * dy) <= n.radius + 5;
        }) || null;
    };

    const getLinkAt = (x: number, y: number) => {
        return linksRef.current.filter((l) => l.visible).find((l) => {
            const s = nodesRef.current.find((n) => n.id === l.source);
            const t = nodesRef.current.find((n) => n.id === l.target);
            if (!s || !t) return false;

            const A = x - s.x;
            const B = y - s.y;
            const C = t.x - s.x;
            const D = t.y - s.y;
            const dot = A * C + B * D;
            const len_sq = C * C + D * D;
            let param = -1;
            if (len_sq !== 0) param = dot / len_sq;
            let xx, yy;
            if (param < 0) { xx = s.x; yy = s.y; }
            else if (param > 1) { xx = t.x; yy = t.y; }
            else { xx = s.x + param * C; yy = s.y + param * D; }

            const dx = x - xx;
            const dy = y - yy;
            return Math.sqrt(dx * dx + dy * dy) < 10;
        }) || null;
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        // Spacebar held → start panning
        if (spaceHeldRef.current) {
            isPanningRef.current = true;
            panStartRef.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
            return;
        }
        const { x, y } = getMousePos(e);
        const clicked = getNodeAt(x, y);

        if (linkCreationMode) {
            if (clicked) {
                // Start rubber-band drag from this node
                setLinkDragSource(clicked);
                linkDragCursorRef.current = { x: clicked.x, y: clicked.y };
            }
            return;
        }

        if (clicked) {
            draggedNodeRef.current = clicked;
            onSelectObject?.(clicked.id);
            onSelectLink?.(null);
        } else {
            // Check if an edge was clicked
            const clickedLink = getLinkAt(x, y);
            if (clickedLink) {
                onSelectLink?.(clickedLink.id);
                onSelectObject?.(null);
            } else {
                onSelectObject?.(null);
                onSelectLink?.(null);
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        // Panning
        if (isPanningRef.current) {
            setPanX(panStartRef.current.panX + (e.clientX - panStartRef.current.x));
            setPanY(panStartRef.current.panY + (e.clientY - panStartRef.current.y));
            return;
        }

        const pos = getMousePos(e);

        // Link creation rubber-band
        if (linkCreationMode && linkDragSource) {
            linkDragCursorRef.current = { x: pos.x, y: pos.y };
            // Check if hovering over a potential target
            const target = getNodeAt(pos.x, pos.y);
            if (target && target.id !== linkDragSource.id) {
                setHoveredNode(target);
            } else {
                setHoveredNode(null);
            }
            return;
        }

        const node = getNodeAt(pos.x, pos.y);
        if (node !== hoveredNode) setHoveredNode(node);

        if (!node) {
            const link = getLinkAt(pos.x, pos.y);
            if (link !== hoveredLink) setHoveredLink(link);
        } else {
            if (hoveredLink) setHoveredLink(null);
        }

        if (draggedNodeRef.current) {
            draggedNodeRef.current.x = pos.x;
            draggedNodeRef.current.y = pos.y;
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        // Link creation: complete if dropped on a valid target
        if (linkCreationMode && linkDragSource) {
            const pos = getMousePos(e);
            const target = getNodeAt(pos.x, pos.y);
            if (target && target.id !== linkDragSource.id) {
                // Show relation type picker
                const rect = canvasRef.current?.getBoundingClientRect();
                setShowRelationPicker({
                    sourceId: linkDragSource.id,
                    targetId: target.id,
                    screenX: e.clientX - (rect?.left || 0),
                    screenY: e.clientY - (rect?.top || 0),
                });
            }
            setLinkDragSource(null);
            linkDragCursorRef.current = null;
            return;
        }
        draggedNodeRef.current = null;
        isPanningRef.current = false;
    };

    const handleCreateLink = async (relationType: OntologyLinkRelation) => {
        if (!showRelationPicker) return;
        const { sourceId, targetId } = showRelationPicker;
        await addLink({
            id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sourceId,
            targetId,
            relationType,
            weight: 0.7,
            metadata: { createdAt: new Date().toISOString() },
        });
        setShowRelationPicker(null);
    };

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.3, Math.min(3, zoomRef.current * delta));
        // Zoom towards mouse position
        const scale = newZoom / zoomRef.current;
        setPanX(mouseX - scale * (mouseX - panRef.current.x));
        setPanY(mouseY - scale * (mouseY - panRef.current.y));
        setZoom(newZoom);
    }, []);

    const handleDoubleClick = (e: React.MouseEvent) => {
        const { x, y } = getMousePos(e);
        const clicked = getNodeAt(x, y);
        if (clicked) {
            if (clicked.expanded) {
                collapseNode(clicked.id);
            } else {
                expandNode(clicked.id);
            }
        }
    };

    // ============================================================
    // EXPAND ALL / COLLAPSE ALL
    // ============================================================
    const handleExpandAll = () => {
        setGraphNodes((prev) => prev.map((n) => ({ ...n, visible: true, expanded: true })));
        setGraphLinks((prev) => prev.map((l) => ({ ...l, visible: true })));
        setExpandedIds(new Set(storeObjects.map((o) => o.id)));
    };

    const handleCollapseAll = () => {
        const seedTypes: OntologyObjectType[] = ['Vessel', 'RiskEvent'];
        setGraphNodes((prev) =>
            prev.map((n) => ({
                ...n,
                visible: seedTypes.includes(n.type),
                expanded: seedTypes.includes(n.type),
            })),
        );
        setGraphLinks((prev) => {
            const visible = new Set(nodesRef.current.filter((n) => seedTypes.includes(n.type)).map((n) => n.id));
            return prev.map((l) => ({ ...l, visible: visible.has(l.source) && visible.has(l.target) }));
        });
        setExpandedIds(new Set(storeObjects.filter((o) => seedTypes.includes(o.type)).map((o) => o.id)));
    };

    // Stats
    const visibleNodeCount = graphNodes.filter((n) => n.visible).length;
    const totalNodeCount = graphNodes.length;
    const visibleLinkCount = graphLinks.filter((l) => l.visible).length;

    const graphContent = (
        <div className={cn("w-full h-full relative bg-slate-950 overflow-hidden flex flex-col", isFullScreen && "fixed inset-0 z-[9999]")}>
            {/* Toolbar */}
            <div className="shrink-0 bg-slate-900/80 border-b border-slate-700/50 p-2.5 flex items-center gap-4 z-20">
                <div className="flex items-center gap-2 pr-4 border-r border-slate-700">
                    <Network className="text-cyan-400" size={16} />
                    <span className="text-sm font-semibold text-slate-100">Ontology Vertex Graph</span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExpandAll}
                        className="p-1.5 rounded-md transition-colors flex items-center text-xs gap-1 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                        title="모든 노드 확장"
                    >
                        <Maximize2 size={14} /> 전체 확장
                    </button>
                    <button
                        onClick={handleCollapseAll}
                        className="p-1.5 rounded-md transition-colors flex items-center text-xs gap-1 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10"
                        title="시드 노드만 표시"
                    >
                        <Minimize2 size={14} /> 축소
                    </button>

                    {/* Divider */}
                    <div className="w-px h-5 bg-slate-700" />

                    {/* Link Creation Mode Toggle */}
                    <button
                        onClick={() => { setLinkCreationMode(!linkCreationMode); setLinkDragSource(null); linkDragCursorRef.current = null; setShowRelationPicker(null); }}
                        className={cn(
                            "p-1.5 rounded-md transition-colors flex items-center text-xs gap-1.5 font-medium",
                            linkCreationMode
                                ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                                : "text-slate-400 hover:text-violet-400 hover:bg-violet-500/10"
                        )}
                        title="신경삭 추가 모드 (노드를 드래그하여 연결)"
                    >
                        <Link2 size={14} /> 신경삭 추가
                    </button>
                </div>

                <div className="ml-auto flex items-center gap-3 text-[10px] font-mono text-slate-500">
                    <span>Nodes: <span className="text-slate-300">{visibleNodeCount}</span>/{totalNodeCount}</span>
                    <span>Links: <span className="text-slate-300">{visibleLinkCount}</span></span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">ONTOLOGY STORE</span>

                    {/* Full-screen toggle */}
                    {onToggleFullScreen && (
                        <button
                            onClick={onToggleFullScreen}
                            className="p-1 rounded text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                            title={isFullScreen ? '축소' : '전체 화면'}
                        >
                            {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                    )}
                </div>
            </div>

            {/* Link Creation Mode Banner */}
            {linkCreationMode && (
                <div className="shrink-0 bg-violet-950/40 border-b border-violet-800/30 px-4 py-1.5 flex items-center gap-3 z-20">
                    <Link2 size={12} className="text-violet-400 animate-pulse" />
                    <span className="text-[11px] text-violet-300 font-medium">
                        노드에서 노드로 드래그하여 신경삭(연결)을 생성하세요
                    </span>
                    <button
                        onClick={() => { setLinkCreationMode(false); setLinkDragSource(null); }}
                        className="ml-auto text-[10px] text-violet-400 hover:text-violet-200 flex items-center gap-1 px-2 py-0.5 rounded bg-violet-900/30 hover:bg-violet-800/40 transition-colors"
                    >
                        <X size={10} /> 모드 종료
                    </button>
                </div>
            )}

            {/* Canvas */}
            <div className="flex-1 relative overflow-hidden">
                <canvas
                    ref={canvasRef}
                    className={cn(
                        'w-full h-full',
                        linkCreationMode
                            ? (linkDragSource ? 'cursor-crosshair' : hoveredNode ? 'cursor-cell' : 'cursor-crosshair')
                            : spaceHeldRef.current ? (isPanningRef.current ? 'cursor-grabbing' : 'cursor-grab') : hoveredNode ? 'cursor-pointer' : hoveredLink ? 'cursor-pointer' : 'cursor-default',
                    )}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={(e) => {
                        if (linkCreationMode) { setLinkDragSource(null); linkDragCursorRef.current = null; }
                        else handleMouseUp(e as unknown as React.MouseEvent);
                    }}
                    onDoubleClick={handleDoubleClick}
                    onWheel={handleWheel}
                    style={{
                        backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.03) 1px, transparent 0)',
                        backgroundSize: '24px 24px',
                    }}
                />

                {/* Relation Type Picker Overlay */}
                {showRelationPicker && (
                    <div
                        className="absolute z-50 bg-slate-900/95 backdrop-blur-lg border border-violet-500/40 rounded-xl shadow-2xl shadow-violet-900/30 p-2 min-w-[200px]"
                        style={{ left: showRelationPicker.screenX, top: showRelationPicker.screenY }}
                    >
                        <div className="text-[9px] text-violet-300 font-bold uppercase tracking-widest mb-2 px-2">관계 유형 선택</div>
                        <div className="space-y-0.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                            {RELATION_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => handleCreateLink(opt.value)}
                                    className="w-full text-left px-2.5 py-1.5 text-[11px] rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2 group"
                                >
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                                    <span className="text-slate-300 group-hover:text-white font-medium">{opt.label}</span>
                                    <span className="ml-auto text-[9px] text-slate-600 font-mono">{opt.value}</span>
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setShowRelationPicker(null)}
                            className="mt-1.5 w-full text-center text-[10px] text-slate-500 hover:text-slate-300 py-1 rounded hover:bg-slate-800 transition-colors"
                        >
                            취소
                        </button>
                    </div>
                )}

                {/* Legend */}
                <div className="absolute bottom-4 left-4 z-30 bg-slate-900/90 backdrop-blur border border-slate-700/50 rounded-xl p-3 shadow-xl">
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-2">Object Types</div>
                    <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                        {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
                            <div key={type} className="flex items-center gap-1.5">
                                <span className="text-sm">{cfg.icon}</span>
                                <span className="text-[9px] text-slate-400">{type}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-800/50 text-[9px] text-slate-500">
                        <span className="text-slate-400">더블클릭</span> = 확장/축소 · <span className="text-slate-400">클릭</span> = 상세 보기 · <span className="text-slate-400">Space+드래그</span> = 팬 · <span className="text-slate-400">스크롤</span> = 줌
                    </div>
                </div>

                {/* Hovered node tooltip */}
                {hoveredNode && !draggedNodeRef.current && !linkDragSource && (
                    <div
                        className="absolute z-40 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-lg p-3 shadow-xl pointer-events-none min-w-[180px]"
                        style={{
                            left: Math.min(hoveredNode.x + 20, (canvasRef.current?.width || 800) - 200),
                            top: hoveredNode.y - 20,
                        }}
                    >
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-sm">{TYPE_CONFIG[hoveredNode.type]?.icon}</span>
                            <span className="text-xs font-semibold text-slate-200">{hoveredNode.label}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">{hoveredNode.type}</span>
                            <span className="font-mono" style={{ color: hoveredNode.borderColor }}>Risk: {hoveredNode.riskScore}</span>
                        </div>
                        {!hoveredNode.expanded && (
                            <div className="mt-1.5 text-[9px] text-slate-500 italic">더블클릭하여 관계 탐색</div>
                        )}
                    </div>
                )}

                {/* Link drag target hint */}
                {linkDragSource && hoveredNode && hoveredNode.id !== linkDragSource.id && (
                    <div className="absolute z-40 bg-violet-900/90 backdrop-blur border border-violet-500/50 rounded-lg px-3 py-2 shadow-xl pointer-events-none"
                        style={{
                            left: Math.min((hoveredNode.x * zoomRef.current + panRef.current.x) + 25, (canvasRef.current?.width || 800) - 150),
                            top: (hoveredNode.y * zoomRef.current + panRef.current.y) - 15,
                        }}
                    >
                        <div className="text-[10px] text-violet-200 font-medium flex items-center gap-1.5">
                            <Link2 size={10} /> 연결: {hoveredNode.label}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    // Full-screen: render via portal
    if (isFullScreen) {
        return createPortal(graphContent, document.body);
    }

    return graphContent;
}
