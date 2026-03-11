import { useState, useRef, useEffect } from 'react';
import { X, Copy, Download, Presentation, ChevronLeft, ChevronRight, ExternalLink, Link2, ArrowLeft } from 'lucide-react';
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
        const ext = viewMode === 'aip-report' ? 'md' : 'md';
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

    // Simple markdown to HTML renderer for slides
    const renderSlideContent = (md: string) => {
        return md
            .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-cyan-300 mb-4">$1</h1>')
            .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold text-slate-200 mb-3 mt-4">$2</h2>')
            .replace(/^### (.+)$/gm, '<h3 class="text-lg font-medium text-slate-300 mb-2 mt-3">$1</h3>')
            .replace(/^\*\*(.+?)\*\*/gm, '<strong class="text-white">$1</strong>')
            .replace(/^- (.+)$/gm, '<div class="flex items-start gap-2 ml-2 mb-1.5"><span class="text-cyan-400 mt-0.5">▸</span><span class="text-slate-300 text-sm">$1</span></div>')
            .replace(/\n\n/g, '<div class="mb-3"></div>')
            .replace(/\n/g, '');
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
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all',
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

    // Inline markdown renderer for AIP report
    const renderMarkdownInline = (text: string) => {
        const lines = text.split('\n');
        return lines.map((line, lineIdx) => {
            // Headers
            if (line.startsWith('## ')) {
                return <h2 key={lineIdx} className="text-xl font-bold text-cyan-300 mt-8 mb-4 flex items-center gap-2 border-b border-slate-700/50 pb-2">{line.slice(3)}</h2>;
            }
            if (line.startsWith('### ')) {
                return <h3 key={lineIdx} className="text-lg font-semibold text-slate-200 mt-5 mb-2">{line.slice(4)}</h3>;
            }
            if (line.startsWith('# ')) {
                return <h1 key={lineIdx} className="text-2xl font-bold text-cyan-200 mt-6 mb-4">{line.slice(2)}</h1>;
            }
            // Table header/separator
            if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
                const cells = line.split('|').filter(c => c.trim());
                const isSeparator = cells.every(c => /^[\s:-]+$/.test(c));
                if (isSeparator) return null;
                const isHeader = lineIdx > 0 && lines[lineIdx + 1]?.trim()?.match(/^\|[\s:|-]+\|$/);
                return (
                    <div key={lineIdx} className={cn("flex gap-px", isHeader ? "font-semibold text-slate-200" : "")}>
                        {cells.map((cell, ci) => (
                            <div key={ci} className={cn(
                                "flex-1 px-3 py-1.5 text-xs",
                                isHeader
                                    ? "bg-slate-700/50 text-slate-200 font-semibold"
                                    : "bg-slate-800/30 text-slate-300"
                            )}>{renderBoldItalic(cell.trim())}</div>
                        ))}
                    </div>
                );
            }
            // Bullet points
            if (line.trim().startsWith('- ')) {
                return (
                    <div key={lineIdx} className="flex items-start gap-2 ml-3 mb-1.5">
                        <span className="text-cyan-500 mt-1 text-xs shrink-0">▸</span>
                        <span className="text-slate-300 text-sm leading-relaxed">{renderBoldItalic(line.slice(line.indexOf('- ') + 2))}</span>
                    </div>
                );
            }
            // Numbered lists
            if (/^\d+\.\s/.test(line.trim())) {
                const num = line.trim().match(/^(\d+)\.\s/)?.[1];
                const content = line.trim().replace(/^\d+\.\s/, '');
                return (
                    <div key={lineIdx} className="flex items-start gap-2 ml-3 mb-1.5">
                        <span className="text-cyan-400 font-mono text-xs mt-0.5 shrink-0 w-5 text-right">{num}.</span>
                        <span className="text-slate-300 text-sm leading-relaxed">{renderBoldItalic(content)}</span>
                    </div>
                );
            }
            // Empty line
            if (!line.trim()) {
                return <div key={lineIdx} className="h-2" />;
            }
            // Regular text
            return <p key={lineIdx} className="text-slate-300 text-sm leading-relaxed mb-1">{renderBoldItalic(line)}</p>;
        });
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

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-6xl h-[92vh] bg-slate-900 border border-slate-700 rounded-t-2xl shadow-2xl animate-slide-up flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-2 h-2 rounded-full",
                            isStreaming ? "bg-emerald-400 animate-pulse" : "bg-cyan-400"
                        )} />
                        <h2 className="text-lg font-semibold text-slate-100">
                            {viewMode === 'aip-report' ? '🔬 AIP 의사결정 보고서' : 'AI 경영진 브리핑 보고서'}
                        </h2>
                        {isStreaming && (
                            <span className="text-xs text-emerald-400 font-mono animate-pulse">● STREAMING</span>
                        )}
                        <span className="text-xs text-slate-500 font-mono">
                            {new Date().toLocaleDateString('ko-KR')}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* View mode toggle */}
                        <button
                            onClick={() => { setViewMode('code'); setCurrentSlide(0); }}
                            className={`px-3 py-1.5 text-xs rounded-lg transition-all ${viewMode === 'code'
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                : 'text-slate-400 hover:text-slate-200'
                                }`}
                        >
                            📝 Code
                        </button>
                        {marpContent && (
                            <button
                                onClick={() => { setViewMode('slides'); setCurrentSlide(0); }}
                                className={`px-3 py-1.5 text-xs rounded-lg transition-all ${viewMode === 'slides'
                                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                    : 'text-slate-400 hover:text-slate-200'
                                    }`}
                            >
                                <Presentation size={14} className="inline mr-1" />
                                Briefing
                            </button>
                        )}
                        {hasAIPContent && (
                            <button
                                onClick={() => { setViewMode('aip-report'); }}
                                className={`px-3 py-1.5 text-xs rounded-lg transition-all ${viewMode === 'aip-report'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'text-slate-400 hover:text-slate-200'
                                    }`}
                            >
                                🔬 AIP Report
                            </button>
                        )}

                        <div className="w-px h-6 bg-slate-700 mx-1" />

                        {/* Copy */}
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-600 transition-all"
                        >
                            <Copy size={14} />
                            {copied ? 'Copied! ✔' : '📋 Copy'}
                        </button>

                        {/* Download */}
                        <button
                            onClick={handleDownload}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-600 transition-all"
                        >
                            <Download size={14} />
                            💾 .md
                        </button>

                        {/* Close */}
                        <button
                            onClick={onClose}
                            className="ml-2 p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Main content area */}
                    <div className={cn("flex-1 overflow-auto", detailObject ? 'border-r border-slate-700/50' : '')}>
                        {viewMode === 'code' ? (
                            <div className="p-6">
                                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-6 overflow-auto text-sm font-mono leading-relaxed">
                                    <code className="text-slate-300">{displayContent}</code>
                                </pre>
                            </div>
                        ) : viewMode === 'aip-report' ? (
                            <div className="p-6 max-w-4xl mx-auto">
                                {/* AIP Report Rendered Content */}
                                <div className="prose prose-invert max-w-none">
                                    {streamingText ? (
                                        <>
                                            {/* Split by [[...]] and render with badges */}
                                            {renderAIPContent(streamingText)}
                                            {/* Streaming cursor */}
                                            {isStreaming && (
                                                <span className="inline-block w-2 h-5 bg-emerald-400 animate-pulse ml-1 rounded-sm" />
                                            )}
                                            <div ref={streamEndRef} />
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500">
                                            <div className="text-6xl mb-4">🔬</div>
                                            <p className="text-lg font-medium">AIP 보고서가 생성되면 여기에 표시됩니다</p>
                                            <p className="text-sm mt-2 text-slate-600">Reports 탭에서 'AIP 보고서 생성'을 클릭하세요</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col h-full">
                                {/* Slide Viewer */}
                                <div className="flex-1 flex items-center justify-center p-8">
                                    <div className="w-full max-w-3xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-10 min-h-[400px] shadow-2xl">
                                        {slides[currentSlide] && (
                                            <div
                                                dangerouslySetInnerHTML={{
                                                    __html: renderSlideContent(slides[currentSlide]),
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Slide Navigation */}
                                <div className="flex items-center justify-center gap-4 pb-6">
                                    <button
                                        onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                                        disabled={currentSlide === 0}
                                        className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                    >
                                        <ChevronLeft size={20} />
                                    </button>
                                    <span className="text-sm text-slate-400 font-mono">
                                        {currentSlide + 1} / {totalSlides}
                                    </span>
                                    <button
                                        onClick={() => setCurrentSlide(Math.min(totalSlides - 1, currentSlide + 1))}
                                        disabled={currentSlide === totalSlides - 1}
                                        className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                    >
                                        <ChevronRight size={20} />
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
