import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Settings, Anchor,
  Activity, Menu, Database, Gavel,
  Star, Edit2, Check, X, Trash2, LogOut,
  ChevronRight, ChevronDown as ChevronDownIcon, FolderOpen, Folder, Copy,
  FileCheck, Clock,
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { Scenario } from '../types';
import {
  loadFavorites as firestoreLoadFavorites,
  saveFavorites as firestoreSaveFavorites,
  type FavoriteEntry,
} from '../services/firestoreService';
import { logout } from './AuthGate';
import { useActionStore } from '../store/actionStore';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (t: string) => void;
  scenarios: Scenario[];
  activeScenarioId: string;
  onScenarioQuickSwitch: (id: string) => void;
  onOpenSettings: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  onCopyScenario?: (id: string) => void;
  onDeleteScenario?: (id: string) => void;
}

const FAVORITES_KEY = 'sidecar_scenario_favorites';

function loadFavoritesLocal(): FavoriteEntry[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ============================================================
// 4-PILLAR NAVIGATION
// ============================================================
const NAV_PILLARS = [
  { id: 'workspace', label: 'Workspace', labelKo: '통합 관제', icon: LayoutDashboard },
  { id: 'ontology', label: 'Ontology', labelKo: '데이터베이스', icon: Database },
  { id: 'scenario', label: 'AIP Scenario', labelKo: '시뮬레이션', icon: Activity },
  { id: 'action-center', label: 'Action Center', labelKo: '결재/보고', icon: Gavel },
] as const;

export default function Sidebar({
  activeTab,
  setActiveTab,
  scenarios,
  activeScenarioId,
  onScenarioQuickSwitch,
  onOpenSettings,
  isMinimized = false,
  onToggleMinimize,
  onCopyScenario,
  onDeleteScenario,
}: SidebarProps) {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>(() => loadFavoritesLocal());
  const [editingFavId, setEditingFavId] = useState<string | null>(null);
  const [editAlias, setEditAlias] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    preset: true,
    custom: true,
    favorites: true,
  });

  // Action store counts for badge
  const pendingCount = useActionStore(s => s.draftActions.length + s.pendingApproval.length);
  const executedCount = useActionStore(s => s.executedActions.length);

  // Hydrate from Firestore on mount
  useEffect(() => {
    firestoreLoadFavorites().then(remote => {
      if (remote.length > 0) setFavorites(remote);
    });
  }, []);

  // Save to Firestore whenever favorites change
  useEffect(() => firestoreSaveFavorites(favorites), [favorites]);

  const navItemClass =
    `flex items-center gap-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 cursor-pointer transition-all duration-200 rounded-lg ${isMinimized ? 'justify-center mx-3' : 'px-4 mx-2'}`;
  const activeClass = 'bg-slate-800/80 text-cyan-400 font-medium shadow-inner';

  const getRiskColor = (scenario: Scenario) => {
    const s = scenario.params.newsSentimentScore;
    if (s > 80) return 'bg-rose-500';
    if (s > 50) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const isFavorited = (id: string) => favorites.some(f => f.scenarioId === id);

  const toggleFavorite = (scenarioId: string) => {
    if (isFavorited(scenarioId)) {
      setFavorites(prev => prev.filter(f => f.scenarioId !== scenarioId));
    } else {
      setFavorites(prev => [...prev, { scenarioId }]);
    }
  };

  const updateAlias = (scenarioId: string, alias: string) => {
    setFavorites(prev => prev.map(f => f.scenarioId === scenarioId ? { ...f, alias: alias.trim() || undefined } : f));
    setEditingFavId(null);
  };

  const removeFavorite = (scenarioId: string) => {
    setFavorites(prev => prev.filter(f => f.scenarioId !== scenarioId));
  };

  const getDisplayName = (scenario: Scenario) => {
    const fav = favorites.find(f => f.scenarioId === scenario.id);
    return fav?.alias || scenario.name;
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  // Categorize scenarios for file-tree
  const presetScenarios = scenarios.filter(s => !s.isCustom);
  const customScenarios = scenarios.filter(s => s.isCustom);
  const favScenarios = favorites
    .map(f => scenarios.find(s => s.id === f.scenarioId))
    .filter(Boolean) as Scenario[];

  // ---- File-tree scenario item ----
  const ScenarioItem = ({ s, indent = 0 }: { s: Scenario; indent?: number }) => {
    const isActive = activeScenarioId === s.id;
    const isFav = isFavorited(s.id);
    return (
      <div
        className={cn(
          "group flex items-center gap-1.5 py-1 px-2 rounded text-[11px] cursor-pointer transition-all",
          isActive
            ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/30"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
        )}
        style={{ paddingLeft: `${8 + indent * 12}px` }}
        onClick={() => onScenarioQuickSwitch(s.id)}
      >
        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', getRiskColor(s))} />
        <span className="truncate flex-1 font-mono text-[10px]">{getDisplayName(s)}</span>
        {/* Action buttons on hover */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id); }}
            title={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
            className="p-0.5"
          >
            <Star size={9} className={cn(isFav ? "text-amber-400 fill-amber-400" : "text-slate-600 hover:text-amber-400")} />
          </button>
          {s.isCustom && onCopyScenario && (
            <button onClick={(e) => { e.stopPropagation(); onCopyScenario(s.id); }} title="복제" className="p-0.5 text-slate-600 hover:text-cyan-400">
              <Copy size={9} />
            </button>
          )}
          {s.isCustom && onDeleteScenario && (
            <button onClick={(e) => { e.stopPropagation(); onDeleteScenario(s.id); }} title="삭제" className="p-0.5 text-slate-600 hover:text-rose-400">
              <Trash2 size={9} />
            </button>
          )}
        </div>
      </div>
    );
  };

  // ---- Folder header ----
  const FolderHeader = ({ label, count, catKey, icon }: { label: string; count: number; catKey: string; icon: React.ReactNode }) => (
    <div
      onClick={() => toggleCategory(catKey)}
      className="flex items-center gap-1.5 py-1 px-2 cursor-pointer text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors select-none"
    >
      {expandedCategories[catKey]
        ? <ChevronDownIcon size={10} className="text-slate-600" />
        : <ChevronRight size={10} className="text-slate-600" />}
      {icon}
      <span>{label}</span>
      <span className="ml-auto text-[9px] text-slate-600 font-mono">{count}</span>
    </div>
  );

  return (
    <div className={cn(
      "h-full bg-slate-950 flex flex-col border-r border-slate-800/50 overflow-y-auto custom-scrollbar shrink-0 transition-all duration-300",
      isMinimized ? "w-[72px]" : "w-64"
    )}>
      {/* Logo Area */}
      <div className={cn("flex items-center py-4 border-b border-slate-800/50", isMinimized ? "justify-center px-0 flex-col gap-4" : "justify-between px-4")}>
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
            <Anchor size={16} className="text-white" />
          </div>
          {!isMinimized && (
            <div className="shrink-0">
              <div className="text-cyan-400 font-bold text-sm tracking-wider">SIDECAR</div>
              <div className="text-[10px] text-slate-500 tracking-widest">AIP PLATFORM</div>
            </div>
          )}
        </div>
        <button onClick={onToggleMinimize} className="text-slate-500 hover:text-slate-300 transition-colors" title="사이드바 토글">
          <Menu size={18} />
        </button>
      </div>

      {/* ════════════ 4-PILLAR NAVIGATION ════════════ */}
      <div className="py-3 border-b border-slate-800/50 space-y-1">
        {NAV_PILLARS.map(pillar => {
          const Icon = pillar.icon;
          const isActive = activeTab === pillar.id;
          return (
            <div
              key={pillar.id}
              title={`${pillar.labelKo} (${pillar.label})`}
              className={cn(navItemClass, isActive && activeClass)}
              onClick={() => setActiveTab(pillar.id)}
            >
              <Icon size={isMinimized ? 20 : 16} className="shrink-0" />
              {!isMinimized && (
                <div className="flex items-center justify-between flex-1 min-w-0">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold tracking-wide">{pillar.labelKo}</span>
                    <span className="text-[8px] text-slate-600 uppercase tracking-widest">{pillar.label}</span>
                  </div>
                  {/* Action Center badges */}
                  {pillar.id === 'action-center' && pendingCount > 0 && (
                    <span className="ml-auto text-[8px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full animate-pulse">
                      {pendingCount}
                    </span>
                  )}
                  {pillar.id === 'action-center' && executedCount > 0 && pendingCount === 0 && (
                    <span className="ml-auto text-[8px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">
                      {executedCount}
                    </span>
                  )}
                </div>
              )}
              {/* Minimized badge */}
              {isMinimized && pillar.id === 'action-center' && pendingCount > 0 && (
                <div className="absolute top-0.5 right-1 w-2 h-2 bg-amber-500 rounded-full border border-slate-950 animate-pulse" />
              )}
            </div>
          );
        })}
      </div>

      {/* Dynamic Interaction Area */}
      <div className={cn("flex-1 overflow-y-auto px-3 py-3 space-y-3", isMinimized && "hidden")}>
        {activeTab === 'workspace' && (
          <div className="bg-cyan-950/30 border border-cyan-900/50 rounded-lg p-3">
            <h5 className="text-[11px] font-bold text-cyan-400 mb-2 uppercase tracking-widest flex items-center gap-1.5"><LayoutDashboard size={12} /> 통합 관제</h5>
            <ul className="text-xs text-slate-400 space-y-2">
              <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-1 shrink-0" /><span>실시간 대시보드 · 데이터 분석 · Intelligence DB</span></li>
              <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-1 shrink-0" /><span>우측 상단에서 AI 브리핑을 생성하세요.</span></li>
            </ul>
          </div>
        )}

        {activeTab === 'action-center' && (
          <div className="space-y-2">
            <div className="bg-violet-950/30 border border-violet-900/50 rounded-lg p-3">
              <h5 className="text-[11px] font-bold text-violet-400 mb-2 uppercase tracking-widest flex items-center gap-1.5"><Gavel size={12} /> Action Center</h5>
              <div className="space-y-1.5 text-[10px]">
                <div className="flex items-center gap-2 text-slate-400">
                  <FileCheck size={10} className="text-amber-400" />
                  <span>결재 대기: <strong className="text-amber-300">{pendingCount}건</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <Clock size={10} className="text-emerald-400" />
                  <span>실행 완료: <strong className="text-emerald-300">{executedCount}건</strong></span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ SCENARIO FILE TREE ═══ */}
        {activeTab === 'scenario' && (
          <div className="space-y-1">
            {/* Favorites */}
            <FolderHeader label="즐겨찾기" count={favScenarios.length} catKey="favorites" icon={<Star size={10} className="text-amber-400" />} />
            {expandedCategories.favorites && (
              <div className="ml-1 space-y-0.5">
                {favScenarios.length === 0 ? (
                  <p className="text-[9px] text-slate-600 pl-6 py-1">⭐ 시나리오에서 즐겨찾기를 추가하세요</p>
                ) : (
                  favScenarios.map(s => (
                    <div key={s.id} className="group relative">
                      {editingFavId === s.id ? (
                        <div className="flex items-center gap-1 p-1 bg-slate-900/60 rounded border border-amber-900/50 ml-3">
                          <input
                            type="text" value={editAlias} onChange={(e) => setEditAlias(e.target.value)}
                            className="flex-1 bg-transparent text-[11px] text-white px-1.5 py-0.5 focus:outline-none placeholder-slate-600"
                            autoFocus placeholder={s.name}
                            onKeyDown={(e) => e.key === 'Enter' && updateAlias(s.id, editAlias)}
                          />
                          <button onClick={() => updateAlias(s.id, editAlias)} title="저장" className="p-0.5 text-emerald-400 hover:bg-slate-800 rounded"><Check size={10} /></button>
                          <button onClick={() => setEditingFavId(null)} title="취소" className="p-0.5 text-slate-400 hover:bg-slate-800 rounded"><X size={10} /></button>
                        </div>
                      ) : (
                        <div
                          onClick={() => onScenarioQuickSwitch(s.id)}
                          className={cn(
                            "flex items-center gap-1.5 py-1 px-2 rounded text-[11px] cursor-pointer transition-all ml-3",
                            activeScenarioId === s.id
                              ? "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                              : "text-slate-400 hover:text-amber-300 bg-transparent border border-transparent hover:border-amber-900/30"
                          )}
                        >
                          <Star size={9} className="text-amber-400 fill-amber-400 shrink-0" />
                          <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', getRiskColor(s))} />
                          <span className="truncate flex-1 font-mono text-[10px]">{getDisplayName(s)}</span>
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0">
                            <button onClick={(e) => { e.stopPropagation(); setEditAlias(favorites.find(f => f.scenarioId === s.id)?.alias || ''); setEditingFavId(s.id); }} title="별칭 설정" className="p-0.5 text-slate-500 hover:text-amber-400"><Edit2 size={9} /></button>
                            <button onClick={(e) => { e.stopPropagation(); removeFavorite(s.id); }} title="즐겨찾기 해제" className="p-0.5 text-slate-500 hover:text-rose-400"><Trash2 size={9} /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-slate-800/40 my-1.5" />

            {/* Preset Scenarios */}
            <FolderHeader label="시스템 프리셋" count={presetScenarios.length} catKey="preset" icon={<Folder size={10} className="text-cyan-500" />} />
            {expandedCategories.preset && (
              <div className="ml-1 space-y-0.5">
                {presetScenarios.map(s => <ScenarioItem key={s.id} s={s} indent={1} />)}
              </div>
            )}

            {/* Custom Scenarios */}
            <FolderHeader label="사용자 시나리오" count={customScenarios.length} catKey="custom" icon={<FolderOpen size={10} className="text-emerald-500" />} />
            {expandedCategories.custom && (
              <div className="ml-1 space-y-0.5">
                {customScenarios.length === 0 ? (
                  <p className="text-[9px] text-slate-600 pl-6 py-1">시나리오 빌더에서 새 시나리오를 저장하세요</p>
                ) : (
                  customScenarios.map(s => <ScenarioItem key={s.id} s={s} indent={1} />)
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'ontology' && (
          <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-lg p-3">
            <h5 className="text-[11px] font-bold text-emerald-400 mb-2 uppercase tracking-widest flex items-center gap-1.5"><Database size={12} /> 온톨로지 규칙</h5>
            <p className="text-[10px] text-slate-400 leading-relaxed mb-2">추가된 지식은 AI 에이전트의 상황 판단(환각 억제)과 보고서 초안 생성 시 최우선 컨텍스트로 적용됩니다.</p>
          </div>
        )}
      </div>

      {/* Bottom — always pinned at very bottom */}
      <div className={cn("py-2 px-2 border-t border-slate-800/50 bg-slate-950 mt-auto shrink-0", isMinimized && "flex flex-col items-center")}>
        <div
          className={cn(navItemClass, 'py-2')}
          onClick={onOpenSettings}
          title="설정"
        >
          <Settings size={isMinimized ? 20 : 16} className="shrink-0" />
          {!isMinimized && <span className="text-xs font-semibold">설정</span>}
        </div>
        <div
          className={cn(navItemClass, 'py-2 text-rose-400 hover:text-rose-300')}
          onClick={logout}
          title="로그아웃"
        >
          <LogOut size={isMinimized ? 20 : 16} className="shrink-0" />
          {!isMinimized && <span className="text-xs font-semibold">로그아웃</span>}
        </div>
      </div>
    </div>
  );
}
