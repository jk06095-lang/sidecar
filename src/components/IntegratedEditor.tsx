/**
 * IntegratedEditor — Rich document editor for notes, memos, and reports
 * Provides a workspace for creating and editing markdown-like documents
 * with auto-save to Firestore.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
    Edit3, Save, Plus, Trash2, FileText, Clock, Search,
    Bold, Italic, List, Heading1, Code, Link2, Quote,
    ChevronDown, Loader2, CheckCircle2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { db } from '../lib/firebase';
import { doc, collection, getDocs, setDoc, deleteDoc } from 'firebase/firestore';

interface EditorDocument {
    id: string;
    title: string;
    content: string;
    updatedAt: Date;
    createdAt: Date;
}

const DOCS_COLLECTION = 'app/editor/documents';

export default function IntegratedEditor() {
    const [documents, setDocuments] = useState<EditorDocument[]>([]);
    const [activeDocId, setActiveDocId] = useState<string | null>(null);
    const [content, setContent] = useState('');
    const [title, setTitle] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const activeDoc = documents.find(d => d.id === activeDocId);

    // Load documents from Firestore
    useEffect(() => {
        const load = async () => {
            try {
                const snap = await getDocs(collection(db, DOCS_COLLECTION));
                const docs: EditorDocument[] = snap.docs.map(d => ({
                    id: d.id,
                    title: d.data().title || 'Untitled',
                    content: d.data().content || '',
                    updatedAt: d.data().updatedAt?.toDate() || new Date(),
                    createdAt: d.data().createdAt?.toDate() || new Date(),
                }));
                docs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
                setDocuments(docs);
                if (docs.length > 0 && !activeDocId) {
                    setActiveDocId(docs[0].id);
                    setTitle(docs[0].title);
                    setContent(docs[0].content);
                }
            } catch (e) {
                console.error('[Editor] Load error:', e);
            }
        };
        load();
    }, []);

    // Auto-save with debounce
    const autoSave = useCallback(async (docId: string, newTitle: string, newContent: string) => {
        setSaving(true);
        try {
            await setDoc(doc(db, DOCS_COLLECTION, docId), {
                title: newTitle,
                content: newContent,
                updatedAt: new Date(),
                createdAt: documents.find(d => d.id === docId)?.createdAt || new Date(),
            });
            setDocuments(prev => prev.map(d =>
                d.id === docId ? { ...d, title: newTitle, content: newContent, updatedAt: new Date() } : d
            ));
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            console.error('[Editor] Save error:', e);
        } finally {
            setSaving(false);
        }
    }, [documents]);

    const handleContentChange = (newContent: string) => {
        setContent(newContent);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        if (activeDocId) {
            saveTimeoutRef.current = setTimeout(() => autoSave(activeDocId, title, newContent), 1500);
        }
    };

    const handleTitleChange = (newTitle: string) => {
        setTitle(newTitle);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        if (activeDocId) {
            saveTimeoutRef.current = setTimeout(() => autoSave(activeDocId, newTitle, content), 1500);
        }
    };

    const createDocument = async () => {
        const id = `doc_${Date.now()}`;
        const newDoc: EditorDocument = {
            id,
            title: '새 문서',
            content: '',
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        setDocuments(prev => [newDoc, ...prev]);
        setActiveDocId(id);
        setTitle('새 문서');
        setContent('');
        await setDoc(doc(db, DOCS_COLLECTION, id), {
            title: '새 문서',
            content: '',
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    };

    const deleteDocument = async (docId: string) => {
        try {
            await deleteDoc(doc(db, DOCS_COLLECTION, docId));
            setDocuments(prev => prev.filter(d => d.id !== docId));
            if (activeDocId === docId) {
                const remaining = documents.filter(d => d.id !== docId);
                if (remaining.length > 0) {
                    setActiveDocId(remaining[0].id);
                    setTitle(remaining[0].title);
                    setContent(remaining[0].content);
                } else {
                    setActiveDocId(null);
                    setTitle('');
                    setContent('');
                }
            }
        } catch (e) {
            console.error('[Editor] Delete error:', e);
        }
    };

    const selectDocument = (d: EditorDocument) => {
        // Save current before switching
        if (activeDocId && (content !== activeDoc?.content || title !== activeDoc?.title)) {
            autoSave(activeDocId, title, content);
        }
        setActiveDocId(d.id);
        setTitle(d.title);
        setContent(d.content);
    };

    const insertFormatting = (prefix: string, suffix: string = '') => {
        const textarea = editorRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = content.substring(start, end);
        const newContent = content.substring(0, start) + prefix + selected + suffix + content.substring(end);
        setContent(newContent);
        handleContentChange(newContent);
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
        }, 10);
    };

    const filteredDocs = documents.filter(d =>
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatToolbar = [
        { icon: <Bold size={13} />, action: () => insertFormatting('**', '**'), tooltip: '굵게' },
        { icon: <Italic size={13} />, action: () => insertFormatting('*', '*'), tooltip: '기울임' },
        { icon: <Heading1 size={13} />, action: () => insertFormatting('## '), tooltip: '제목' },
        { icon: <List size={13} />, action: () => insertFormatting('- '), tooltip: '목록' },
        { icon: <Code size={13} />, action: () => insertFormatting('`', '`'), tooltip: '코드' },
        { icon: <Quote size={13} />, action: () => insertFormatting('> '), tooltip: '인용' },
        { icon: <Link2 size={13} />, action: () => insertFormatting('[', '](url)'), tooltip: '링크' },
    ];

    return (
        <div className="h-full flex overflow-hidden">
            {/* Document sidebar */}
            <div className="w-64 bg-slate-900 border-r border-slate-800/50 flex flex-col shrink-0">
                <div className="p-3 border-b border-slate-800/50">
                    <div className="flex items-center gap-2 mb-3">
                        <Edit3 size={14} className="text-teal-400" />
                        <span className="text-xs font-bold text-white tracking-wide">DOCUMENTS</span>
                        <button
                            onClick={createDocument}
                            className="ml-auto p-1 rounded bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 transition-colors"
                            title="새 문서"
                        >
                            <Plus size={12} />
                        </button>
                    </div>
                    <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="문서 검색..."
                            className="w-full bg-slate-800 border border-slate-700/50 rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-slate-300 placeholder-slate-600 outline-none focus:border-teal-500/50 transition-colors"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {filteredDocs.map(d => (
                        <div
                            key={d.id}
                            onClick={() => selectDocument(d)}
                            className={cn(
                                'px-3 py-2.5 cursor-pointer transition-colors border-b border-slate-800/30 group',
                                d.id === activeDocId ? 'bg-teal-500/10 border-l-2 border-l-teal-400' : 'hover:bg-slate-800/40'
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <FileText size={12} className={d.id === activeDocId ? 'text-teal-400' : 'text-slate-600'} />
                                <span className={cn('text-[11px] font-medium truncate', d.id === activeDocId ? 'text-white' : 'text-slate-400')}>
                                    {d.title}
                                </span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); deleteDocument(d.id); }}
                                    className="ml-auto opacity-0 group-hover:opacity-100 p-0.5 text-slate-600 hover:text-rose-400 transition-all"
                                    title="삭제"
                                >
                                    <Trash2 size={10} />
                                </button>
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                                <Clock size={8} className="text-slate-600" />
                                <span className="text-[9px] text-slate-600">
                                    {d.updatedAt.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    ))}
                    {filteredDocs.length === 0 && (
                        <div className="py-8 text-center">
                            <FileText size={24} className="mx-auto text-slate-700 mb-2" />
                            <p className="text-[11px] text-slate-600">문서가 없습니다</p>
                            <button
                                onClick={createDocument}
                                className="mt-2 text-[10px] text-teal-400 hover:text-teal-300 transition-colors"
                            >
                                + 새 문서 만들기
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Editor area */}
            <div className="flex-1 flex flex-col min-w-0">
                {activeDocId ? (
                    <>
                        {/* Title bar */}
                        <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-800/50 bg-slate-950/50">
                            <input
                                value={title}
                                onChange={(e) => handleTitleChange(e.target.value)}
                                className="flex-1 bg-transparent text-white text-lg font-semibold outline-none placeholder-slate-600"
                                placeholder="문서 제목..."
                            />
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                {saving && <Loader2 size={12} className="animate-spin text-teal-400" />}
                                {saved && <CheckCircle2 size={12} className="text-emerald-400" />}
                                <span>{saving ? '저장 중...' : saved ? '저장됨' : ''}</span>
                            </div>
                        </div>

                        {/* Formatting toolbar */}
                        <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-slate-800/30 bg-slate-900/50">
                            {formatToolbar.map((tool, i) => (
                                <button
                                    key={i}
                                    onClick={tool.action}
                                    className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition-colors"
                                    title={tool.tooltip}
                                >
                                    {tool.icon}
                                </button>
                            ))}
                            <div className="mx-2 w-px h-4 bg-slate-800" />
                            <span className="text-[9px] text-slate-600 ml-auto">
                                {content.length.toLocaleString()} chars · {content.split('\n').length} lines
                            </span>
                        </div>

                        {/* Content */}
                        <textarea
                            ref={editorRef}
                            value={content}
                            onChange={(e) => handleContentChange(e.target.value)}
                            className="flex-1 bg-slate-950 text-slate-200 p-6 outline-none resize-none font-mono text-sm leading-relaxed custom-scrollbar placeholder-slate-700"
                            placeholder="여기에 내용을 입력하세요...&#10;&#10;마크다운 형식을 지원합니다.&#10;• **굵게** *기울임* `코드`&#10;• ## 제목&#10;• - 목록&#10;• > 인용"
                            spellCheck={false}
                        />
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <Edit3 size={48} className="mx-auto text-slate-800 mb-4" />
                            <h3 className="text-slate-500 font-medium mb-2">통합 에디터</h3>
                            <p className="text-xs text-slate-600 mb-4">메모, 보고서, 분석 노트를 작성하고 관리하세요</p>
                            <button
                                onClick={createDocument}
                                className="px-4 py-2 bg-teal-500/20 text-teal-400 rounded-lg text-sm font-medium hover:bg-teal-500/30 transition-colors"
                            >
                                <Plus size={14} className="inline mr-1" />
                                새 문서 만들기
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
