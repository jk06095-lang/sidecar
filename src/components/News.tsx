import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Filter, AlertTriangle, Newspaper, Search, Folder, FolderOpen, FileText,
    ChevronRight, Tag, Bookmark, ShieldAlert, GitBranch, ChevronDown,
    Radio, Zap, Hash, RefreshCw, Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import GlobalNewsWidget from './widgets/GlobalNewsWidget';
import { useOntologyStore } from '../store/ontologyStore';
import type { IntelArticle } from '../types';

export default function News() {
    const [scrapedData, setScrapedData] = useState<any[]>([]);
    const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
    const [showSkeletons, setShowSkeletons] = useState(true);

    // Ontology store for tag navigation
    const objects = useOntologyStore(s => s.objects);

    const toggleFolder = (folderName: string) => {
        setExpandedFolders(prev => ({ ...prev, [folderName]: !prev[folderName] }));
    };

    // Load ontology data for the dossier
    useEffect(() => {
        try {
            const data = JSON.parse(localStorage.getItem('sidecar_ontology') || '[]');
            setScrapedData(data);
            if (data.length > 0) setSelectedDoc(data[0]);
        } catch (e) { }
        setTimeout(() => setShowSkeletons(false), 1500);
    }, []);

    // Refresh data handler if a new item is bookmarked from the widget
    const handleBookmarkUpdate = () => {
        try {
            const data = JSON.parse(localStorage.getItem('sidecar_ontology') || '[]');
            setScrapedData(data);
        } catch (e) { }
    };

    // Keep polling to catch changes made inside the widget
    useEffect(() => {
        const interval = setInterval(handleBookmarkUpdate, 2000);
        return () => clearInterval(interval);
    }, []);

    const filteredData = scrapedData.filter(d =>
        (d.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.content || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.category || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.subCategory || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Group by SubCategory (for factors) or Category (for documents)
    const groupedData = filteredData.reduce((acc: any, doc: any) => {
        const folderName = doc.type === 'factor' && doc.subCategory ? doc.subCategory : (doc.category || 'Uncategorized');
        if (!acc[folderName]) acc[folderName] = { type: doc.type, items: [] };
        acc[folderName].items.push(doc);
        return acc;
    }, {});

    // Handle ontology tag clicks from the news widget
    const handleTagClick = useCallback((tag: string) => {
        // Try to find matching ontology object
        const matchingObj = objects.find(o =>
            o.title.toLowerCase().includes(tag.toLowerCase()) ||
            tag.toLowerCase().includes(o.title.toLowerCase())
        );
        if (matchingObj) {
            // Set as selected doc in dossier view
            setSelectedDoc({
                id: matchingObj.id,
                title: matchingObj.title,
                content: matchingObj.description + '\n\n' + Object.entries(matchingObj.properties).map(([k, v]) => `${k}: ${v}`).join('\n'),
                category: matchingObj.type,
                type: 'ontology-object',
                lastUpdated: matchingObj.metadata.createdAt,
            });
        }
    }, [objects]);

    return (
        <div className="flex h-full bg-slate-950 overflow-hidden font-mono">
            {/* Left/Center Area: Wiki Dossier Database */}
            <div className="flex-1 flex overflow-hidden border-r border-slate-800/50">
                {/* Dossier List (Sidebar-ish) */}
                <div className="w-80 bg-slate-900/60 border-r border-slate-800/50 flex flex-col">
                    <div className="p-5 border-b border-slate-800/50">
                        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2 tracking-wider">
                            <ShieldAlert className="text-cyan-500" />
                            INTELLIGENCE DB
                        </h1>
                        <p className="text-xs text-slate-500 mt-2">Central Wiki & Montage Registry</p>

                        <div className="relative mt-4">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Search records..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded px-8 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-500 transition-colors"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                        {Object.entries(groupedData).map(([folderName, folderData]: [string, any]) => {
                            const isExpanded = expandedFolders[folderName] ?? true;
                            return (
                                <div key={folderName} className="select-none">
                                    <button
                                        onClick={() => toggleFolder(folderName)}
                                        className="w-full flex items-center gap-2 p-2 hover:bg-slate-800/40 rounded-md text-slate-300 transition-colors"
                                    >
                                        <ChevronDown size={14} className={cn("transition-transform text-slate-500", !isExpanded && "-rotate-90")} />
                                        {isExpanded ? <FolderOpen size={14} className="text-amber-500" /> : <Folder size={14} className="text-amber-500" />}
                                        <span className="text-sm font-semibold tracking-wide">{folderName}</span>
                                        <span className="ml-auto text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded-full">{folderData.items.length}</span>
                                    </button>

                                    {isExpanded && (
                                        <div className="ml-6 mt-1 space-y-1 relative before:absolute before:left-[-11px] before:top-0 before:bottom-2 before:w-px before:bg-slate-800">
                                            {folderData.items.map((doc: any) => (
                                                <button
                                                    key={doc.id}
                                                    onClick={() => setSelectedDoc(doc)}
                                                    className={cn(
                                                        "w-full text-left py-2 px-3 rounded-md flex items-center gap-2 transition-colors relative",
                                                        "before:absolute before:left-[-11px] before:top-1/2 before:w-2 before:h-px before:bg-slate-800",
                                                        selectedDoc?.id === doc.id ? "bg-cyan-950/40 text-cyan-400" : "hover:bg-slate-800/40 text-slate-400 hover:text-slate-200"
                                                    )}
                                                >
                                                    {doc.type === 'factor' ? <GitBranch size={12} className="shrink-0" /> : <FileText size={12} className="shrink-0" />}
                                                    <span className="text-xs truncate">{doc.title}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {Object.keys(groupedData).length === 0 && (
                            <div className="text-center text-xs text-slate-500 mt-10">No records found.</div>
                        )}
                    </div>
                </div>

                {/* Dossier Content Reading Pane */}
                <div className="flex-1 bg-slate-950/90 overflow-y-auto custom-scrollbar p-8 relative">
                    {selectedDoc ? (
                        <div className="max-w-3xl mx-auto">
                            <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-cyan-500 mb-6 uppercase">
                                <span>Database</span> <ChevronRight size={12} /> <span>{selectedDoc.type === 'factor' ? 'Operational Factor' : selectedDoc.type === 'ontology-object' ? 'Ontology Object' : 'Intelligence Scrap'}</span> <ChevronRight size={12} /> <span>{selectedDoc.category}</span>
                            </div>

                            <h2 className="text-3xl font-bold text-slate-100 mb-4 tracking-tight leading-tight">
                                {selectedDoc.title}
                            </h2>

                            <div className="flex flex-wrap items-center gap-3 mb-8 border-b border-slate-800/80 pb-6">
                                <span className={cn(
                                    "text-xs px-2.5 py-1 rounded-sm uppercase tracking-wider font-semibold border",
                                    selectedDoc.type === 'factor' ? "bg-amber-950/40 text-amber-500 border-amber-900" :
                                        selectedDoc.type === 'ontology-object' ? "bg-emerald-950/40 text-emerald-500 border-emerald-900" :
                                            "bg-cyan-950/40 text-cyan-500 border-cyan-900"
                                )}>
                                    {selectedDoc.type === 'factor' ? 'FACTOR' : selectedDoc.type === 'ontology-object' ? 'ONTOLOGY' : 'DOCUMENT'}
                                </span>
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                    <Bookmark size={12} /> RECORD ID: {selectedDoc.id.split('_')[0].substring(0, 8).toUpperCase()}
                                </span>
                                <span className="text-xs text-slate-500">
                                    LAST UPDATED: {selectedDoc.lastUpdated || 'Unknown'}
                                </span>
                            </div>

                            <div className="prose prose-invert prose-slate max-w-none text-sm text-slate-300 leading-relaxed font-sans">
                                {selectedDoc.content.split('\n').map((paragraph: string, i: number) => (
                                    <p key={i} className="mb-4">{paragraph}</p>
                                ))}
                            </div>

                            <div className="mt-12 pt-6 border-t border-slate-800/80">
                                <h3 className="text-sm font-semibold text-slate-400 mb-4 flex items-center gap-2">
                                    <Tag size={14} className="text-emerald-500" />
                                    Montage / Node Relations
                                </h3>
                                <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-lg text-xs text-slate-400">
                                    <p className="mb-2 italic">이 레코드는 중앙 온톨로지 신경망(Ontology Network)에 실시간 연동되어 있습니다. 온톨로지 탭에서 시각적 관계망(Multiverse)을 확인하고 편집할 수 있습니다.</p>
                                    <div className="flex gap-2 mt-3">
                                        <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded border border-slate-700">#Scrap</span>
                                        <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded border border-slate-700">#{selectedDoc.category?.replace(/\s/g, '') || 'Unknown'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                            <ShieldAlert size={48} className="text-slate-800 mb-4" />
                            <p className="tracking-widest uppercase text-sm font-semibold">Select a document to retrieve intel</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Right panel: Enhanced Live Intelligence Feed */}
            <div className="w-[440px] shrink-0 overflow-y-auto custom-scrollbar flex flex-col p-5 bg-slate-900/30">
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Newspaper className="text-cyan-400" size={20} />
                            <h2 className="text-xl font-bold text-slate-100">OSINT 시그널 피드</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                <div className="text-[10px] text-rose-500 font-bold tracking-widest uppercase">Live</div>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-slate-400">
                        다중 소스 RSS 수집 → AIP 시그널 평가 → 노이즈 필터링 → 액션 시그널 추출
                    </p>
                </div>

                {/* Skeleton loading state */}
                {showSkeletons && (
                    <div className="space-y-3 mb-4 animate-pulse">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-4">
                                <div className="flex gap-2 mb-3">
                                    <div className="w-16 h-4 bg-slate-700/50 rounded" />
                                    <div className="w-10 h-4 bg-slate-700/30 rounded" />
                                </div>
                                <div className="w-full h-4 bg-slate-700/40 rounded mb-2" />
                                <div className="w-3/4 h-4 bg-slate-700/30 rounded mb-3" />
                                <div className="w-full h-3 bg-slate-700/20 rounded" />
                            </div>
                        ))}
                    </div>
                )}

                {/* The global news widget */}
                <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
                    <GlobalNewsWidget onTagClick={handleTagClick} />
                </div>

                <div className="mt-4 p-4 rounded-xl border border-amber-900/30 bg-amber-950/20 text-sm text-amber-200/80 leading-relaxed shadow-lg">
                    <AlertTriangle size={16} className="text-amber-500 mb-2 inline-block mr-2" />
                    <strong>Intelligence Pipeline:</strong> 실시간 RSS 수집 → Gemini AIP 시그널 평가 → Impact Score 50점 이상 시그널만 표시. #해시태그를 클릭하면 온톨로지 객체의 360° 뷰가 열립니다.
                </div>
            </div>
        </div>
    );
}
