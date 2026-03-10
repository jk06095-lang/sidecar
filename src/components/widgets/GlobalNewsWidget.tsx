import { useEffect, useState } from 'react';
import { Radio, AlertCircle, Bookmark, Loader2 } from 'lucide-react';

interface Article {
    title: string;
    description: string;
    url: string;
    source: { name: string };
    publishedAt: string;
    id?: string;
}

export default function GlobalNewsWidget() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [queue, setQueue] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        const fetchNews = async () => {
            try {
                // Fetch a larger batch
                const response = await fetch('https://saurav.tech/NewsAPI/top-headlines/category/business/us.json');
                if (!response.ok) throw new Error('API Error');
                const json = await response.json();

                let validArticles = json.articles
                    .filter((a: Article) => a.title && a.description && a.url)
                    .map((a: Article) => ({ ...a, id: Math.random().toString(36).substr(2, 9) }));

                // Show first 3, queue the rest
                setArticles(validArticles.slice(0, 3));
                setQueue(validArticles.slice(3, 20)); // keep some in queue
            } catch (err) {
                console.error(err);
                setError(true);
            } finally {
                setLoading(false);
            }
        };
        fetchNews();
    }, []);

    // Simulate "Live" feed by popping from queue every 8 seconds
    useEffect(() => {
        if (queue.length === 0) return;
        const interval = setInterval(() => {
            const nextItem = queue[0];
            setQueue(prev => prev.slice(1));
            setArticles(prev => [nextItem, ...prev].slice(0, 10)); // Keep max 10 to prevent memory leak
        }, 8000); // 8 seconds per new "live" item

        return () => clearInterval(interval);
    }, [queue]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-cyan-500 gap-3 py-10 min-h-[200px]">
                <Loader2 className="animate-spin" size={24} />
                <span className="text-xs font-mono">Syncing Global Intel Feed...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-rose-500 gap-2 py-10 min-h-[200px]">
                <AlertCircle size={24} />
                <span className="text-xs font-mono">Intel Feed Offline</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-900/40 rounded-lg border border-slate-700/30 overflow-hidden group">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/20">
                <Radio size={14} className="text-amber-400 animate-pulse" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-widest">Global Economic Intelligence</h4>
                <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-400 font-mono">LIVE FEED</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-0 relative">
                {/* Gradient overlay for fade effect at top and bottom */}
                <div className="sticky top-0 h-4 bg-gradient-to-b from-slate-900/80 to-transparent z-10 w-full pointer-events-none" />

                <div className="flex flex-col flex-1 pb-4">
                    {articles.map((article, i) => (
                        <div
                            key={article.id || i}
                            // Add a slide-down animation for new items
                            className="group relative flex items-start gap-4 p-4 hover:bg-slate-800/30 transition-colors border-b border-slate-800/50 last:border-0 cursor-pointer animate-slide-down"
                            onClick={() => window.open(article.url, '_blank')}
                        >
                            {/* Save to Ontology Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const currentOntology = JSON.parse(localStorage.getItem('sidecar_ontology') || '[]');
                                    const newEntry = {
                                        id: `news_${Date.now()}`,
                                        title: `[스크랩 뉴스] ${article.title}`,
                                        content: article.description,
                                        category: 'market' as const,
                                        isActive: true,
                                        dateAdded: new Date().toISOString().split('T')[0]
                                    };
                                    localStorage.setItem('sidecar_ontology', JSON.stringify([newEntry, ...currentOntology]));

                                    const btn = e.currentTarget;
                                    btn.classList.add('text-amber-400', 'scale-125');
                                    setTimeout(() => {
                                        btn.classList.remove('text-amber-400', 'scale-125');
                                    }, 1000);
                                }}
                                className="absolute right-4 top-4 opacity-100 p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition-all z-20"
                                title="온톨로지(AI 지식베이스)에 추가하기"
                            >
                                <Bookmark size={14} />
                            </button>

                            <div className="shrink-0 mt-1">
                                <div className="w-2 h-2 rounded-full bg-cyan-400/50 border border-cyan-400 animate-pulse" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1.5 pr-8">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-800 px-1.5 py-0.5 rounded">
                                        {article.source.name}
                                    </span>
                                    <span className="text-[10px] text-slate-500">Just now</span>
                                </div>
                                <h4 className="text-sm font-medium text-slate-200 group-hover:text-cyan-400 transition-colors leading-relaxed pr-8">
                                    {article.title}
                                </h4>
                                <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                                    {article.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
