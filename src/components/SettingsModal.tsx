import React, { useState, useMemo } from 'react';
import {
    Settings, X, Save, Palette, Globe, Radio, Plus, Tag,
    Search, Sliders, Key, Filter, Zap, AlertTriangle, Clock,
    Shield, ChevronRight, Hash, Gauge
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { AppSettings } from '../types';
import { DEFAULT_OSINT_SOURCES, DEFAULT_OSINT_KEYWORDS, DEFAULT_CRISIS_TERMS } from '../services/newsService';

// ============================================================
// CATEGORY DEFINITIONS
// ============================================================

type SettingsCategory = 'general' | 'intelligence' | 'pipeline' | 'api';

interface CategoryDef {
    id: SettingsCategory;
    label: string;
    labelEn: string;
    icon: React.ReactNode;
    color: string;
    description: string;
}

const CATEGORIES: CategoryDef[] = [
    { id: 'general', label: '일반', labelEn: 'General', icon: <Palette size={16} />, color: 'text-cyan-400', description: '테마, 언어 설정' },
    { id: 'intelligence', label: '인텔리전스', labelEn: 'Intelligence', icon: <Radio size={16} />, color: 'text-amber-400', description: 'OSINT 소스 및 키워드' },
    { id: 'pipeline', label: '파이프라인', labelEn: 'Pipeline', icon: <Sliders size={16} />, color: 'text-emerald-400', description: '위기 감지, 임계치 설정' },
    { id: 'api', label: 'API 연동', labelEn: 'API', icon: <Key size={16} />, color: 'text-rose-400', description: 'Gemini API 키 관리' },
];

// All searchable setting labels for filtering
const SEARCHABLE_ITEMS: Record<SettingsCategory, string[]> = {
    general: ['테마', 'Theme', '다크', '라이트', '언어', 'Language', '한국어', 'English'],
    intelligence: ['OSINT', '소스', 'Sources', '키워드', 'Keywords', 'Bloomberg', 'Reuters', 'AP News', 'Hormuz', 'UKMTO'],
    pipeline: ['임계치', 'Threshold', '지속성', 'Persistence', '위기 키워드', 'Crisis', '폴링', 'Polling', '배치', 'Batch', '에스컬레이션'],
    api: ['API', 'Gemini', 'Key', '키'],
};

// ============================================================
// MAIN COMPONENT
// ============================================================

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
}

export default function SettingsModal({ isOpen, onClose, settings, onSettingsChange }: SettingsModalProps) {
    const [tempSettings, setTempSettings] = useState<AppSettings>({
        ...settings,
        // Safe defaults for new fields (may be missing in old saved settings)
        persistenceThresholdMinutes: settings.persistenceThresholdMinutes ?? 30,
        persistenceMinArticles: settings.persistenceMinArticles ?? 3,
        crisisKeywords: settings.crisisKeywords ?? [],
        pollingIntervalMinutes: settings.pollingIntervalMinutes ?? 10,
    });
    const [activeCategory, setActiveCategory] = useState<SettingsCategory>('general');
    const [searchQuery, setSearchQuery] = useState('');
    const [newSource, setNewSource] = useState('');
    const [newKeyword, setNewKeyword] = useState('');
    const [newCrisisKw, setNewCrisisKw] = useState('');

    // Sync tempSettings when modal opens
    if (!isOpen) return null;

    // Search filtering
    const matchedCategories = searchQuery.trim()
        ? CATEGORIES.filter(cat =>
            SEARCHABLE_ITEMS[cat.id].some(item =>
                item.toLowerCase().includes(searchQuery.toLowerCase())
            ) || cat.label.includes(searchQuery) || cat.labelEn.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : CATEGORIES;

    const handleSave = () => {
        onSettingsChange(tempSettings);
        localStorage.setItem('sidecar_settings', JSON.stringify(tempSettings));
        onClose();
    };

    // Shared helpers
    const addSource = (s: string) => {
        const v = s.trim(); if (!v || tempSettings.osintSources.includes(v)) return;
        setTempSettings(prev => ({ ...prev, osintSources: [...prev.osintSources, v] }));
        setNewSource('');
    };
    const removeSource = (s: string) => setTempSettings(prev => ({ ...prev, osintSources: prev.osintSources.filter(x => x !== s) }));
    const addKeyword = (k: string) => {
        const v = k.trim(); if (!v || tempSettings.osintKeywords.includes(v)) return;
        setTempSettings(prev => ({ ...prev, osintKeywords: [...prev.osintKeywords, v] }));
        setNewKeyword('');
    };
    const removeKeyword = (k: string) => setTempSettings(prev => ({ ...prev, osintKeywords: prev.osintKeywords.filter(x => x !== k) }));
    const addCrisisKeyword = (k: string) => {
        const v = k.trim().toLowerCase(); if (!v || tempSettings.crisisKeywords.includes(v)) return;
        setTempSettings(prev => ({ ...prev, crisisKeywords: [...prev.crisisKeywords, v] }));
        setNewCrisisKw('');
    };
    const removeCrisisKeyword = (k: string) => setTempSettings(prev => ({ ...prev, crisisKeywords: prev.crisisKeywords.filter(x => x !== k) }));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl animate-slide-up overflow-hidden max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <Settings size={20} className="text-cyan-400" />
                        <div>
                            <h2 className="text-lg font-semibold text-slate-100">통합 설정</h2>
                            <p className="text-[10px] text-slate-500 tracking-wider">SIDECAR PLATFORM CONFIGURATION</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors" title="닫기">
                        <X size={18} />
                    </button>
                </div>

                {/* Search */}
                <div className="px-6 py-3 border-b border-slate-800/50 shrink-0">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="설정 검색... (e.g. threshold, 임계치, API)"
                            className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 outline-none placeholder:text-slate-600"
                        />
                    </div>
                </div>

                {/* Content: Sidebar + Panel */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Category Sidebar */}
                    <div className="w-48 bg-slate-950/50 border-r border-slate-800/50 py-3 shrink-0">
                        {matchedCategories.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={cn(
                                    "w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-all",
                                    activeCategory === cat.id
                                        ? "bg-slate-800/60 border-r-2 border-cyan-400 text-slate-100"
                                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"
                                )}
                            >
                                <span className={cn("shrink-0", activeCategory === cat.id ? cat.color : "")}>{cat.icon}</span>
                                <div className="min-w-0">
                                    <div className="text-xs font-semibold truncate">{cat.label}</div>
                                    <div className="text-[9px] text-slate-600 truncate">{cat.description}</div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Settings Panel */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                        {/* ==================== GENERAL ==================== */}
                        {activeCategory === 'general' && (
                            <div className="space-y-6 animate-fade-in">
                                <SectionHeader icon={<Palette size={16} />} title="테마 (Theme)" color="text-cyan-400" />
                                <div className="flex gap-3">
                                    <ThemeButton active={tempSettings.theme === 'dark'} onClick={() => setTempSettings(p => ({ ...p, theme: 'dark' }))} label="🌙 다크 모드" />
                                    <ThemeButton active={tempSettings.theme === 'light'} onClick={() => setTempSettings(p => ({ ...p, theme: 'light' }))} label="☀️ 라이트 모드" />
                                </div>

                                <SectionHeader icon={<Globe size={16} />} title="기본 언어 (Language)" color="text-cyan-400" />
                                <div className="flex gap-3">
                                    <ThemeButton active={tempSettings.language === 'ko'} onClick={() => setTempSettings(p => ({ ...p, language: 'ko' }))} label="🇰🇷 한국어" />
                                    <ThemeButton active={tempSettings.language === 'en'} onClick={() => setTempSettings(p => ({ ...p, language: 'en' }))} label="🇺🇸 English" />
                                </div>
                            </div>
                        )}

                        {/* ==================== INTELLIGENCE ==================== */}
                        {activeCategory === 'intelligence' && (
                            <div className="space-y-6 animate-fade-in">
                                {/* Sources */}
                                <SectionHeader icon={<Radio size={16} />} title="모니터링 대상 매체 (Sources)" color="text-amber-400" />
                                <p className="text-[11px] text-slate-500 -mt-3">피드에 표시할 인텔리전스 소스를 추가하세요. 빈 상태면 모든 소스에서 수집합니다.</p>

                                <ChipList
                                    items={tempSettings.osintSources}
                                    onRemove={removeSource}
                                    emptyText="모든 소스 활성화됨"
                                    chipColor="bg-amber-500/15 text-amber-300 border-amber-500/30"
                                />
                                <InputWithButton value={newSource} onChange={setNewSource} onSubmit={() => addSource(newSource)} placeholder="소스명 입력..." color="amber" />

                                <div className="text-[10px] text-slate-500 uppercase tracking-wider">🌟 추천 소스</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {DEFAULT_OSINT_SOURCES.filter(s => !tempSettings.osintSources.includes(s)).map(s => (
                                        <React.Fragment key={s}>
                                            <SuggestChip label={s} onClick={() => addSource(s)} color="amber" />
                                        </React.Fragment>
                                    ))}
                                </div>

                                {/* Keywords */}
                                <SectionHeader icon={<Tag size={16} />} title="관심 키워드 (Keywords)" color="text-emerald-400" />
                                <p className="text-[11px] text-slate-500 -mt-3">키워드에 매칭되는 뉴스가 우선적으로 피드 상단에 표시됩니다.</p>

                                <ChipList
                                    items={tempSettings.osintKeywords}
                                    onRemove={removeKeyword}
                                    emptyText="필터 없음 — 모든 토픽 수집"
                                    chipColor="bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                    prefix="#"
                                />
                                <InputWithButton value={newKeyword} onChange={setNewKeyword} onSubmit={() => addKeyword(newKeyword)} placeholder="키워드 입력..." color="emerald" />

                                <div className="text-[10px] text-slate-500 uppercase tracking-wider">🌟 추천 키워드</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {DEFAULT_OSINT_KEYWORDS.filter(k => !tempSettings.osintKeywords.includes(k)).map(k => (
                                        <React.Fragment key={k}>
                                            <SuggestChip label={k} onClick={() => addKeyword(k)} color="emerald" />
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ==================== PIPELINE ==================== */}
                        {activeCategory === 'pipeline' && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/30 text-xs text-emerald-400/90 leading-relaxed">
                                    <Shield size={13} className="inline mr-1.5" />
                                    <strong>Persistence Tracker</strong> — 위기 키워드가 일정 시간 동안 지속적으로 언급될 때만 AI(LLM)에 에스컬레이션합니다. 단발성 뉴스는 LLM 호출 없이 피드에 표시됩니다.
                                </div>

                                {/* Persistence Threshold */}
                                <SectionHeader icon={<Clock size={16} />} title="지속성 임계 시간 (Persistence Threshold)" color="text-emerald-400" />
                                <p className="text-[11px] text-slate-500 -mt-3">위기 키워드가 이 시간 이상 지속될 때 AI 에스컬레이션을 트리거합니다.</p>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min={5}
                                        max={120}
                                        step={5}
                                        title="지속성 임계 시간 (분)"
                                        value={tempSettings.persistenceThresholdMinutes}
                                        onChange={e => setTempSettings(p => ({ ...p, persistenceThresholdMinutes: parseInt(e.target.value) }))}
                                        className="flex-1 accent-emerald-500 h-1.5"
                                    />
                                    <span className="text-sm font-mono font-bold text-emerald-400 bg-emerald-950/30 border border-emerald-800/30 px-3 py-1 rounded-lg min-w-[70px] text-center">
                                        {tempSettings.persistenceThresholdMinutes}분
                                    </span>
                                </div>

                                {/* Min Articles */}
                                <SectionHeader icon={<Hash size={16} />} title="최소 기사 수 (Min Articles)" color="text-emerald-400" />
                                <p className="text-[11px] text-slate-500 -mt-3">에스컬레이션에 필요한 최소 위기 기사 수입니다.</p>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min={2}
                                        max={10}
                                        step={1}
                                        title="최소 기사 수"
                                        value={tempSettings.persistenceMinArticles}
                                        onChange={e => setTempSettings(p => ({ ...p, persistenceMinArticles: parseInt(e.target.value) }))}
                                        className="flex-1 accent-emerald-500 h-1.5"
                                    />
                                    <span className="text-sm font-mono font-bold text-emerald-400 bg-emerald-950/30 border border-emerald-800/30 px-3 py-1 rounded-lg min-w-[70px] text-center">
                                        {tempSettings.persistenceMinArticles}건
                                    </span>
                                </div>

                                {/* Polling Interval */}
                                <SectionHeader icon={<Gauge size={16} />} title="수집 주기 (Polling Interval)" color="text-amber-400" />
                                <p className="text-[11px] text-slate-500 -mt-3">RSS/OSINT 데이터를 수집하는 배치 주기입니다.</p>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min={1}
                                        max={30}
                                        step={1}
                                        title="수집 주기 (분)"
                                        value={tempSettings.pollingIntervalMinutes}
                                        onChange={e => setTempSettings(p => ({ ...p, pollingIntervalMinutes: parseInt(e.target.value) }))}
                                        className="flex-1 accent-amber-500 h-1.5"
                                    />
                                    <span className="text-sm font-mono font-bold text-amber-400 bg-amber-950/30 border border-amber-800/30 px-3 py-1 rounded-lg min-w-[70px] text-center">
                                        {tempSettings.pollingIntervalMinutes}분
                                    </span>
                                </div>

                                {/* Crisis Keywords */}
                                <SectionHeader icon={<AlertTriangle size={16} />} title="위기 감지 키워드 (Crisis Keywords)" color="text-rose-400" />
                                <p className="text-[11px] text-slate-500 -mt-3">이 키워드가 기사 제목/본문에 포함되면 지속성 추적이 시작됩니다. 기본 30개 + 커스텀 추가 가능.</p>

                                {/* Custom crisis keywords */}
                                <ChipList
                                    items={tempSettings.crisisKeywords}
                                    onRemove={removeCrisisKeyword}
                                    emptyText="커스텀 위기 키워드 없음 — 기본 키워드만 사용"
                                    chipColor="bg-rose-500/15 text-rose-300 border-rose-500/30"
                                />
                                <InputWithButton value={newCrisisKw} onChange={setNewCrisisKw} onSubmit={() => addCrisisKeyword(newCrisisKw)} placeholder="커스텀 위기 키워드 추가..." color="rose" />

                                {/* Built-in crisis terms (read-only display) */}
                                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-2">🔒 기본 위기 키워드 (Built-in, {DEFAULT_CRISIS_TERMS.length}개)</div>
                                <div className="flex flex-wrap gap-1">
                                    {DEFAULT_CRISIS_TERMS.map(t => (
                                        <span key={t} className="px-2 py-0.5 rounded text-[9px] font-mono bg-slate-800/60 text-slate-500 border border-slate-700/30">
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ==================== API ==================== */}
                        {activeCategory === 'api' && (
                            <div className="space-y-6 animate-fade-in">
                                <SectionHeader icon={<Key size={16} />} title="Gemini API Key" color="text-rose-400" />
                                <p className="text-[11px] text-slate-500 -mt-3">
                                    AI 시그널 평가, 시나리오 분석, 공식 소스 검색에 사용됩니다. Google AI Studio에서 발급받으세요.
                                </p>

                                <div className="space-y-3">
                                    <input
                                        type="password"
                                        value={tempSettings.apiKey}
                                        onChange={e => setTempSettings(p => ({ ...p, apiKey: e.target.value }))}
                                        placeholder="AIza..."
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-300 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 outline-none font-mono"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setTempSettings(p => ({ ...p, apiKey: '' }))}
                                            className="px-3 py-1.5 bg-rose-600/20 text-rose-400 text-xs rounded-lg border border-rose-500/30 hover:bg-rose-600/30 transition-colors"
                                        >
                                            키 초기화
                                        </button>
                                        <span className={cn(
                                            "text-[10px] py-1.5 px-2 rounded",
                                            tempSettings.apiKey ? "text-emerald-400 bg-emerald-950/30" : "text-rose-400 bg-rose-950/30"
                                        )}>
                                            {tempSettings.apiKey ? '✅ API Key 설정됨' : '❌ API Key 미설정'}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-4 p-3 rounded-lg bg-slate-800/40 border border-slate-700/30 text-xs text-slate-500 leading-relaxed">
                                    <Zap size={12} className="inline mr-1 text-amber-500" />
                                    <strong>비용 방어:</strong> Persistence Tracker가 활성화되면 단발성 뉴스는 LLM 호출 없이 로컬에서 처리됩니다.
                                    위기 키워드가 {tempSettings.persistenceThresholdMinutes}분 이상 지속되고 {tempSettings.persistenceMinArticles}건 이상 누적될 때만 AI 분석이 트리거됩니다.
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="shrink-0 px-6 pb-5 pt-3 border-t border-slate-800 bg-slate-900/80">
                    <div className="flex gap-3">
                        <button
                            onClick={handleSave}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-cyan-900/20"
                        >
                            <Save size={16} />
                            설정 저장 적용
                        </button>
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg border border-slate-600 transition-colors"
                        >
                            취소
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// REUSABLE SUB-COMPONENTS
// ============================================================

function SectionHeader({ icon, title, color }: { icon: React.ReactNode; title: string; color: string }) {
    return (
        <label className={cn("flex items-center gap-2 text-sm font-semibold text-slate-300")}>
            <span className={color}>{icon}</span>
            {title}
        </label>
    );
}

function ThemeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all',
                active ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50 shadow-sm shadow-cyan-900/20' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
            )}
        >
            {label}
        </button>
    );
}

function ChipList({ items, onRemove, emptyText, chipColor, prefix }: {
    items: string[];
    onRemove: (item: string) => void;
    emptyText: string;
    chipColor: string;
    prefix?: string;
}) {
    return (
        <div className="flex flex-wrap gap-1.5 min-h-[32px]">
            {items.map(item => (
                <span key={item} className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border", chipColor)}>
                    {prefix}{item}
                    <button onClick={() => onRemove(item)} className="ml-0.5 hover:text-rose-400 transition-colors" title="제거">
                        <X size={10} />
                    </button>
                </span>
            ))}
            {items.length === 0 && (
                <span className="text-[10px] text-slate-600 italic">{emptyText}</span>
            )}
        </div>
    );
}

function InputWithButton({ value, onChange, onSubmit, placeholder, color }: {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    placeholder: string;
    color: string;
}) {
    const borderClass = `focus:border-${color}-500 focus:ring-${color}-500/30`;
    const btnClass = `bg-${color}-600/20 text-${color}-400 border-${color}-500/30 hover:bg-${color}-600/30`;

    return (
        <div className="flex gap-2">
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onSubmit()}
                placeholder={placeholder}
                className={cn(
                    "flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none",
                    `focus:border-${color}-500 focus:ring-1 focus:ring-${color}-500/30`
                )}
            />
            <button
                onClick={onSubmit}
                className={cn(
                    "px-3 py-1.5 text-xs rounded-lg border transition-colors",
                    `bg-${color}-600/20 text-${color}-400 border-${color}-500/30 hover:bg-${color}-600/30`
                )}
                title="추가"
            >
                <Plus size={14} />
            </button>
        </div>
    );
}

function SuggestChip({ label, onClick, color }: { label: string; onClick: () => void; color: string }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "px-2 py-1 rounded-full text-[10px] font-medium bg-slate-800/80 text-slate-400 border border-slate-700 transition-all",
                `hover:bg-${color}-500/10 hover:text-${color}-300 hover:border-${color}-500/30`
            )}
        >
            + {label}
        </button>
    );
}
