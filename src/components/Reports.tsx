import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FileText, Plus, FileEdit, Trash2, Download, Printer, Sparkles, Loader2, Zap, AlertTriangle, ChevronRight, ChevronDown, FolderOpen, Folder, File } from 'lucide-react';
import { cn } from '../lib/utils';
import BriefingModal from './BriefingModal';
import { useOntologyStore } from '../store/ontologyStore';
import {
    generateBriefingContext,
    generateAIPReportContext,
    streamAIPReport,
    streamMarpBriefing,
    LOADING_MESSAGES,
    AIP_LOADING_MESSAGES,
} from '../services/geminiService';
import {
    saveReport as firestoreSaveReport,
    loadReports as firestoreLoadReports,
    deleteReport as firestoreDeleteReport,
} from '../services/firestoreService';

interface ReportInfo {
    id: string;
    title: string;
    date: string;
    content: string; // Marp markdown or AIP markdown content
    type?: 'marp' | 'aip'; // Report type
}

export default function Reports() {
    const [reports, setReports] = useState<ReportInfo[]>([]);
    const [isLoadingReports, setIsLoadingReports] = useState(true);

    // Load reports from Firestore on mount (with localStorage migration)
    useEffect(() => {
        (async () => {
            const firestoreReports = await firestoreLoadReports();
            if (firestoreReports.length > 0) {
                setReports(firestoreReports);
            } else {
                // Migrate from localStorage if Firestore is empty
                try {
                    const saved = localStorage.getItem('sidecar_reports');
                    if (saved) {
                        const parsed: ReportInfo[] = JSON.parse(saved);
                        setReports(parsed);
                        // Migrate each to Firestore
                        for (const r of parsed) {
                            firestoreSaveReport({ id: r.id, title: r.title, date: r.date, content: r.content, type: r.type });
                        }
                    }
                } catch { /* ignore */ }
            }
            setIsLoadingReports(false);
        })();
    }, []);

    const [activeReportId, setActiveReportId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState('');
    const [showViewer, setShowViewer] = useState(false);

    // File tree expansion
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ aip: true, marp: true });

    // Streaming / Generation state
    const [isGenerating, setIsGenerating] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingText, setStreamingText] = useState('');
    const [loadingMessage, setLoadingMessage] = useState('');
    const [generationType, setGenerationType] = useState<'marp' | 'aip' | null>(null);
    const abortRef = useRef(false);

    // Ontology store
    const scenarios = useOntologyStore(s => s.scenarios);
    const activeScenarioId = useOntologyStore(s => s.activeScenarioId);
    const simulationParams = useOntologyStore(s => s.simulationParams);
    const dynamicFleetData = useOntologyStore(s => s.dynamicFleetData);
    const objects = useOntologyStore(s => s.objects);
    const links = useOntologyStore(s => s.links);
    const activeScenario = scenarios.find(s => s.id === activeScenarioId) || scenarios[0];

    const activeReport = reports.find(r => r.id === activeReportId);

    // Grouped file tree data
    const groupedReports = useMemo(() => {
        const aip = reports.filter(r => r.type === 'aip');
        const marp = reports.filter(r => r.type !== 'aip');
        return { aip, marp };
    }, [reports]);

    const toggleFolder = (folder: string) => {
        setExpandedFolders(prev => ({ ...prev, [folder]: !prev[folder] }));
    };

    const handleEditClick = (report: ReportInfo) => {
        setActiveReportId(report.id);
        setEditingContent(report.content);
    };

    const handleSaveEdit = () => {
        if (!activeReportId) return;
        const updated = reports.map(r => r.id === activeReportId ? { ...r, content: editingContent, date: new Date().toLocaleDateString('ko-KR') } : r);
        setReports(updated);
        const report = updated.find(r => r.id === activeReportId);
        if (report) firestoreSaveReport({ id: report.id, title: report.title, date: report.date, content: report.content, type: report.type });
    };

    const handleDelete = (id: string) => {
        if (confirm('보고서를 삭제하시겠습니까?')) {
            setReports(reports.filter(r => r.id !== id));
            firestoreDeleteReport(id);
            if (activeReportId === id) setActiveReportId(null);
        }
    };

    const handleViewShow = (report: ReportInfo) => {
        setActiveReportId(report.id);
        setStreamingText('');
        setIsStreaming(false);
        setGenerationType(null);
        setShowViewer(true);
    };

    const handleCreateNew = () => {
        const newReport: ReportInfo = {
            id: Date.now().toString(),
            title: '새 빈 보고서',
            date: new Date().toLocaleDateString('ko-KR'),
            content: `---\nmarp: true\ntheme: default\n---\n\n# 제목을 입력하세요\n\n- 내용을 입력하세요\n`,
            type: 'marp',
        };
        setReports([newReport, ...reports]);
        firestoreSaveReport({ id: newReport.id, title: newReport.title, date: newReport.date, content: newReport.content, type: newReport.type });
        handleEditClick(newReport);
    };

    // ============================================================
    // MARP BRIEFING GENERATION (migrated from App.tsx)
    // ============================================================
    const handleGenerateMarpBriefing = useCallback(async () => {
        if (isGenerating) return;

        setIsGenerating(true);
        setGenerationType('marp');
        setStreamingText('');
        setIsStreaming(true);
        setShowViewer(true);
        abortRef.current = false;

        let msgIndex = 0;
        const msgInterval = setInterval(() => {
            setLoadingMessage(LOADING_MESSAGES[msgIndex % LOADING_MESSAGES.length]);
            msgIndex++;
        }, 2000);
        setLoadingMessage(LOADING_MESSAGES[0]);

        try {
            const contextJSON = generateBriefingContext(activeScenario, simulationParams, dynamicFleetData);

            // Enhance with ontology graph data
            const parsedContext = JSON.parse(contextJSON);
            parsedContext.ontology_graph = {
                totalObjects: objects.length,
                totalLinks: links.length,
                objectsByType: objects.reduce((acc: Record<string, number>, o) => {
                    acc[o.type] = (acc[o.type] || 0) + 1;
                    return acc;
                }, {}),
            };

            const enhancedContextJSON = JSON.stringify(parsedContext, null, 2);

            let accumulated = '';
            for await (const chunk of streamMarpBriefing(enhancedContextJSON)) {
                if (abortRef.current) break;
                accumulated += chunk;
                setStreamingText(accumulated);
            }

            // Clean up markdown fences
            let cleaned = accumulated.trim();
            if (cleaned.startsWith('```markdown')) cleaned = cleaned.slice('```markdown'.length);
            else if (cleaned.startsWith('```marp')) cleaned = cleaned.slice('```marp'.length);
            else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
            if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
            cleaned = cleaned.trim();

            // Auto-save
            const newReport: ReportInfo = {
                id: Date.now().toString(),
                title: `${activeScenario.name} 브리핑 보고서`,
                date: new Date().toLocaleDateString('ko-KR'),
                content: cleaned,
                type: 'marp',
            };
            setReports(prev => [newReport, ...prev]);
            firestoreSaveReport({ id: newReport.id, title: newReport.title, date: newReport.date, content: newReport.content, type: newReport.type });
            setActiveReportId(newReport.id);
            setEditingContent(cleaned);
        } catch (err) {
            console.error('Gemini API Error:', err);
            const errorContent = `---\nmarp: true\ntheme: default\n---\n\n# ⚠️ API 오류 발생\n\n에러: ${err instanceof Error ? err.message : 'Unknown error'}\n\nGemini API 키를 확인하거나 다시 시도해주세요.`;
            setStreamingText(errorContent);
        } finally {
            clearInterval(msgInterval);
            setIsGenerating(false);
            setIsStreaming(false);
            setLoadingMessage('');
        }
    }, [isGenerating, activeScenario, simulationParams, dynamicFleetData, objects, links]);

    // ============================================================
    // AIP REPORT GENERATION (NEW)
    // ============================================================
    const handleGenerateAIPReport = useCallback(async () => {
        if (isGenerating) return;

        setIsGenerating(true);
        setGenerationType('aip');
        setStreamingText('');
        setIsStreaming(true);
        setShowViewer(true);
        abortRef.current = false;

        let msgIndex = 0;
        const msgInterval = setInterval(() => {
            setLoadingMessage(AIP_LOADING_MESSAGES[msgIndex % AIP_LOADING_MESSAGES.length]);
            msgIndex++;
        }, 2500);
        setLoadingMessage(AIP_LOADING_MESSAGES[0]);

        try {
            const contextJSON = generateAIPReportContext(
                activeScenario,
                simulationParams,
                dynamicFleetData,
                objects,
                links,
            );

            let accumulated = '';
            for await (const chunk of streamAIPReport(contextJSON)) {
                if (abortRef.current) break;
                accumulated += chunk;
                setStreamingText(accumulated);
            }

            // Auto-save
            const newReport: ReportInfo = {
                id: Date.now().toString(),
                title: `AIP 의사결정 보고서 — ${activeScenario.name}`,
                date: new Date().toLocaleDateString('ko-KR'),
                content: accumulated,
                type: 'aip',
            };
            setReports(prev => [newReport, ...prev]);
            firestoreSaveReport({ id: newReport.id, title: newReport.title, date: newReport.date, content: newReport.content, type: newReport.type });
            setActiveReportId(newReport.id);
            setEditingContent(accumulated);
        } catch (err) {
            console.error('AIP Report Error:', err);
            setStreamingText(`## ⚠️ API 오류 발생\n\n에러: ${err instanceof Error ? err.message : 'Unknown error'}\n\nGemini API 키 또는 네트워크를 확인하세요.`);
        } finally {
            clearInterval(msgInterval);
            setIsGenerating(false);
            setIsStreaming(false);
            setLoadingMessage('');
        }
    }, [isGenerating, activeScenario, simulationParams, dynamicFleetData, objects, links]);

    const criticalCount = dynamicFleetData.filter(v => v.riskLevel === 'Critical').length;
    const highCount = dynamicFleetData.filter(v => v.riskLevel === 'High').length;

    return (
        <div className="flex flex-col h-full bg-slate-950 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                        <FileText className="text-cyan-400" />
                        AI 리포팅 센터
                    </h1>
                    <p className="text-slate-400 mt-1.5 text-sm">
                        온톨로지 기반 AIP 의사결정 보고서 및 경영진 브리핑을 생성·관리합니다.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCreateNew}
                        className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-700"
                    >
                        <Plus size={14} /> 빈 보고서
                    </button>
                </div>
            </div>

            {/* Generation Actions Bar */}
            <div className="flex items-center gap-3 mb-6 p-4 bg-slate-900/60 border border-slate-800/60 rounded-xl">
                <div className="flex items-center gap-2 flex-1">
                    {/* Current Scenario Info */}
                    <div className="flex items-center gap-2 text-xs text-slate-400 mr-4">
                        <div className={cn(
                            "w-2 h-2 rounded-full",
                            criticalCount > 0 ? "bg-rose-500 animate-pulse" : "bg-emerald-500"
                        )} />
                        <span className="font-medium text-slate-300">{activeScenario?.name}</span>
                        <span>·</span>
                        <span>{criticalCount + highCount}척 고위험</span>
                    </div>
                </div>

                {/* Generate Buttons */}
                <button
                    onClick={handleGenerateMarpBriefing}
                    disabled={isGenerating}
                    className={cn(
                        'flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap',
                        isGenerating && generationType === 'marp'
                            ? 'bg-cyan-900/30 border border-cyan-700/30 text-cyan-400 cursor-wait'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600'
                    )}
                >
                    {isGenerating && generationType === 'marp' ? (
                        <><Loader2 size={14} className="animate-spin" /> {loadingMessage}</>
                    ) : (
                        <><Sparkles size={14} /> Marp 브리핑 생성</>
                    )}
                </button>

                <button
                    onClick={handleGenerateAIPReport}
                    disabled={isGenerating}
                    className={cn(
                        'flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap',
                        isGenerating && generationType === 'aip'
                            ? 'bg-emerald-900/30 border border-emerald-700/30 text-emerald-400 cursor-wait'
                            : 'bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-lg shadow-emerald-900/30'
                    )}
                >
                    {isGenerating && generationType === 'aip' ? (
                        <><Loader2 size={14} className="animate-spin" /> {loadingMessage}</>
                    ) : (
                        <><Zap size={14} /> AIP 보고서 생성</>
                    )}
                </button>

            </div>

            {/* Loading Progress Bar */}
            {isGenerating && (
                <div className="mb-4 bg-slate-900/80 border border-slate-800/50 rounded-xl p-4 animate-fade-in">
                    <div className="flex items-center gap-3 mb-3">
                        <Loader2 size={16} className="animate-spin text-cyan-400" />
                        <span className="text-sm text-cyan-300 font-medium">
                            {generationType === 'aip' ? '🔬 AIP 분석 진행 중' : '📊 Marp 브리핑 생성 중'}
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        {(generationType === 'aip' ? AIP_LOADING_MESSAGES : LOADING_MESSAGES).slice(0, 3).map((msg, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs font-mono">
                                <span className="text-emerald-400">&gt;</span>
                                <span className="text-slate-400">{msg}</span>
                                <span className="text-emerald-400">[OK]</span>
                            </div>
                        ))}
                        <div className="flex items-center gap-2 text-xs font-mono">
                            <span className="text-cyan-400">&gt;</span>
                            <span className="text-cyan-300">{loadingMessage}</span>
                            <span className="animate-pulse text-cyan-400">▊</span>
                        </div>
                    </div>
                    <div className="mt-3 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full animate-progress" />
                    </div>
                </div>
            )}

            <div className="flex gap-6 flex-1 overflow-hidden">
                {/* File Tree Sidebar */}
                <div className="w-72 shrink-0 flex flex-col min-w-0 bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-900/80 flex items-center justify-between">
                        <span className="font-semibold text-slate-200 text-sm">📁 보관함</span>
                        <span className="text-[10px] text-slate-500 font-mono">{reports.length}건</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
                        {isLoadingReports ? (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 size={20} className="animate-spin text-slate-500" />
                            </div>
                        ) : reports.length === 0 ? (
                            <div className="text-center py-10 text-slate-500 text-xs px-4">저장된 보고서가 없습니다.<br />위 버튼으로 생성해보세요.</div>
                        ) : (
                            <>
                                {/* AIP Folder */}
                                <FileTreeFolder
                                    label="AIP 보고서"
                                    count={groupedReports.aip.length}
                                    color="emerald"
                                    isExpanded={!!expandedFolders.aip}
                                    onToggle={() => toggleFolder('aip')}
                                />
                                {expandedFolders.aip && groupedReports.aip.map(r => (
                                    <FileTreeItem
                                        key={r.id}
                                        report={r}
                                        isActive={activeReportId === r.id}
                                        onSelect={() => handleEditClick(r)}
                                        onView={() => handleViewShow(r)}
                                        onDelete={() => handleDelete(r.id)}
                                    />
                                ))}

                                {/* Marp Folder */}
                                <FileTreeFolder
                                    label="Marp 브리핑"
                                    count={groupedReports.marp.length}
                                    color="cyan"
                                    isExpanded={!!expandedFolders.marp}
                                    onToggle={() => toggleFolder('marp')}
                                />
                                {expandedFolders.marp && groupedReports.marp.map(r => (
                                    <FileTreeItem
                                        key={r.id}
                                        report={r}
                                        isActive={activeReportId === r.id}
                                        onSelect={() => handleEditClick(r)}
                                        onView={() => handleViewShow(r)}
                                        onDelete={() => handleDelete(r.id)}
                                    />
                                ))}
                            </>
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
                                    <button onClick={() => activeReport && handleViewShow(activeReport)} className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-md text-sm transition-colors shadow-lg shadow-cyan-900/20">뷰어 열기</button>
                                </div>
                            </div>
                            <div className="flex-1 p-4 relative flex flex-col">
                                <div className="text-xs text-slate-400 mb-2 font-mono flex justify-between">
                                    <span>{activeReport?.type === 'aip' ? 'AIP Markdown Editor' : 'Marp Markdown Editor'}</span>
                                    <span>(보고서 직접 편집 가능)</span>
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
                            <div className="text-center">
                                <div className="text-5xl mb-4">📋</div>
                                <p className="text-sm">좌측 보관함에서 보고서를 선택하거나</p>
                                <p className="text-sm mt-1">위 버튼으로 새 보고서를 생성하세요.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Briefing Modal */}
            <BriefingModal
                isOpen={showViewer}
                onClose={() => {
                    setShowViewer(false);
                    if (!isStreaming) {
                        setStreamingText('');
                        setGenerationType(null);
                    }
                }}
                marpContent={activeReport?.type !== 'aip' ? (activeReport?.content || editingContent) : ''}
                streamingText={generationType === 'aip' ? streamingText : (activeReport?.type === 'aip' ? activeReport.content : undefined)}
                isStreaming={isStreaming && generationType === 'aip'}
                ontologyObjects={objects}
                ontologyLinks={links}
            />
        </div>
    );
}

// ============================================================
// FILE TREE SUB-COMPONENTS
// ============================================================

function FileTreeFolder({ label, count, color, isExpanded, onToggle }: {
    label: string;
    count: number;
    color: 'emerald' | 'cyan';
    isExpanded: boolean;
    onToggle: () => void;
}) {
    const colorMap = {
        emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
        cyan: { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
    };
    const c = colorMap[color];

    return (
        <button
            onClick={onToggle}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-800/40 transition-colors text-left"
        >
            {isExpanded ? <ChevronDown size={12} className="text-slate-400 shrink-0" /> : <ChevronRight size={12} className="text-slate-400 shrink-0" />}
            {isExpanded ? <FolderOpen size={14} className={c.text} /> : <Folder size={14} className={c.text} />}
            <span className={cn("text-xs font-bold flex-1", c.text)}>{label}</span>
            <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded-full", c.bg, c.border, c.text, "border")}>{count}</span>
        </button>
    );
}

function FileTreeItem({ report, isActive, onSelect, onView, onDelete }: {
    report: { id: string; title: string; date: string; type?: 'marp' | 'aip' };
    isActive: boolean;
    onSelect: () => void;
    onView: () => void;
    onDelete: () => void;
}) {
    return (
        <div
            onClick={onSelect}
            className={cn(
                "group flex items-center gap-2 pl-9 pr-3 py-1.5 cursor-pointer transition-all",
                isActive
                    ? "bg-cyan-500/10 border-r-2 border-cyan-400"
                    : "hover:bg-slate-800/30 border-r-2 border-transparent"
            )}
        >
            <File size={12} className={isActive ? "text-cyan-400 shrink-0" : "text-slate-500 shrink-0"} />
            <div className="flex-1 min-w-0">
                <div className={cn("text-[11px] font-medium truncate", isActive ? "text-cyan-300" : "text-slate-300")}>{report.title}</div>
                <div className="text-[9px] text-slate-600">{report.date}</div>
            </div>
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); onView(); }} className="p-0.5 text-slate-500 hover:text-cyan-400 rounded" title="뷰어"><Printer size={10} /></button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-0.5 text-slate-500 hover:text-rose-400 rounded" title="삭제"><Trash2 size={10} /></button>
            </div>
        </div>
    );
}
