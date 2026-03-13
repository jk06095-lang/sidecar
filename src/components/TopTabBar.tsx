/**
 * TopTabBar — Clean browser-like tab bar for page navigation.
 * Tabs are text-only (no icons). Navigation arrows + notification bell on the far right.
 */
import { useState, useRef, useEffect } from 'react';
import {
    X, Bell, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '../lib/utils';

// Tab label registry — 4-Pillar Architecture
const TAB_LABELS: Record<string, string> = {
    workspace: 'Workspace 통합관제',
    ontology: 'Ontology 데이터베이스',
    scenario: 'AIP Scenario',
    'action-center': 'Action Center 결재/보고',
    settings: 'SETTINGS',
    // Legacy mapping (backward compat)
    home: 'Workspace 통합관제',
    reports: 'Action Center',
    news: 'Workspace',
    'scenario-builder': 'AIP Scenario',
    'data-analysis': 'Workspace',
    editor: 'Action Center',
    'api-manager': 'Action Center',
};

export interface Notification {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'success' | 'error';
    timestamp: Date;
    read: boolean;
}

interface TopTabBarProps {
    activeTab: string;
    openTabs: string[];
    onTabClick: (tab: string) => void;
    onTabClose: (tab: string) => void;
    notifications: Notification[];
    onNotificationRead: (id: string) => void;
    onClearNotifications: () => void;
}

export default function TopTabBar({
    activeTab,
    openTabs,
    onTabClick,
    onTabClose,
    notifications,
    onNotificationRead,
    onClearNotifications,
}: TopTabBarProps) {
    const [showNotifications, setShowNotifications] = useState(false);
    const notifRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const unreadCount = notifications.filter(n => !n.read).length;

    // Close notification panel on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
                setShowNotifications(false);
            }
        };
        if (showNotifications) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showNotifications]);

    const scrollTabs = (direction: 'left' | 'right') => {
        scrollRef.current?.scrollBy({ left: direction === 'left' ? -150 : 150, behavior: 'smooth' });
    };

    const getNotifDot = (type: string) => {
        switch (type) {
            case 'success': return 'bg-emerald-400';
            case 'warning': return 'bg-amber-400';
            case 'error': return 'bg-rose-400';
            default: return 'bg-cyan-400';
        }
    };

    const getNotifBadge = (type: string) => {
        switch (type) {
            case 'success': return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400';
            case 'warning': return 'bg-amber-500/20 border-amber-500/40 text-amber-400';
            case 'error': return 'bg-rose-500/20 border-rose-500/40 text-rose-400';
            default: return 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400';
        }
    };

    return (
        <div className="h-10 bg-slate-900/80 border-b border-slate-800/60 flex items-center select-none shrink-0 backdrop-blur-sm">
            {/* Tabs */}
            <div
                ref={scrollRef}
                className="flex-1 flex items-end gap-0 overflow-x-hidden h-full"
            >
                {openTabs.map((tabId) => {
                    const label = TAB_LABELS[tabId] || tabId;
                    const isActive = tabId === activeTab;
                    return (
                        <div
                            key={tabId}
                            onClick={() => onTabClick(tabId)}
                            className={cn(
                                'relative flex items-center gap-1.5 px-4 h-[34px] mt-auto cursor-pointer transition-all duration-150 group min-w-[80px] max-w-[180px]',
                                isActive
                                    ? 'bg-slate-950 text-white rounded-t-lg border-t border-x border-slate-700/50 z-10'
                                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 rounded-t-md'
                            )}
                        >
                            <span className="text-[11px] font-medium truncate">{label}</span>
                            {tabId !== 'home' && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onTabClose(tabId); }}
                                    className={cn(
                                        'ml-auto shrink-0 p-0.5 rounded transition-colors',
                                        isActive ? 'text-slate-500 hover:text-rose-400 hover:bg-slate-800' : 'opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-400'
                                    )}
                                    title="닫기"
                                >
                                    <X size={10} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Right controls: arrows + bell */}
            <div className="flex items-center gap-0.5 px-2 border-l border-slate-800/60 h-full shrink-0">
                {/* Tab scroll arrows */}
                <button
                    onClick={() => scrollTabs('left')}
                    className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 rounded transition-colors"
                    title="이전 탭"
                >
                    <ChevronLeft size={14} />
                </button>
                <button
                    onClick={() => scrollTabs('right')}
                    className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 rounded transition-colors"
                    title="다음 탭"
                >
                    <ChevronRight size={14} />
                </button>

                {/* Notification bell */}
                <div ref={notifRef} className="relative ml-1">
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className={cn(
                            'p-1.5 rounded transition-colors relative',
                            showNotifications ? 'text-cyan-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'
                        )}
                        title="알림"
                    >
                        <Bell size={14} />
                        {unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center px-0.5 animate-pulse">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {/* Notification dropdown */}
                    {showNotifications && (
                        <div className="absolute right-0 top-full mt-2 w-[360px] max-h-[480px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-slide-up">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60">
                                <div className="flex items-center gap-2">
                                    <Bell size={14} className="text-cyan-400" />
                                    <span className="text-sm font-semibold text-white">알림</span>
                                    {unreadCount > 0 && (
                                        <span className="text-[10px] font-bold bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded-full">
                                            {unreadCount} new
                                        </span>
                                    )}
                                </div>
                                {notifications.length > 0 && (
                                    <button
                                        onClick={onClearNotifications}
                                        className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        모두 읽기
                                    </button>
                                )}
                            </div>
                            <div className="overflow-y-auto max-h-[400px] custom-scrollbar">
                                {notifications.length === 0 ? (
                                    <div className="py-8 text-center text-slate-600 text-xs">
                                        <Bell size={24} className="mx-auto mb-2 opacity-30" />
                                        알림이 없습니다
                                    </div>
                                ) : (
                                    notifications.map(n => (
                                        <div
                                            key={n.id}
                                            onClick={() => onNotificationRead(n.id)}
                                            className={cn(
                                                'px-4 py-3 border-b border-slate-800/30 cursor-pointer transition-colors hover:bg-slate-800/40',
                                                !n.read && 'bg-slate-800/20'
                                            )}
                                        >
                                            <div className="flex items-start gap-2">
                                                <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', getNotifDot(n.type), n.read && 'opacity-30')} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className={cn('text-xs font-semibold', n.read ? 'text-slate-400' : 'text-white')}>{n.title}</span>
                                                        <span className={cn('text-[8px] px-1.5 py-0.5 rounded border', getNotifBadge(n.type))}>{n.type}</span>
                                                    </div>
                                                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                                                    <span className="text-[9px] text-slate-600 mt-1 block">
                                                        {n.timestamp.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
