import { useState, useRef, useEffect } from 'react';
import { X, Copy, Download, Presentation, ChevronLeft, ChevronRight, ExternalLink, Link2, ArrowLeft, Shield, Anchor } from 'lucide-react';
import { cn } from '../lib/utils';
import type { OntologyObject, OntologyLink } from '../types';

// Badge color mapping by ontology object type
const BADGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    Vessel: { bg: 'bg-cyan-500/15', text: 'text-cyan-300', border: 'border-cyan-500/30' },
    Port: { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' },
    Commodity: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' },
    MacroEvent: { bg: 'bg-rose-500/15', text: 'text-rose-300', border: 'border-rose-500/30' },
    Market: { bg: 'bg-violet-500/15', text: 'text-violet-300', border: 'border-violet-500/30' },
    Insurance: { bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/30' },
    Currency: { bg: 'bg-blue-500/15', text: 'text-blue-300', border: 'border-blue-500/30' },
    RiskFactor: { bg: 'bg-red-500/15', text: 'text-red-300', border: 'border-red-500/30' },
    Scenario: { bg: 'bg-purple-500/15', text: 'text-purple-300', border: 'border-purple-500/30' },
};

const TYPE_ICONS: Record<string, string> = {
    Vessel: '🚢', Port: '⚓', Commodity: '🛢️', MacroEvent: '⚡',
    Market: '📈', Insurance: '🛡️', Currency: '💱', RiskFactor: '🎯', Scenario: '🔬',
};

interface BriefingModalProps {
    isOpen: boolean;
    onClose: () => void;
    marpContent: string;
    // AIP Report mode props
    streamingText?: string;
    isStreaming?: boolean;
    ontologyObjects?: OntologyObject[];
    ontologyLinks?: OntologyLink[];
}

export default function BriefingModal({
    isOpen, onClose, marpContent,
    streamingText, isStreaming,
    ontologyObjects = [], ontologyLinks = [],
}: BriefingModalProps) {
    const [copied, setCopied] = useState(false);
    const [viewMode, setViewMode] = useState<'code' | 'slides' | 'aip-report'>('code');
    const [currentSlide, setCurrentSlide] = useState(0);
    const [detailObject, setDetailObject] = useState<OntologyObject | null>(null);
    const streamEndRef = useRef<HTMLDivElement>(null);

    // Determine if we have AIP content
    const hasAIPContent = !!(streamingText || isStreaming);

    // Auto-switch to aip-report mode when streaming starts
    useEffect(() => {
        if (hasAIPContent) {
            setViewMode('aip-report');
        }
    }, [hasAIPContent]);

    // Auto-scroll during streaming
    useEffect(() => {
        if (isStreaming && streamEndRef.current) {
            streamEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [streamingText, isStreaming]);

    if (!isOpen) return null;

    const displayContent = viewMode === 'aip-report' ? (streamingText || '') : marpContent;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(displayContent);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = displayContent;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
    };

    const handleDownload = () => {
        const prefix = viewMode === 'aip-report' ? 'aip_report' : 'briefing_report';
        const blob = new Blob([displayContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${prefix}_${new Date().toISOString().slice(0, 10)}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Parse Marp content into slides
    const slides = marpContent
        .split(/^---$/m)
        .filter(s => s.trim() && !s.trim().startsWith('marp:'))
        .map(s => s.trim());

    const totalSlides = slides.length;

    // ============================================================
    // PREMIUM SLIDE RENDERER
    // ============================================================
    const renderSlideContent = (md: string) => {
        const lines = md.split('\n');
        let html = '';
        let inTable = false;
        let tableHtml = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Table handling
            if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
                if (!inTable) {
                    inTable = true;
                    tableHtml = '<table class="report-table my-4 w-full">';
                }
                const cells = line.split('|').filter(c => c.trim());
                const isSeparator = cells.every(c => /^[\s:-]+$/.test(c));
                if (isSeparator) continue;
                // Check if next line is separator = header row
                const nextLine = lines[i + 1]?.trim();
                const isHeader = nextLine && /^\|[\s:|-]+\|$/.test(nextLine);
                if (isHeader) {
                    tableHtml += '<thead><tr>';
                    cells.forEach(c => { tableHtml += `<th>${c.trim()}</th>`; });
                    tableHtml += '</tr></thead><tbody>';
                } else {
                    tableHtml += '<tr>';
                    cells.forEach(c => { tableHtml += `<td>${renderBoldInline(c.trim())}</td>`; });
                    tableHtml += '</tr>';
                }
                continue;
            } else if (inTable) {
                tableHtml += '</tbody></table>';
                html += tableHtml;
                inTable = false;
                tableHtml = '';
            }

            // Headers
            if (line.startsWith('# ')) {
                html += `<h1 class="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-300 mb-5 leading-tight tracking-tight">${line.slice(2)}</h1>`;
                html += `<div class="w-24 h-0.5 bg-gradient-to-r from-cyan-500 to-transparent mb-5 rounded-full"></div>`;
                continue;
            }
            if (line.startsWith('## ')) {
                html += `<h2 class="text-lg font-semibold text-slate-100 mb-3 mt-5 flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0"></span>${line.slice(3)}</h2>`;
                continue;
            }
            if (line.startsWith('### ')) {
                html += `<h3 class="text-base font-medium text-slate-300 mb-2 mt-3 pl-3 border-l-2 border-cyan-700/40">${line.slice(4)}</h3>`;
                continue;
            }

            // Bullet points
            if (line.trim().startsWith('- ')) {
                const content = line.trim().slice(2);
                html += `<div class="flex items-start gap-3 ml-2 mb-2"><span class="text-cyan-400 mt-1 text-[10px] shrink-0">◆</span><span class="text-slate-300 text-sm leading-relaxed">${renderBoldInline(content)}</span></div>`;
                continue;
            }

            // Numbered list
            const numMatch = line.trim().match(/^(\d+)\.\s(.+)/);
            if (numMatch) {
                html += `<div class="flex items-start gap-3 ml-2 mb-2"><span class="text-cyan-400 font-mono text-xs mt-0.5 shrink-0 w-5 text-right font-bold">${numMatch[1]}.</span><span class="text-slate-300 text-sm leading-relaxed">${renderBoldInline(numMatch[2])}</span></div>`;
                continue;
            }

            // Empty line
            if (!line.trim()) {
                html += '<div class="h-3"></div>';
                continue;
            }

            // Regular text
            html += `<p class="text-slate-300 text-sm leading-relaxed mb-1.5">${renderBoldInline(line)}</p>`;
        }

        if (inTable) {
            tableHtml += '</tbody></table>';
            html += tableHtml;
        }

        return html;
    };

    const renderBoldInline = (text: string): string => {
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
            .replace(/\*(.+?)\*/g, '<em class="text-slate-200">$1</em>');
    };

    // Build ontology keyword lookup map: title -> object
    const keywordMap = new Map<string, OntologyObject>();
    ontologyObjects.forEach(obj => {
        keywordMap.set(obj.title, obj);
    });

    // Handle badge click
    const handleBadgeClick = (objectTitle: string) => {
        const obj = keywordMap.get(objectTitle);
        if (obj) {
            setDetailObject(obj);
        }
    };

    // Render AIP report content with data lineage badges
    const renderAIPContent = (text: string) => {
        // Split by [[...]] pattern
        const parts = text.split(/(\[\[[^\]]+\]\])/g);

        return parts.map((part, idx) => {
            const match = part.match(/^\[\[(.+)\]\]$/);
            if (match) {
                const keyword = match[1];
                const obj = keywordMap.get(keyword);
                const type = obj?.type || 'RiskFactor';
                const colors = BADGE_COLORS[type] || BADGE_COLORS.RiskFactor;
                const icon = TYPE_ICONS[type] || '📎';

                return (
                    <button
                        key={idx}
                        onClick={() => handleBadgeClick(keyword)}
                        className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all',
                            'hover:scale-105 hover:shadow-lg cursor-pointer mx-0.5',
                            colors.bg, colors.text, colors.border,
                            obj ? 'ring-1 ring-white/5' : 'opacity-75'
                        )}
                        title={obj ? `${obj.type}: ${obj.title} (Risk: ${obj.properties.riskScore})` : keyword}
                    >
                        <span className="text-[10px]">{icon}</span>
                        {keyword}
                        {obj && <ExternalLink size={9} className="ml-0.5 opacity-60" />}
                    </button>
                );
            }

            // Render markdown-like formatting within non-badge text
            return <span key={idx}>{renderMarkdownInline(part)}</span>;
        });
    };

    // ============================================================
    // PREMIUM AIP REPORT MARKDOWN RENDERER
    // ============================================================
    const renderMarkdownInline = (text: string) => {
        const lines = text.split('\n');
        let tableBuffer: string[][] = [];
        let isHeaderRow = false;
        const result: React.ReactNode[] = [];

        const flushTable = () => {
            if (tableBuffer.length === 0) return;
            result.push(
                <div key={`table-${result.length}`} className="my-5 overflow-x-auto rounded-xl border border-slate-700/50">
                    <table className="report-table">
                        {tableBuffer.length > 1 && (
                            <thead>
                                <tr>
                                    {tableBuffer[0].map((cell, ci) => (
                                        <th key={ci}>{renderBoldItalic(cell.trim())}</th>
                                    ))}
                                </tr>
                            </thead>
                        )}
                        <tbody>
                            {tableBuffer.slice(1).map((row, ri) => (
                                <tr key={ri}>
                                    {row.map((cell, ci) => (
                                        <td key={ci}>{renderBoldItalic(cell.trim())}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            tableBuffer = [];
            isHeaderRow = false;
        };

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];

            // Table handling
            if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
                const cells = line.split('|').filter(c => c.trim());
                const isSeparator = cells.every(c => /^[\s:-]+$/.test(c));
                if (isSeparator) {
                    isHeaderRow = true;
                    continue;
                }
                if (tableBuffer.length === 0 || !isHeaderRow) {
                    tableBuffer.push(cells);
                } else {
                    tableBuffer.push(cells);
                }
                continue;
            } else if (tableBuffer.length > 0) {
                flushTable();
            }

            // Headers — premium styling
            if (line.startsWith('## ')) {
                result.push(
                    <div key={lineIdx} className="report-section-bar rounded-r-lg py-3 pr-4 mt-10 mb-5">
                        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-slate-100 flex items-center gap-2 leading-tight">
                            {line.slice(3)}
                        </h2>
                    </div>
                );
                continue;
            }
            if (line.startsWith('### ')) {
                result.push(
                    <h3 key={lineIdx} className="text-base font-semibold text-slate-200 mt-6 mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0"></span>
                        {line.slice(4)}
                    </h3>
                );
                continue;
            }
            if (line.startsWith('# ')) {
                result.push(
                    <div key={lineIdx} className="mt-8 mb-5">
                        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-blue-200 to-violet-300 tracking-tight">{line.slice(2)}</h1>
                        <div className="w-32 h-0.5 bg-gradient-to-r from-cyan-500 via-violet-500 to-transparent mt-3 rounded-full" />
                    </div>
                );
                continue;
            }

            // Bullet points — enhanced
            if (line.trim().startsWith('- ')) {
                result.push(
                    <div key={lineIdx} className="flex items-start gap-3 ml-4 mb-2.5">
                        <span className="text-cyan-500 mt-1.5 text-[8px] shrink-0">◆</span>
                        <span className="text-slate-300 text-[0.8125rem] leading-relaxed">{renderBoldItalic(line.slice(line.indexOf('- ') + 2))}</span>
                    </div>
                );
                continue;
            }

            // Numbered lists — enhanced
            if (/^\d+\.\s/.test(line.trim())) {
                const num = line.trim().match(/^(\d+)\.\s/)?.[1];
                const content = line.trim().replace(/^\d+\.\s/, '');
                result.push(
                    <div key={lineIdx} className="flex items-start gap-3 ml-4 mb-2.5">
                        <span className="text-cyan-400 font-mono text-xs mt-0.5 shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-cyan-500/10 border border-cyan-500/20 font-bold">{num}</span>
                        <span className="text-slate-300 text-[0.8125rem] leading-relaxed pt-0.5">{renderBoldItalic(content)}</span>
                    </div>
                );
                continue;
            }

            // Empty line
            if (!line.trim()) {
                result.push(<div key={lineIdx} className="h-3" />);
                continue;
            }

            // Regular text
            result.push(<p key={lineIdx} className="text-slate-300 text-[0.8125rem] leading-relaxed mb-1.5">{renderBoldItalic(line)}</p>);
        }

        // Flush remaining table
        flushTable();

        return result;
    };

    // Bold/italic rendering
    const renderBoldItalic = (text: string) => {
        const parts = text.split(/(\*\*[^*]+\*\*)/g);
        return parts.map((p, i) => {
            if (p.startsWith('**') && p.endsWith('**')) {
                return <strong key={i} className="text-white font-semibold">{p.slice(2, -2)}</strong>;
            }
            return <span key={i}>{p}</span>;
        });
    };

    // Get connected links for detail object
    const getLinksForObject = (objId: string) => {
        return ontologyLinks.filter(l => l.sourceId === objId || l.targetId === objId);
    };

    const getObjectById = (id: string) => ontologyObjects.find(o => o.id === id);

    const currentDateStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-6xl h-[92vh] bg-slate-900 border border-slate-700/80 rounded-t-2xl shadow-2xl animate-slide-up flex flex-col overflow-hidden">
                {/* Header */}
                <div className="relative no-print">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 bg-slate-900/95">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <Anchor size={18} className="text-cyan-400" />
                                <div className={cn(
                                    "w-2 h-2 rounded-full",
                                    isStreaming ? "bg-emerald-400 animate-pulse" : "bg-cyan-400"
                                )} />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-slate-100 tracking-tight">
                                    {viewMode === 'aip-report' ? '🔬 AIP 의사결정 보고서' : '📊 AI 경영진 브리핑 보고서'}
                                </h2>
                                <div className="flex items-center gap-2 mt-0.5">
                                    {isStreaming && (
                                        <span className="text-[10px] text-emerald-400 font-mono animate-pulse flex items-center gap-1">
                                            <span className="w-1 h-1 rounded-full bg-emerald-400" />
                                            STREAMING
                                        </span>
                                    )}
                                    <span className="text-[10px] text-slate-500 font-mono">{currentDateStr}</span>
                                    <span className="text-[10px] px-1.5 py-px rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase tracking-wider">
                                        Confidential
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* View mode toggle */}
                            <div className="flex items-center bg-slate-800/80 rounded-lg p-0.5 border border-slate-700/50">
                                <button
                                    onClick={() => { setViewMode('code'); setCurrentSlide(0); }}
                                    className={cn(
                                        'px-3 py-1.5 text-xs rounded-md transition-all font-medium',
                                        viewMode === 'code'
                                            ? 'bg-cyan-500/20 text-cyan-400 shadow-sm'
                                            : 'text-slate-400 hover:text-slate-200'
                                    )}
                                >
                                    📝 Code
                                </button>
                                {marpContent && (
                                    <button
                                        onClick={() => { setViewMode('slides'); setCurrentSlide(0); }}
                                        className={cn(
                                            'px-3 py-1.5 text-xs rounded-md transition-all font-medium',
                                            viewMode === 'slides'
                                                ? 'bg-cyan-500/20 text-cyan-400 shadow-sm'
                                                : 'text-slate-400 hover:text-slate-200'
                                        )}
                                    >
                                        <Presentation size={13} className="inline mr-1 -mt-px" />
                                        Briefing
                                    </button>
                                )}
                                {hasAIPContent && (
                                    <button
                                        onClick={() => { setViewMode('aip-report'); }}
                                        className={cn(
                                            'px-3 py-1.5 text-xs rounded-md transition-all font-medium',
                                            viewMode === 'aip-report'
                                                ? 'bg-emerald-500/20 text-emerald-400 shadow-sm'
                                                : 'text-slate-400 hover:text-slate-200'
                                        )}
                                    >
                                        🔬 AIP Report
                                    </button>
                                )}
                            </div>

                            <div className="w-px h-6 bg-slate-700/50 mx-1" />

                            {/* Copy */}
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-600/50 transition-all"
                            >
                                <Copy size={13} />
                                {copied ? '✔' : 'Copy'}
                            </button>

                            {/* Download */}
                            <button
                                onClick={handleDownload}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-600/50 transition-all"
                            >
                                <Download size={13} />
                                .md
                            </button>

                            {/* Close */}
                            <button
                                onClick={onClose}
                                className="ml-1 p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                    {/* Gradient accent line under header */}
                    <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Main content area */}
                    <div className={cn("flex-1 overflow-auto custom-scrollbar", detailObject ? 'border-r border-slate-700/50' : '')}>
                        {viewMode === 'code' ? (
                            /* ====== CODE VIEW ====== */
                            <div className="p-6">
                                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-6 overflow-auto text-sm font-mono leading-relaxed">
                                    <code className="text-slate-300">{displayContent}</code>
                                </pre>
                            </div>
                        ) : viewMode === 'aip-report' ? (
                            /* ====== AIP REPORT VIEW — PREMIUM ====== */
                            <div className="p-8">
                                <div className="max-w-4xl mx-auto">
                                    {/* Report Header */}
                                    <div className="mb-10 pb-8 border-b border-slate-700/50">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 flex items-center justify-center shadow-lg shadow-cyan-950/20">
                                                    <Anchor size={28} className="text-cyan-400" />
                                                </div>
                                                <div>
                                                    <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-400/70 font-semibold mb-1">SIDECAR Maritime Command</div>
                                                    <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300 tracking-tight">
                                                        AIP 의사결정 보고서
                                                    </h1>
                                                </div>
                                            </div>
                                            <div className="text-right space-y-1">
                                                <div className="flex items-center gap-1.5 text-[10px] text-amber-400/80">
                                                    <Shield size={10} />
                                                    <span className="font-bold uppercase tracking-wider">Confidential</span>
                                                </div>
                                                <div className="text-[11px] text-slate-500 font-mono">{currentDateStr}</div>
                                                <div className="text-[10px] text-slate-600 font-mono">AI-Generated Report</div>
                                            </div>
                                        </div>
                                        <div className="mt-5 h-px bg-gradient-to-r from-cyan-500/40 via-violet-500/20 to-transparent rounded-full" />
                                    </div>

                                    {/* Report Body */}
                                    <div className="prose prose-invert max-w-none">
                                        {streamingText ? (
                                            <>
                                                {renderAIPContent(streamingText)}
                                                {isStreaming && (
                                                    <span className="inline-block w-2 h-5 bg-emerald-400 animate-pulse ml-1 rounded-sm" />
                                                )}
                                                <div ref={streamEndRef} />
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-[50vh] text-slate-500">
                                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 flex items-center justify-center mb-5 shadow-xl">
                                                    <span className="text-4xl">🔬</span>
                                                </div>
                                                <p className="text-base font-medium text-slate-400">AIP 보고서가 생성되면 여기에 표시됩니다</p>
                                                <p className="text-sm mt-2 text-slate-600">Reports 탭에서 'AIP 보고서 생성'을 클릭하세요</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Report Footer */}
                                    {streamingText && !isStreaming && (
                                        <div className="mt-12 pt-6 border-t border-slate-700/50">
                                            <div className="flex items-center justify-between text-[10px] text-slate-600">
                                                <div className="flex items-center gap-2">
                                                    <Anchor size={10} className="text-cyan-600" />
                                                    <span className="font-mono">SIDECAR Maritime Command · AI-Powered Intelligence Platform</span>
                                                </div>
                                                <span className="font-mono">{currentDateStr} · CONFIDENTIAL</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            /* ====== SLIDE VIEW — PREMIUM ====== */
                            <div className="flex flex-col h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
                                {/* Slide Viewer */}
                                <div className="flex-1 flex items-center justify-center p-6 lg:p-10">
                                    <div className="w-full max-w-4xl slide-frame bg-gradient-to-br from-slate-800/90 via-slate-850 to-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/40" style={{ animation: 'slide-enter 0.3s ease-out' }}>
                                        {/* Slide inner content with generous padding */}
                                        <div className="relative h-full flex flex-col p-10 lg:p-14">
                                            {/* Slide number badge */}
                                            <div className="absolute top-5 right-6 flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                                                <span className="px-2 py-0.5 rounded bg-slate-700/50 border border-slate-600/30 text-slate-400 font-bold">
                                                    {currentSlide + 1} / {totalSlides}
                                                </span>
                                            </div>

                                            {/* Decorative corner accents */}
                                            <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-cyan-500/20 rounded-tl" />
                                            <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-cyan-500/20 rounded-br" />

                                            {/* Slide content */}
                                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                                                {slides[currentSlide] && (
                                                    <div
                                                        dangerouslySetInnerHTML={{
                                                            __html: renderSlideContent(slides[currentSlide]),
                                                        }}
                                                    />
                                                )}
                                            </div>

                                            {/* Slide footer watermark */}
                                            <div className="mt-auto pt-4 flex items-center justify-between border-t border-slate-700/30">
                                                <div className="flex items-center gap-2 text-[9px] text-slate-600 font-mono tracking-wider">
                                                    <Anchor size={9} className="text-cyan-600/50" />
                                                    SIDECAR Maritime Command
                                                </div>
                                                <div className="text-[9px] text-slate-600 font-mono tracking-wider">
                                                    CONFIDENTIAL · {currentDateStr}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Slide Navigation */}
                                <div className="flex items-center justify-center gap-4 pb-5 no-print">
                                    <button
                                        onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                                        disabled={currentSlide === 0}
                                        className="p-2.5 rounded-xl bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all border border-slate-700/50"
                                        title="이전 슬라이드"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>

                                    {/* Slide indicators */}
                                    <div className="flex items-center gap-1.5">
                                        {slides.map((_, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setCurrentSlide(idx)}
                                                title={`슬라이드 ${idx + 1}`}
                                                className={cn(
                                                    "transition-all rounded-full",
                                                    idx === currentSlide
                                                        ? "w-6 h-2 bg-cyan-400"
                                                        : "w-2 h-2 bg-slate-600 hover:bg-slate-500"
                                                )}
                                            />
                                        ))}
                                    </div>

                                    <button
                                        onClick={() => setCurrentSlide(Math.min(totalSlides - 1, currentSlide + 1))}
                                        disabled={currentSlide === totalSlides - 1}
                                        className="p-2.5 rounded-xl bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all border border-slate-700/50"
                                        title="다음 슬라이드"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Ontology Detail Side Panel */}
                    {detailObject && (
                        <div className="w-96 shrink-0 bg-slate-950/80 border-l border-slate-700/50 flex flex-col animate-slide-left overflow-hidden">
                            {/* Panel Header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-900/50">
                                <div className="flex items-center gap-2 min-w-0">
                                    <button
                                        onClick={() => setDetailObject(null)}
                                        className="p-1 text-slate-400 hover:text-white rounded transition-colors shrink-0"
                                        title="닫기"
                                    >
                                        <ArrowLeft size={16} />
                                    </button>
                                    <span className="text-lg">{TYPE_ICONS[detailObject.type] || '📎'}</span>
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-bold text-slate-100 truncate">{detailObject.title}</h3>
                                        <span className={cn(
                                            "text-[10px] px-1.5 py-0.5 rounded-full border font-medium uppercase tracking-wider",
                                            BADGE_COLORS[detailObject.type]?.bg || 'bg-slate-700',
                                            BADGE_COLORS[detailObject.type]?.text || 'text-slate-300',
                                            BADGE_COLORS[detailObject.type]?.border || 'border-slate-600',
                                        )}>{detailObject.type}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setDetailObject(null)}
                                    className="p-1 text-slate-500 hover:text-white rounded transition-colors"
                                    title="패널 닫기"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            {/* Panel Content */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                                {/* Risk Score */}
                                {detailObject.properties.riskScore !== undefined && (
                                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                                        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Risk Score</div>
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "text-3xl font-black font-mono",
                                                (detailObject.properties.riskScore as number) >= 80 ? 'text-rose-400' :
                                                    (detailObject.properties.riskScore as number) >= 50 ? 'text-amber-400' :
                                                        'text-emerald-400'
                                            )}>
                                                {detailObject.properties.riskScore}
                                            </div>
                                            <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className={cn(
                                                        "h-full rounded-full transition-all",
                                                        (detailObject.properties.riskScore as number) >= 80 ? 'bg-rose-500' :
                                                            (detailObject.properties.riskScore as number) >= 50 ? 'bg-amber-500' :
                                                                'bg-emerald-500'
                                                    )}
                                                    style={{ width: `${Math.min(100, detailObject.properties.riskScore as number)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Description */}
                                {detailObject.description && (
                                    <div>
                                        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Description</div>
                                        <p className="text-sm text-slate-300 leading-relaxed">{detailObject.description}</p>
                                    </div>
                                )}

                                {/* Properties */}
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Properties</div>
                                    <div className="space-y-1">
                                        {Object.entries(detailObject.properties)
                                            .filter(([k]) => k !== 'riskScore')
                                            .map(([key, value]) => (
                                                <div key={key} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/50 text-xs">
                                                    <span className="text-slate-500 font-mono">{key}</span>
                                                    <span className="text-slate-200 font-medium max-w-[180px] truncate text-right">{String(value)}</span>
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>

                                {/* Connected Links */}
                                {(() => {
                                    const links = getLinksForObject(detailObject.id);
                                    if (links.length === 0) return null;
                                    return (
                                        <div>
                                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                <Link2 size={10} />
                                                Connected Objects ({links.length})
                                            </div>
                                            <div className="space-y-1.5">
                                                {links.map(link => {
                                                    const connectedId = link.sourceId === detailObject.id ? link.targetId : link.sourceId;
                                                    const connectedObj = getObjectById(connectedId);
                                                    if (!connectedObj) return null;
                                                    const colors = BADGE_COLORS[connectedObj.type] || BADGE_COLORS.RiskFactor;
                                                    return (
                                                        <button
                                                            key={link.id}
                                                            onClick={() => setDetailObject(connectedObj)}
                                                            className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40 hover:bg-slate-700/50 hover:border-slate-600 transition-all text-left"
                                                        >
                                                            <span className="text-sm">{TYPE_ICONS[connectedObj.type] || '📎'}</span>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-xs font-medium text-slate-200 truncate">{connectedObj.title}</div>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className={cn("text-[9px] px-1.5 py-px rounded-full border", colors.bg, colors.text, colors.border)}>
                                                                        {link.relationType}
                                                                    </span>
                                                                    <span className="text-[9px] text-slate-600 font-mono">w:{link.weight}</span>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Metadata */}
                                <div className="pt-2 border-t border-slate-800/50">
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Metadata</div>
                                    <div className="space-y-1 text-[11px]">
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Source</span>
                                            <span className="text-slate-400 font-mono">{detailObject.metadata.source}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Status</span>
                                            <span className={cn(
                                                "font-mono",
                                                detailObject.metadata.status === 'active' ? 'text-emerald-400' : 'text-slate-500'
                                            )}>{detailObject.metadata.status}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Updated</span>
                                            <span className="text-slate-400 font-mono">{detailObject.metadata.updatedAt.split('T')[0]}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
