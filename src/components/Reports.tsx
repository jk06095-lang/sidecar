import React, { useState, useEffect } from 'react';
import { FileText, Plus, FileEdit, Trash2, Download, Printer } from 'lucide-react';
import { cn } from '../lib/utils';
import BriefingModal from './BriefingModal';

interface ReportInfo {
    id: string;
    title: string;
    date: string;
    content: string; // Marp markdown content
}

export default function Reports() {
    const [reports, setReports] = useState<ReportInfo[]>(() => {
        try {
            const saved = localStorage.getItem('sidecar_reports');
            if (saved) return JSON.parse(saved);
        } catch { return []; }
        return []; // Empty initially, generated via AI on Home dashboard.
    });

    const [activeReportId, setActiveReportId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState('');
    const [showViewer, setShowViewer] = useState(false);

    useEffect(() => {
        localStorage.setItem('sidecar_reports', JSON.stringify(reports));
    }, [reports]);

    // A global listener to catch "save_report" events from other components (like App.tsx if we want auto-save)
    // For simplicity, we just manage them locally or rely on the dashboard to push to localStorage,
    // but let's implement a manual add for demonstration or rely on real-time reloads.
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'sidecar_reports' && e.newValue) {
                setReports(JSON.parse(e.newValue));
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const activeReport = reports.find(r => r.id === activeReportId);

    const handleEditClick = (report: ReportInfo) => {
        setActiveReportId(report.id);
        setEditingContent(report.content);
    };

    const handleSaveEdit = () => {
        if (!activeReportId) return;
        setReports(reports.map(r => r.id === activeReportId ? { ...r, content: editingContent, date: new Date().toLocaleDateString('ko-KR') } : r));
        setActiveReportId(null);
    };

    const handleDelete = (id: string) => {
        if (confirm('보고서를 삭제하시겠습니까?')) {
            setReports(reports.filter(r => r.id !== id));
            if (activeReportId === id) setActiveReportId(null);
        }
    };

    const handleViewShow = (report: ReportInfo) => {
        setActiveReportId(report.id);
        setShowViewer(true);
    };

    const handleCreateNew = () => {
        const newReport: ReportInfo = {
            id: Date.now().toString(),
            title: '새 빈 보고서',
            date: new Date().toLocaleDateString('ko-KR'),
            content: `---\nmarp: true\ntheme: default\n---\n\n# 제목을 입력하세요\n\n- 내용을 입력하세요\n`
        };
        setReports([newReport, ...reports]);
        handleEditClick(newReport);
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                        <FileText className="text-cyan-400" />
                        AI 보고서 관리 및 에디터
                    </h1>
                    <p className="text-slate-400 mt-2 text-sm">
                        제미나이가 생성한 경영진 브리핑 보고서를 저장, 편집, 및 프레젠테이션(Marp) 형식으로 확인합니다.
                    </p>
                </div>
                <button
                    onClick={handleCreateNew}
                    className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-cyan-900/20"
                >
                    <Plus size={16} /> 빈 보고서 만들기
                </button>
            </div>

            <div className="flex gap-6 flex-1 overflow-hidden">
                {/* Report List */}
                <div className="w-80 shrink-0 flex flex-col min-w-0 bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden">
                    <div className="p-4 border-b border-slate-800/80 bg-slate-900/80 font-semibold text-slate-200">
                        보관함 ({reports.length})
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                        {reports.length === 0 ? (
                            <div className="text-center py-10 text-slate-500 text-sm">저장된 보고서가 없습니다.<br />대시보드에서 생성해보세요.</div>
                        ) : (
                            reports.map(r => (
                                <div
                                    key={r.id}
                                    className={cn(
                                        "p-3 rounded-lg border cursor-pointer transition-all",
                                        activeReportId === r.id ? "bg-cyan-500/10 border-cyan-500/30" : "bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80"
                                    )}
                                    onClick={() => activeReportId === r.id ? null : handleEditClick(r)}
                                >
                                    <h4 className={cn("text-sm font-medium truncate mb-1.5", activeReportId === r.id ? "text-cyan-400" : "text-slate-200")}>{r.title}</h4>
                                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                                        <span>{r.date}</span>
                                        <div className="flex gap-1">
                                            <button onClick={(e) => { e.stopPropagation(); handleViewShow(r); }} className="hover:text-cyan-400" title="슬라이드 보기"><Printer size={12} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleEditClick(r); }} className="hover:text-cyan-400" title="편집"><FileEdit size={12} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }} className="hover:text-rose-400" title="삭제"><Trash2 size={12} /></button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Editor Area */}
                <div className="flex-1 flex flex-col min-w-0 bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden">
                    {activeReportId ? (
                        <>
                            <div className="p-4 border-b border-slate-800/80 bg-slate-900/80 flex items-center justify-between gap-4">
                                <input
                                    className="bg-transparent border-none text-lg font-semibold text-slate-100 focus:outline-none flex-1"
                                    value={activeReport?.title || ''}
                                    onChange={(e) => setReports(reports.map(r => r.id === activeReportId ? { ...r, title: e.target.value } : r))}
                                    placeholder="보고서 제목"
                                />
                                <div className="flex items-center gap-2">
                                    <button onClick={handleSaveEdit} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-md text-sm transition-colors border border-slate-700">임시저장</button>
                                    <button onClick={() => activeReport && handleViewShow(activeReport)} className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-md text-sm transition-colors shadow-lg shadow-cyan-900/20">슬라이드 미리보기</button>
                                </div>
                            </div>
                            <div className="flex-1 p-4 relative flex flex-col">
                                <div className="text-xs text-slate-400 mb-2 font-mono flex justify-between">
                                    <span>Marp Markdown Editor</span>
                                    <span>(발표 대본 및 슬라이드 구성 치환 지원)</span>
                                </div>
                                <textarea
                                    className="flex-1 w-full bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 text-slate-300 font-mono text-sm leading-relaxed focus:outline-none focus:border-cyan-500/50 resize-none custom-scrollbar"
                                    value={editingContent}
                                    onChange={(e) => setEditingContent(e.target.value)}
                                    placeholder="여기에 보고서 마크다운을 작성하세요..."
                                />
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-slate-500">
                            좌측 보관함에서 보고서를 선택하거나 새 보고서를 생성하세요.
                        </div>
                    )}
                </div>
            </div>

            {activeReport && (
                <BriefingModal
                    isOpen={showViewer}
                    onClose={() => setShowViewer(false)}
                    marpContent={activeReport.content || editingContent}
                />
            )}
        </div>
    );
}
