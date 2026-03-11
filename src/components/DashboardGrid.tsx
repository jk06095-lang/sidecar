/**
 * DashboardGrid — Drag-and-resize grid layout for dashboard widgets.
 * Uses react-grid-layout with 12-column system.
 * Supports edit mode (unlock to drag/resize) and locked mode.
 * Persists user layout to localStorage.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactGridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Lock, Unlock, GripVertical, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';

type LayoutItem = ReactGridLayout.Layout;

const STORAGE_KEY = 'sidecar_grid_layout';
const COLS = 12;
const ROW_HEIGHT = 80;
const MARGIN: [number, number] = [12, 12];

export interface GridWidgetItem {
    id: string;
    defaultLayout: LayoutItem;
    title: string;
    visible: boolean;
    component: React.ReactNode;
}

interface DashboardGridProps {
    widgets: GridWidgetItem[];
}

function loadSavedLayout(): LayoutItem[] | null {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return null;
}

function saveLayout(layout: LayoutItem[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch { /* ignore */ }
}

export default function DashboardGrid({ widgets }: DashboardGridProps) {
    const [isEditMode, setIsEditMode] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(1200);

    // Measure container width
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Build layout: merge saved positions with default positions
    const [layout, setLayout] = useState<LayoutItem[]>(() => {
        const saved = loadSavedLayout();
        const visibleWidgets = widgets.filter(w => w.visible);
        if (saved) {
            const savedMap = new Map(saved.map(l => [l.i, l]));
            return visibleWidgets.map(w => {
                const s = savedMap.get(w.id);
                if (s) return { ...s, i: w.id };
                return { ...w.defaultLayout, i: w.id };
            });
        }
        return visibleWidgets.map(w => ({ ...w.defaultLayout, i: w.id }));
    });

    // Re-sync layout when widget visibility changes
    useEffect(() => {
        const visibleIds = new Set(widgets.filter(w => w.visible).map(w => w.id));
        setLayout(prev => {
            const currentIds = new Set(prev.map(l => l.i));
            const additions = widgets
                .filter(w => w.visible && !currentIds.has(w.id))
                .map(w => ({ ...w.defaultLayout, i: w.id }));
            const filtered = prev.filter(l => visibleIds.has(l.i));
            if (additions.length === 0 && filtered.length === prev.length) return prev;
            return [...filtered, ...additions];
        });
    }, [widgets]);

    const handleLayoutChange = useCallback((newLayout: LayoutItem[]) => {
        setLayout(newLayout);
        saveLayout(newLayout);
    }, []);

    const handleResetLayout = useCallback(() => {
        const visibleWidgets = widgets.filter(w => w.visible);
        const defaultLayout = visibleWidgets.map(w => ({ ...w.defaultLayout, i: w.id }));
        setLayout(defaultLayout);
        saveLayout(defaultLayout);
    }, [widgets]);

    const visibleWidgets = widgets.filter(w => w.visible);
    const widgetMap = new Map(visibleWidgets.map(w => [w.id, w]));

    return (
        <div ref={containerRef} className="relative">
            {/* Edit Mode Toggle Bar */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsEditMode(!isEditMode)}
                        className={cn(
                            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border',
                            isEditMode
                                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                                : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-700/50 hover:text-slate-200'
                        )}
                    >
                        {isEditMode ? <Unlock size={13} /> : <Lock size={13} />}
                        {isEditMode ? '🔓 편집 모드' : '🔒 레이아웃 고정'}
                    </button>
                    {isEditMode && (
                        <button
                            onClick={handleResetLayout}
                            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] font-medium bg-slate-800/50 text-slate-500 border border-slate-700/50 hover:text-slate-300 hover:bg-slate-700/50 transition-all"
                        >
                            <RotateCcw size={12} />
                            초기화
                        </button>
                    )}
                </div>
                {isEditMode && (
                    <span className="text-[10px] text-amber-500/70 font-mono animate-pulse">
                        ⠿ 위젯을 드래그하여 위치를 변경하세요
                    </span>
                )}
            </div>

            {/* Grid Container */}
            <div className={cn(
                'relative rounded-xl transition-all duration-300',
                isEditMode && 'dashboard-grid-edit-bg'
            )}>
                {containerWidth > 0 && (
                    <ReactGridLayout
                        className="dashboard-grid-layout"
                        layout={layout}
                        cols={COLS}
                        rowHeight={ROW_HEIGHT}
                        width={containerWidth}
                        margin={MARGIN}
                        isDraggable={isEditMode}
                        isResizable={isEditMode}
                        draggableHandle=".grid-drag-handle"
                        onLayoutChange={handleLayoutChange}
                        compactType="vertical"
                        useCSSTransforms={true}
                    >
                        {layout.map(l => {
                            const widget = widgetMap.get(l.i);
                            if (!widget) return <div key={l.i} />;
                            return (
                                <div
                                    key={l.i}
                                    className={cn(
                                        'relative rounded-xl overflow-hidden transition-shadow duration-200',
                                        isEditMode && 'ring-1 ring-slate-600/50 hover:ring-amber-500/40 shadow-lg'
                                    )}
                                >
                                    {/* Drag Handle (edit mode only) */}
                                    {isEditMode && (
                                        <div className="grid-drag-handle absolute top-0 left-0 right-0 z-30 flex items-center gap-1.5 px-2 py-1 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700/50 cursor-grab active:cursor-grabbing">
                                            <GripVertical size={12} className="text-amber-500/70" />
                                            <span className="text-[10px] text-slate-400 font-medium truncate">{widget.title}</span>
                                        </div>
                                    )}
                                    {/* Widget Content */}
                                    <div className={cn('h-full w-full', isEditMode && 'pt-6')}>
                                        {widget.component}
                                    </div>
                                </div>
                            );
                        })}
                    </ReactGridLayout>
                )}
            </div>
        </div>
    );
}
