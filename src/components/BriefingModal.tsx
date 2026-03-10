import { useState } from 'react';
import { X, Copy, Download, Presentation, ChevronLeft, ChevronRight } from 'lucide-react';

interface BriefingModalProps {
    isOpen: boolean;
    onClose: () => void;
    marpContent: string;
}

export default function BriefingModal({ isOpen, onClose, marpContent }: BriefingModalProps) {
    const [copied, setCopied] = useState(false);
    const [viewMode, setViewMode] = useState<'code' | 'slides'>('code');
    const [currentSlide, setCurrentSlide] = useState(0);

    if (!isOpen) return null;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(marpContent);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = marpContent;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
    };

    const handleDownload = () => {
        const blob = new Blob([marpContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `briefing_report_${new Date().toISOString().slice(0, 10)}.md`;
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
            .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold text-slate-200 mb-3 mt-4">$1</h2>')
            .replace(/^### (.+)$/gm, '<h3 class="text-lg font-medium text-slate-300 mb-2 mt-3">$1</h3>')
            .replace(/^\*\*(.+?)\*\*/gm, '<strong class="text-white">$1</strong>')
            .replace(/^- (.+)$/gm, '<div class="flex items-start gap-2 ml-2 mb-1.5"><span class="text-cyan-400 mt-0.5">▸</span><span class="text-slate-300 text-sm">$1</span></div>')
            .replace(/\n\n/g, '<div class="mb-3"></div>')
            .replace(/\n/g, '');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-5xl h-[90vh] bg-slate-900 border border-slate-700 rounded-t-2xl shadow-2xl animate-slide-up flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                        <h2 className="text-lg font-semibold text-slate-100">
                            AI 경영진 브리핑 보고서
                        </h2>
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

                        <div className="w-px h-6 bg-slate-700 mx-1" />

                        {/* Copy */}
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-600 transition-all"
                        >
                            <Copy size={14} />
                            {copied ? 'Copied! ✔' : '📋 Copy to Clipboard'}
                        </button>

                        {/* Download */}
                        <button
                            onClick={handleDownload}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-600 transition-all"
                        >
                            <Download size={14} />
                            💾 Download .md
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
                <div className="flex-1 overflow-auto">
                    {viewMode === 'code' ? (
                        <div className="p-6">
                            <pre className="bg-slate-950 border border-slate-800 rounded-xl p-6 overflow-auto text-sm font-mono leading-relaxed">
                                <code className="text-slate-300">{marpContent}</code>
                            </pre>
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
            </div>
        </div>
    );
}
