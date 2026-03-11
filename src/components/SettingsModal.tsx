import { useState } from 'react';
import { Settings, X, Save, Palette, Globe, Radio, Plus, Tag } from 'lucide-react';
import { cn } from '../lib/utils';
import type { AppSettings } from '../types';
import { DEFAULT_OSINT_SOURCES, DEFAULT_OSINT_KEYWORDS } from '../services/newsService';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
}

export default function SettingsModal({ isOpen, onClose, settings, onSettingsChange }: SettingsModalProps) {
    const [tempSettings, setTempSettings] = useState<AppSettings>(settings);
    const [activeTab, setActiveTab] = useState<'general' | 'osint'>('general');
    const [newSource, setNewSource] = useState('');
    const [newKeyword, setNewKeyword] = useState('');

    if (!isOpen) return null;

    const handleSave = () => {
        onSettingsChange(tempSettings);
        onClose();
    };

    const handleClearApi = () => {
        setTempSettings(prev => ({ ...prev, apiKey: '' }));
    };

    const addSource = (source: string) => {
        const s = source.trim();
        if (!s || tempSettings.osintSources.includes(s)) return;
        setTempSettings(prev => ({ ...prev, osintSources: [...prev.osintSources, s] }));
        setNewSource('');
    };

    const removeSource = (source: string) => {
        setTempSettings(prev => ({ ...prev, osintSources: prev.osintSources.filter(s => s !== source) }));
    };

    const addKeyword = (keyword: string) => {
        const k = keyword.trim();
        if (!k || tempSettings.osintKeywords.includes(k)) return;
        setTempSettings(prev => ({ ...prev, osintKeywords: [...prev.osintKeywords, k] }));
        setNewKeyword('');
    };

    const removeKeyword = (keyword: string) => {
        setTempSettings(prev => ({ ...prev, osintKeywords: prev.osintKeywords.filter(k => k !== keyword) }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl animate-slide-up overflow-hidden max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 shrink-0">
                    <div className="flex items-center gap-2">
                        <Settings size={18} className="text-cyan-400" />
                        <h2 className="text-lg font-semibold text-slate-100">플랫폼 설정</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                        title="닫기"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex border-b border-slate-800 shrink-0">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={cn('flex-1 py-3 text-sm font-medium transition-colors',
                            activeTab === 'general' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-800/50' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/30'
                        )}
                    >
                        일반 설정
                    </button>
                    <button
                        onClick={() => setActiveTab('osint')}
                        className={cn('flex-1 py-3 text-sm font-medium transition-colors',
                            activeTab === 'osint' ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-900/20' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/30'
                        )}
                    >
                        <Radio size={12} className="inline mr-1" />
                        Intelligence
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {activeTab === 'general' && (
                        <div className="space-y-6 animate-fade-in">
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
                                    <Palette size={16} className="text-cyan-400" />
                                    테마 (Theme)
                                </label>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setTempSettings(prev => ({ ...prev, theme: 'dark' }))}
                                        className={cn('flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all',
                                            tempSettings.theme === 'dark' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                                        )}
                                    >
                                        다크 모드
                                    </button>
                                    <button
                                        onClick={() => setTempSettings(prev => ({ ...prev, theme: 'light' }))}
                                        className={cn('flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all',
                                            tempSettings.theme === 'light' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                                        )}
                                    >
                                        라이트 모드
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
                                    <Globe size={16} className="text-cyan-400" />
                                    기본 언어 (Language)
                                </label>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setTempSettings(prev => ({ ...prev, language: 'ko' }))}
                                        className={cn('flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all',
                                            tempSettings.language === 'ko' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                                        )}
                                    >
                                        한국어
                                    </button>
                                    <button
                                        onClick={() => setTempSettings(prev => ({ ...prev, language: 'en' }))}
                                        className={cn('flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all',
                                            tempSettings.language === 'en' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                                        )}
                                    >
                                        English
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'osint' && (
                        <div className="space-y-6 animate-fade-in">
                            {/* Sources */}
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
                                    <Radio size={16} className="text-amber-400" />
                                    모니터링 대상 매체 (Sources)
                                </label>
                                <p className="text-[11px] text-slate-500 mb-3">
                                    피드에 표시할 인텔리전스 소스를 추가하세요. 빈 상태면 모든 소스에서 수집합니다.
                                </p>
                                {/* Current chips */}
                                <div className="flex flex-wrap gap-1.5 mb-3 min-h-[32px]">
                                    {tempSettings.osintSources.map(source => (
                                        <span key={source} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                            {source}
                                            <button onClick={() => removeSource(source)} className="ml-0.5 hover:text-rose-400 transition-colors" title="제거">
                                                <X size={10} />
                                            </button>
                                        </span>
                                    ))}
                                    {tempSettings.osintSources.length === 0 && (
                                        <span className="text-[10px] text-slate-600 italic">모든 소스 활성화됨</span>
                                    )}
                                </div>
                                {/* Add input */}
                                <div className="flex gap-2 mb-3">
                                    <input
                                        type="text"
                                        value={newSource}
                                        onChange={e => setNewSource(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && addSource(newSource)}
                                        placeholder="소스명 입력..."
                                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 outline-none"
                                    />
                                    <button onClick={() => addSource(newSource)} className="px-3 py-1.5 bg-amber-600/20 text-amber-400 text-xs rounded-lg border border-amber-500/30 hover:bg-amber-600/30 transition-colors" title="추가">
                                        <Plus size={14} />
                                    </button>
                                </div>
                                {/* Recommended chips */}
                                <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider">🌟 추천 소스</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {DEFAULT_OSINT_SOURCES
                                        .filter(s => !tempSettings.osintSources.includes(s))
                                        .map(source => (
                                            <button
                                                key={source}
                                                onClick={() => addSource(source)}
                                                className="px-2 py-1 rounded-full text-[10px] font-medium bg-slate-800/80 text-slate-400 border border-slate-700 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/30 transition-all"
                                            >
                                                + {source}
                                            </button>
                                        ))
                                    }
                                </div>
                            </div>

                            {/* Keywords */}
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
                                    <Tag size={16} className="text-emerald-400" />
                                    관심 키워드 (Keywords)
                                </label>
                                <p className="text-[11px] text-slate-500 mb-3">
                                    키워드에 매칭되는 뉴스가 우선적으로 피드 상단에 표시됩니다.
                                </p>
                                {/* Current chips */}
                                <div className="flex flex-wrap gap-1.5 mb-3 min-h-[32px]">
                                    {tempSettings.osintKeywords.map(keyword => (
                                        <span key={keyword} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                            #{keyword}
                                            <button onClick={() => removeKeyword(keyword)} className="ml-0.5 hover:text-rose-400 transition-colors" title="제거">
                                                <X size={10} />
                                            </button>
                                        </span>
                                    ))}
                                    {tempSettings.osintKeywords.length === 0 && (
                                        <span className="text-[10px] text-slate-600 italic">필터 없음 — 모든 토픽 수집</span>
                                    )}
                                </div>
                                {/* Add input */}
                                <div className="flex gap-2 mb-3">
                                    <input
                                        type="text"
                                        value={newKeyword}
                                        onChange={e => setNewKeyword(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && addKeyword(newKeyword)}
                                        placeholder="키워드 입력..."
                                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 outline-none"
                                    />
                                    <button onClick={() => addKeyword(newKeyword)} className="px-3 py-1.5 bg-emerald-600/20 text-emerald-400 text-xs rounded-lg border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors" title="추가">
                                        <Plus size={14} />
                                    </button>
                                </div>
                                {/* Recommended chips */}
                                <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider">🌟 추천 키워드</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {DEFAULT_OSINT_KEYWORDS
                                        .filter(k => !tempSettings.osintKeywords.includes(k))
                                        .map(keyword => (
                                            <button
                                                key={keyword}
                                                onClick={() => addKeyword(keyword)}
                                                className="px-2 py-1 rounded-full text-[10px] font-medium bg-slate-800/80 text-slate-400 border border-slate-700 hover:bg-emerald-500/10 hover:text-emerald-300 hover:border-emerald-500/30 transition-all"
                                            >
                                                + {keyword}
                                            </button>
                                        ))
                                    }
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="shrink-0 px-6 pb-6">
                    <div className="flex gap-3 pt-4 border-t border-slate-800">
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
