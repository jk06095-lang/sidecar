import { useState, useEffect } from 'react';
import {
  Home, Newspaper, Settings, Anchor, FileText,
  Activity, Menu, Zap,
  Database, Shield, TrendingUp, Server, CheckCircle2,
  Star, Edit2, Check, X, Trash2, Globe
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { Scenario } from '../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (t: string) => void;
  scenarios: Scenario[];
  activeScenarioId: string;
  onScenarioQuickSwitch: (id: string) => void;
  onOpenSettings: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

interface FavoriteEntry {
  scenarioId: string;
  alias?: string; // custom user name
}

const FAVORITES_KEY = 'sidecar_scenario_favorites';

function loadFavorites(): FavoriteEntry[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveFavorites(favs: FavoriteEntry[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  scenarios,
  activeScenarioId,
  onScenarioQuickSwitch,
  onOpenSettings,
  isMinimized = false,
  onToggleMinimize,
}: SidebarProps) {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>(() => loadFavorites());
  const [editingFavId, setEditingFavId] = useState<string | null>(null);
  const [editAlias, setEditAlias] = useState('');

  useEffect(() => saveFavorites(favorites), [favorites]);

  const navItemClass =
    `flex items-center gap-3 py-2 text-sm text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 cursor-pointer transition-all duration-200 rounded-lg ${isMinimized ? 'justify-center mx-3' : 'px-4 mx-2'}`;
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

  // Split scenarios into favorites and others
  const favScenarios = favorites
    .map(f => scenarios.find(s => s.id === f.scenarioId))
    .filter(Boolean) as Scenario[];
  const nonFavScenarios = scenarios.filter(s => !isFavorited(s.id));

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

      {/* Main Navigation */}
      <div className="py-3 border-b border-slate-800/50 space-y-1">
        <div title="대시보드" className={cn(navItemClass, activeTab === 'home' && activeClass)} onClick={() => setActiveTab('home')}>
          <Home size={isMinimized ? 20 : 16} className="shrink-0" />
          {!isMinimized && <span>대시보드</span>}
        </div>
        <div title="보고서" className={cn(navItemClass, activeTab === 'reports' && activeClass)} onClick={() => setActiveTab('reports')}>
          <FileText size={isMinimized ? 20 : 16} className="shrink-0" />
          {!isMinimized && <span>보고서</span>}
        </div>
        <div title="INTELLIGENCE DB" className={cn(navItemClass, activeTab === 'news' && activeClass, "relative")} onClick={() => setActiveTab('news')}>
          <Newspaper size={isMinimized ? 20 : 16} className="shrink-0" />
          {!isMinimized && (
            <>
              <span>INTELLIGENCE DB</span>
              <span className="ml-auto bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">Live</span>
            </>
          )}
          {isMinimized && <div className="absolute top-1 right-2 w-2 h-2 bg-emerald-500 rounded-full border border-slate-950"></div>}
        </div>
        <div title="시나리오" className={cn(navItemClass, activeTab === 'scenario-builder' && activeClass)} onClick={() => setActiveTab('scenario-builder')}>
          <Activity size={isMinimized ? 20 : 16} className="shrink-0" />
          {!isMinimized && <span>시나리오</span>}
        </div>
        <div title="온톨로지" className={cn(navItemClass, activeTab === 'ontology' && activeClass)} onClick={() => setActiveTab('ontology')}>
          <Database size={isMinimized ? 20 : 16} className="shrink-0" />
          {!isMinimized && <span>온톨로지</span>}
        </div>
        <div title="데이터 분석" className={cn(navItemClass, activeTab === 'data-analysis' && activeClass)} onClick={() => setActiveTab('data-analysis')}>
          <TrendingUp size={isMinimized ? 20 : 16} className="shrink-0" />
          {!isMinimized && <span>데이터 분석</span>}
        </div>
        <div title="외부 API" className={cn(navItemClass, activeTab === 'api-manager' && activeClass)} onClick={() => setActiveTab('api-manager')}>
          <Server size={isMinimized ? 20 : 16} className="shrink-0" />
          {!isMinimized && <span>외부 API</span>}
        </div>
      </div>

      {/* Dynamic Interaction Area */}
      <div className={cn("flex-1 overflow-y-auto px-4 py-4 space-y-4", isMinimized && "hidden")}>
        {activeTab === 'home' && (
          <div className="bg-cyan-950/30 border border-cyan-900/50 rounded-lg p-3">
            <h5 className="text-[11px] font-bold text-cyan-400 mb-2 uppercase tracking-widest flex items-center gap-1.5"><TrendingUp size={12} /> 대시보드 로드맵</h5>
            <ul className="text-xs text-slate-400 space-y-2">
              <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-1 shrink-0" /><span>현재 시나리오 기반 실시간 모니터링 중입니다.</span></li>
              <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-1 shrink-0" /><span>우측 상단에서 AI 브리핑을 생성하세요.</span></li>
            </ul>
          </div>
        )}
        {activeTab === 'reports' && (
          <div className="bg-indigo-950/30 border border-indigo-900/50 rounded-lg p-3">
            <h5 className="text-[11px] font-bold text-indigo-400 mb-2 uppercase tracking-widest flex items-center gap-1.5"><FileText size={12} /> 템플릿 & 액션</h5>
            <button className="w-full text-left text-xs bg-slate-800/50 hover:bg-slate-700 p-2 rounded text-slate-300 transition-colors mb-2">📄 이사회 보고용 템플릿</button>
            <button className="w-full text-left text-xs bg-slate-800/50 hover:bg-slate-700 p-2 rounded text-slate-300 transition-colors">📊 PPT/Word 추출 양식</button>
          </div>
        )}

        {/* ═══ SCENARIO QUICK ACTIONS — Favorites system ═══ */}
        {activeTab === 'scenario-builder' && (
          <div className="space-y-3">
            {/* Favorites */}
            <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-3">
              <h5 className="text-[11px] font-bold text-amber-400 mb-2 uppercase tracking-widest flex items-center gap-1.5">
                <Star size={11} className="fill-amber-400" /> 즐겨찾기
                <span className="ml-auto text-[9px] text-slate-600 font-mono">{favScenarios.length}</span>
              </h5>
              {favScenarios.length === 0 ? (
                <p className="text-[10px] text-slate-500 leading-relaxed">아래 목록에서 ⭐ 눌러 즐겨찾기에 추가하세요</p>
              ) : (
                <div className="space-y-1">
                  {favScenarios.map(s => (
                    <div key={s.id} className="group relative">
                      {editingFavId === s.id ? (
                        <div className="flex items-center gap-1 p-1 bg-slate-900/60 rounded border border-amber-900/50">
                          <input
                            type="text" value={editAlias} onChange={(e) => setEditAlias(e.target.value)}
                            className="flex-1 bg-transparent text-[11px] text-white px-1.5 py-0.5 focus:outline-none placeholder-slate-600"
                            autoFocus placeholder={s.name}
                          />
                          <button onClick={() => updateAlias(s.id, editAlias)} title="저장" className="p-0.5 text-emerald-400 hover:bg-slate-800 rounded"><Check size={10} /></button>
                          <button onClick={() => setEditingFavId(null)} title="취소" className="p-0.5 text-slate-400 hover:bg-slate-800 rounded"><X size={10} /></button>
                        </div>
                      ) : (
                        <div
                          onClick={() => onScenarioQuickSwitch(s.id)}
                          className={cn(
                            "text-[11px] cursor-pointer p-1.5 rounded border transition-all flex items-center gap-2",
                            activeScenarioId === s.id
                              ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                              : "text-slate-400 hover:text-amber-300 bg-slate-900/50 border-slate-800 hover:border-amber-900/50"
                          )}
                        >
                          <Star size={10} className="text-amber-400 fill-amber-400 shrink-0" />
                          <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', getRiskColor(s))} />
                          <span className="truncate flex-1">{getDisplayName(s)}</span>
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0">
                            <button onClick={(e) => { e.stopPropagation(); setEditAlias(favorites.find(f => f.scenarioId === s.id)?.alias || ''); setEditingFavId(s.id); }} title="별칭 설정" className="p-0.5 text-slate-500 hover:text-amber-400"><Edit2 size={9} /></button>
                            <button onClick={(e) => { e.stopPropagation(); removeFavorite(s.id); }} title="즐겨찾기 해제" className="p-0.5 text-slate-500 hover:text-rose-400"><Trash2 size={9} /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* All Scenarios */}
            <div className="bg-slate-800/20 border border-slate-800/50 rounded-lg p-3">
              <h5 className="text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-widest flex items-center gap-1.5">
                <Zap size={11} /> 전체 시나리오
                <span className="ml-auto text-[9px] text-slate-600 font-mono">{scenarios.length}</span>
              </h5>
              <div className="space-y-1">
                {scenarios.map(s => (
                  <div
                    key={s.id}
                    onClick={() => onScenarioQuickSwitch(s.id)}
                    className={cn(
                      "group text-[11px] cursor-pointer p-1.5 rounded border transition-all flex items-center gap-2",
                      activeScenarioId === s.id
                        ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                        : "text-slate-400 hover:text-slate-200 bg-slate-900/30 border-slate-800/50 hover:border-slate-700"
                    )}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id); }}
                      title={isFavorited(s.id) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                      className="shrink-0 p-0.5"
                    >
                      <Star size={10} className={cn(
                        isFavorited(s.id) ? "text-amber-400 fill-amber-400" : "text-slate-600 group-hover:text-slate-400"
                      )} />
                    </button>
                    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', getRiskColor(s))} />
                    <span className="truncate flex-1">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ontology' && (
          <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-lg p-3">
            <h5 className="text-[11px] font-bold text-emerald-400 mb-2 uppercase tracking-widest flex items-center gap-1.5"><Shield size={12} /> 온톨로지 규칙</h5>
            <p className="text-[10px] text-slate-400 leading-relaxed mb-2">추가된 지식은 AI 에이전트의 상황 판단(환각 억제)과 보고서 초안 생성 시 최우선 컨텍스트로 적용됩니다.</p>
            <div className="text-[10px] flex items-center gap-1 text-emerald-500 bg-emerald-950/50 px-2 py-1 rounded inline-flex border border-emerald-900"><CheckCircle2 size={10} /> 실시간 동기화 됨</div>
          </div>
        )}
        {activeTab === 'api-manager' && (
          <div className="bg-purple-950/30 border border-purple-900/50 rounded-lg p-3">
            <h5 className="text-[11px] font-bold text-purple-400 mb-2 uppercase tracking-widest flex items-center gap-1.5"><Server size={12} /> API 엔드포인트</h5>
            <p className="text-[10px] text-slate-400 mb-2">연결된 외부 자원에 대한 호출 트래픽과 Rate Limit 정보를 확인하세요.</p>
            <div className="w-full bg-slate-900 rounded-full h-1.5 mb-1"><div className="bg-purple-500 h-1.5 rounded-full w-[45%]"></div></div>
            <div className="text-[9px] text-right text-slate-500 font-mono">Usage: 45%</div>
          </div>
        )}
        {activeTab === 'news' && (
          <div className="bg-rose-950/30 border border-rose-900/50 rounded-lg p-3">
            <h5 className="text-[11px] font-bold text-rose-400 mb-2 uppercase tracking-widest flex items-center gap-1.5"><Globe size={12} /> 트렌드 & 스크랩</h5>
            <p className="text-[10px] text-slate-400 leading-relaxed">핀(Bookmark) 된 모든 기사는 지식 베이스(Ontology) 시장 전망 탭으로 전송됩니다.</p>
          </div>
        )}
      </div>

      {/* Bottom */}
      <div className={cn("py-2 px-2 border-t border-slate-800/50 bg-slate-950", isMinimized && "flex flex-col h-full items-center")}>
        <div
          className={cn(navItemClass, 'py-2 px-3 justify-center')}
          onClick={onOpenSettings}
          title="설정"
        >
          <Settings size={isMinimized ? 20 : 16} className="shrink-0" />
          {!isMinimized && <span className="text-xs font-semibold">플랫폼 설정</span>}
        </div>
      </div>
    </div>
  );
}
