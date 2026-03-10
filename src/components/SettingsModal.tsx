import { useState } from 'react';
import { Settings, Key, X, Save, Palette, Globe } from 'lucide-react';
import type { AppSettings } from '../types';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
}

export default function SettingsModal({ isOpen, onClose, settings, onSettingsChange }: SettingsModalProps) {
    const [tempSettings, setTempSettings] = useState<AppSettings>(settings);
    const [activeTab, setActiveTab] = useState<'general' | 'api'>('general');

    if (!isOpen) return null;

    const handleSave = () => {
        onSettingsChange(tempSettings);
        onClose();
    };

    const handleClearApi = () => {
        setTempSettings(prev => ({ ...prev, apiKey: '' }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl animate-slide-up overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
                    <div className="flex items-center gap-2">
                        <Settings size={18} className="text-cyan-400" />
                        <h2 className="text-lg font-semibold text-slate-100">플랫폼 설정</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex border-b border-slate-800">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'general' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-800/50' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/30'}`}
                    >
                        일반 설정
                    </button>
                    <button
                        onClick={() => setActiveTab('api')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'api' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-800/50' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/30'}`}
                    >
                        API 연동
                    </button>
                </div>

                <div className="p-6">
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
                                        className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all ${tempSettings.theme === 'dark' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                                    >
                                        다크 모드
                                    </button>
                                    <button
                                        onClick={() => setTempSettings(prev => ({ ...prev, theme: 'light' }))}
                                        className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all ${tempSettings.theme === 'light' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
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
                                        className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all ${tempSettings.language === 'ko' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                                    >
                                        한국어
                                    </button>
                                    <button
                                        onClick={() => setTempSettings(prev => ({ ...prev, language: 'en' }))}
                                        className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all ${tempSettings.language === 'en' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                                    >
                                        English
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'api' && (
                        <div className="space-y-6 animate-fade-in">
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                                    <Key size={16} className="text-cyan-400" />
                                    Gemini API Key
                                </label>
                                <input
                                    type="password"
                                    value={tempSettings.apiKey}
                                    onChange={(e) => setTempSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                                    placeholder="AIzaSy..."
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 outline-none transition-all font-mono"
                                />
                                <p className="mt-2 text-xs text-slate-500">
                                    AI 브리핑 생성 및 데이터 분석을 위해 제미나이 API 키가 필요합니다.
                                    입력하신 키는 브라우저 내부 스토리지에만 저장됩니다.
                                </p>
                            </div>
                            <div className="flex justify-end">
                                <button
                                    onClick={handleClearApi}
                                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 text-xs font-medium rounded-lg transition-colors border border-slate-700"
                                >
                                    키 지우기
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 mt-8 pt-4 border-t border-slate-800">
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
