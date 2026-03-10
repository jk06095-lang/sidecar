import React, { useState } from 'react';
import { Settings, Plus, Lock, Globe, Server, CheckCircle2, XCircle, Puzzle } from 'lucide-react';
import { cn } from '../lib/utils';
import type { AppSettings } from '../types';

interface ApiIntegration {
    id: string;
    name: string;
    provider: string;
    status: 'connected' | 'error' | 'disconnected';
    lastSync: string;
    endpoint: string;
    type: 'Market Data' | 'Weather' | 'News' | 'Geopolitics';
    isCustom: boolean;
}

export default function ApiManager({ settings, onSettingsChange }: { settings: AppSettings, onSettingsChange: (s: AppSettings) => void }) {
    const [integrations, setIntegrations] = useState<ApiIntegration[]>([
        {
            id: '1', name: 'OpenWeatherMap', provider: 'OpenWeather', status: 'connected',
            lastSync: '10분 전', endpoint: 'api.openweathermap.org/data/2.5', type: 'Weather', isCustom: false
        },
        {
            id: '2', name: 'VLSFO pricing (Platts)', provider: 'S&P Global', status: 'error',
            lastSync: '2시간 전', endpoint: 'api.platts.com/v1/market-data', type: 'Market Data', isCustom: false
        },
        {
            id: '3', name: 'Global News Feed (NewsAPI)', provider: 'NewsAPI.org', status: 'connected',
            lastSync: '1분 전', endpoint: 'newsapi.org/v2/top-headlines', type: 'News', isCustom: false
        },
        {
            id: '4', name: 'ACLED Conflict Events', provider: 'ACLED', status: 'disconnected',
            lastSync: '-', endpoint: 'api.acleddata.com/acled/read', type: 'Geopolitics', isCustom: false
        }
    ]);

    const [showAddModal, setShowAddModal] = useState(false);

    return (
        <div className="flex flex-col h-full bg-slate-950 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                        <Server className="text-cyan-400" />
                        외부 API 및 위젯 자원 관리
                    </h1>
                    <p className="text-slate-400 mt-2 text-sm">
                        SIDECAR 대시보드와 AI가 참조하는 외부 데이터 소스의 연결 상태를 관리하고 새로운 위젯 소스를 추가합니다.
                    </p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-cyan-900/20"
                >
                    <Plus size={16} /> API 소스 추가
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">

                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mb-6">
                    <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                        <Globe className="text-emerald-400" size={18} />
                        연결된 데이터 소스 현황
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {integrations.map(api => (
                            <div key={api.id} className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-5 hover:border-slate-700 transition-colors relative">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{api.type}</div>
                                        <h4 className="text-slate-200 font-medium">{api.name}</h4>
                                    </div>
                                    <div className={cn(
                                        "px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1",
                                        api.status === 'connected' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                            api.status === 'error' ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                                                "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                                    )}>
                                        {api.status === 'connected' ? <CheckCircle2 size={10} /> : api.status === 'error' ? <XCircle size={10} /> : <div className="w-2.5 h-2.5 rounded-full bg-slate-500" />}
                                        {api.status.toUpperCase()}
                                    </div>
                                </div>

                                <div className="text-xs text-slate-400 mb-4 font-mono truncate" title={api.endpoint}>
                                    {api.endpoint}
                                </div>

                                <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-800/50">
                                    <span>제공: {api.provider}</span>
                                    <span>동기화: {api.lastSync}</span>
                                </div>

                                {api.isCustom && (
                                    <button className="absolute top-2 right-2 text-slate-500 hover:text-rose-400 p-1">
                                        <XCircle size={14} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                        <Puzzle className="text-purple-400" size={18} />
                        신규 추천 위젯 마켓플레이스 (레퍼런스)
                    </h3>
                    <p className="text-sm text-slate-400 mb-6">사용자가 대시보드에 추가할 수 있는 무료 연동 지원 API 및 위젯 목록입니다.</p>

                    <div className="space-y-3">
                        {[
                            { name: 'TradingView Market Overview', desc: '주요 글로벌 자산, FX 실시간 동향 위젯', type: 'Financial Widget', free: true },
                            { name: 'Baltic Exchange Index API', desc: 'BDI 등 주요 건화물 및 탱커선 운임 지수 (API 연동 필요)', type: 'API', free: false },
                            { name: 'VesselFinder Map Embed', desc: '실시간 선박 위치 추적 지도 (IFrame 위젯)', type: 'Map Widget', free: true },
                            { name: 'US EIA Petroleum Data', desc: '미 에너지정보청 원유 재고 및 가격 데이터', type: 'Public API', free: true }
                        ].map((ref, i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-800/80 rounded-xl hover:bg-slate-800/30 transition-colors">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="text-sm font-medium text-slate-200">{ref.name}</h4>
                                        {ref.free && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded uppercase font-bold">Free</span>}
                                    </div>
                                    <p className="text-xs text-slate-400">{ref.desc}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-slate-500 font-mono bg-slate-900 px-2 py-1 rounded">{ref.type}</span>
                                    <button className="text-cyan-500 hover:text-cyan-400 text-xs font-medium border border-cyan-500/50 hover:bg-cyan-500/10 px-3 py-1.5 rounded transition-colors">
                                        연동법 보기
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            {showAddModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl animate-slide-up">
                        <div className="p-5 border-b border-slate-800 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-slate-100">사용자 정의 API 추가</h2>
                            <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-slate-300">
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">API 명칭</label>
                                <input type="text" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" placeholder="예: My Custom Source" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">엔드포인트 (URL)</label>
                                <input type="text" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono" placeholder="https://api.example.com/v1/data" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">인증 키 (Header: Authorization)</label>
                                <div className="relative">
                                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input type="password" className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" placeholder="Bearer ..." />
                                </div>
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-800 bg-slate-800/30 flex justify-end gap-3">
                            <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200">취소</button>
                            <button
                                onClick={() => {
                                    alert('Custom API 연동 설정이 로컬 환경에 저장되었습니다. (UI 데모 목적)');
                                    setShowAddModal(false);
                                }}
                                className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                                추가하기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
