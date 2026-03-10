import React, { useState, useEffect } from 'react';
import { Database, Plus, Search, Trash2, Edit2, Save, X, FileText, CheckCircle2, RotateCcw, Box } from 'lucide-react';
import { cn } from '../lib/utils';
import OntologyGraph from './widgets/OntologyGraph';

interface OntologyItem {
    id: string;
    category: string;
    title: string;
    content: string;
    lastUpdated: string;
    isActive: boolean;
    type?: 'document' | 'factor';
    subCategory?: string; // e.g. '자산', '인사', '재고'
    defaultValue?: number; // Starting value for the scenario slider
    vesselData?: {
        vessel_type: string;
        location: string;
        riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
    };
}

export default function Ontology() {
    const defaultOntology: OntologyItem[] = [
        {
            id: '1',
            category: '비상 대응 지침',
            title: '페르시아만/호르무즈 해협 통항 행동 지침',
            content: '이란/이스라엘 통항 레벨 3 격상. UKMTO 보고 필수.',
            lastUpdated: new Date().toLocaleDateString('ko-KR'),
            isActive: true,
            type: 'document'
        },
        {
            id: 'f_vlcc',
            category: '운영 요소',
            subCategory: '자산 (Asset)',
            title: 'VLCC Fleet Size (보유 선대)',
            content: '현재 운영 중인 초대형 원유 운반선 총 톤수 및 댓수. (연결 노드: VLSFO, 운임)',
            lastUpdated: new Date().toLocaleDateString('ko-KR'),
            isActive: true,
            type: 'factor'
        },
        {
            id: 'f_port_congestion',
            category: '운영 요소',
            title: 'Port Congestion Index (항만 체선율)',
            content: '글로벌 주요 허브 항만(상하이, 싱가포르 등)의 물류 지연 및 대기 시간 지표. 공급망 마비 시 상승.',
            lastUpdated: new Date().toLocaleDateString('ko-KR'),
            isActive: true,
            type: 'factor'
        },
        {
            id: 'f_eco_compliance',
            category: '규제 요소',
            title: '대체 연비 규제 (CII/EEXI) 달성률',
            content: 'IMO 환경 규제 대응을 위한 선대 효율성 달성 지표. 위반 시 운항 정지 스크랩.',
            lastUpdated: new Date().toLocaleDateString('ko-KR'),
            isActive: true,
            type: 'factor'
        }
    ];

    const [items, setItems] = useState<OntologyItem[]>(() => {
        try {
            const saved = localStorage.getItem('sidecar_ontology');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.length > 0) return parsed;
            }
        } catch { return []; }
        return defaultOntology;
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState<{
        category: string;
        title: string;
        content: string;
        type: 'document' | 'factor';
        subCategory?: string;
        defaultValue?: number;
        vesselData?: {
            vessel_type: string;
            location: string;
            riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
        };
    }>({
        category: '내부 지침',
        title: '',
        content: '',
        type: 'document',
        subCategory: '일반',
        defaultValue: 50
    });

    const handleResetDefaults = () => {
        if (confirm('모든 사용자 데이터를 삭제하고 AI 권장 기본 해양/시나리오 데이터로 초기화하시겠습니까?')) {
            setItems(defaultOntology);
        }
    };

    useEffect(() => {
        localStorage.setItem('sidecar_ontology', JSON.stringify(items));
        window.dispatchEvent(new Event('ontology_updated'));
    }, [items]);

    const handleSave = () => {
        if (!formData.title.trim() || !formData.content.trim()) return;

        if (editingId) {
            setItems(items.map(item => item.id === editingId ? { ...item, ...formData, lastUpdated: new Date().toLocaleDateString('ko-KR') } : item));
        } else {
            setItems([{
                id: formData.type === 'factor' ? `factor_${Date.now()}` : Date.now().toString(),
                ...formData,
                lastUpdated: new Date().toLocaleDateString('ko-KR'),
                isActive: true
            }, ...items]);
        }
        closeForm();
    };

    const closeForm = () => {
        setShowAddForm(false);
        setEditingId(null);
        setFormData({ category: '내부 지침', title: '', content: '', type: 'document' });
    };

    const editItem = (item: OntologyItem) => {
        setFormData({
            category: item.category,
            title: item.title,
            content: item.content,
            type: item.type || 'document',
            subCategory: item.subCategory || '일반',
            defaultValue: item.defaultValue || 50,
            vesselData: item.vesselData
        });
        setEditingId(item.id);
        setShowAddForm(true);
    };

    const deleteItem = (id: string) => {
        if (confirm('삭제하시겠습니까?')) {
            setItems(items.filter(item => item.id !== id));
        }
    };

    const toggleActive = (id: string) => {
        setItems(items.map(item => item.id === id ? { ...item, isActive: !item.isActive } : item));
    };

    const filteredItems = items.filter(item =>
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-slate-950 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                        <Database className="text-cyan-400" />
                        온톨로지 (Ontology) 및 요소 관리
                    </h1>
                    <p className="text-slate-400 mt-2 text-sm">
                        사내 규정, 경영 변수(Factors), 스크랩된 실시간 뉴스들의 관계를 정의하고 모니터링합니다.
                    </p>
                </div>
                {!showAddForm && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleResetDefaults}
                            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-lg"
                        >
                            <RotateCcw size={16} /> 초기화 설정
                        </button>
                        <button
                            onClick={() => { setFormData({ ...formData, type: 'document' }); setShowAddForm(true); }}
                            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-lg"
                        >
                            <Plus size={16} /> 문서 추가
                        </button>
                        <button
                            onClick={() => { setFormData({ category: '운영 요소', title: '', content: '', type: 'factor', subCategory: '자산 (Asset)', defaultValue: 50 }); setShowAddForm(true); }}
                            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-cyan-900/20"
                        >
                            <Box size={16} /> 팩터(변수) 등록
                        </button>
                    </div>
                )}
            </div>

            <div className="flex gap-6 flex-1 overflow-hidden">
                {/* Left: Main List Area */}
                <div className="w-1/3 flex flex-col min-w-0 bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden shrink-0">
                    <div className="p-4 border-b border-slate-800/80 bg-slate-900/80 flex items-center gap-4">
                        <div className="relative flex-1">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                placeholder="노드 검색..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
                            />
                        </div>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                        {filteredItems.map(item => (
                            <div key={item.id} className={cn("p-4 rounded-xl border transition-all", item.isActive ? "bg-slate-800/40 border-slate-700/50 hover:border-cyan-500/30" : "bg-slate-900/40 border-slate-800/50 opacity-60")}>
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => toggleActive(item.id)} className="focus:outline-none shrink-0" title={item.isActive ? "비활성화" : "활성화"}>
                                            {item.isActive ? <CheckCircle2 size={18} className={item.type === 'factor' ? 'text-amber-400' : 'text-cyan-400'} /> : <div className="w-[18px] h-[18px] rounded-full border border-slate-600" />}
                                        </button>
                                        <span className={cn("text-[10px] px-2 py-0.5 rounded font-medium shrink-0", item.type === 'factor' ? 'bg-amber-900/30 text-amber-400 border border-amber-800' : 'bg-slate-700 text-slate-300')}>
                                            {item.type === 'factor' && item.subCategory ? `[${item.subCategory}] ` : ''}{item.category}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={() => editItem(item)} className="p-1.5 text-slate-400 hover:text-cyan-400 rounded-md hover:bg-slate-700 transition-colors"><Edit2 size={14} /></button>
                                        <button onClick={() => deleteItem(item.id)} className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md hover:bg-slate-700 transition-colors"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                                <h3 className="font-semibold text-slate-200 ml-8 text-sm leading-tight mb-2">{item.title}</h3>
                                <p className="text-xs text-slate-400 leading-relaxed ml-8 line-clamp-2">
                                    {item.content}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: Graph or Form */}
                {showAddForm ? (
                    <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden animate-slide-up shadow-2xl">
                        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-800/30">
                            <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                                {formData.type === 'factor' ? <Box size={16} className="text-amber-400" /> : <FileText size={16} className="text-cyan-400" />}
                                {editingId ? '수정하기' : (formData.type === 'factor' ? '새로운 경영 요소(Factor) 등록' : '새로운 지식 문서 등록')}
                            </h3>
                            <button onClick={closeForm} className="text-slate-500 hover:text-slate-300">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-8 flex-1 overflow-y-auto custom-scrollbar space-y-6 max-w-2xl">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">구분</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                                        <input type="radio" checked={formData.type === 'document'} onChange={() => setFormData({ ...formData, type: 'document', category: '내부 지침' })} className="accent-cyan-500" />
                                        문서/가이드라인
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                                        <input type="radio" checked={formData.type === 'factor'} onChange={() => setFormData({ ...formData, type: 'factor', category: '운영 요소' })} className="accent-amber-500" />
                                        경영 요소(Factor)
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">카테고리</label>
                                <input
                                    type="text"
                                    value={formData.category}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">이름 (Title)</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    placeholder={formData.type === 'factor' ? "예: 글로벌 Fleet 규모, 아시아 권역 리스크" : "예: 호르무즈 해협 우회 가이드라인"}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                                />
                            </div>

                            {formData.type === 'factor' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5">상세 분류 (Sub-category)</label>
                                        <select
                                            value={formData.subCategory}
                                            onChange={e => setFormData({ ...formData, subCategory: e.target.value })}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                                        >
                                            <option value="자산 (Asset)">자산 (Asset: Fleet, 시설 등)</option>
                                            <option value="인사 (HR)">인사 및 조직 (HR)</option>
                                            <option value="재무 (Finance)">재무 및 예산 (Finance)</option>
                                            <option value="재고 (Inventory)">재고 및 부품 (Inventory)</option>
                                            <option value="규제 (Compliance)">사내 규칙 및 규제 (Compliance)</option>
                                            <option value="기타 (Other)">기타 운영 요소</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5">초기 기본값 설정 (Default Value)</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="range"
                                                min="0" max="100"
                                                value={formData.defaultValue}
                                                onChange={e => setFormData({ ...formData, defaultValue: parseInt(e.target.value) })}
                                                className="flex-1 accent-amber-500"
                                            />
                                            <span className="text-sm font-bold text-amber-500 w-8">{formData.defaultValue}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {formData.type === 'factor' && formData.subCategory === '자산 (Asset)' && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border border-rose-900/30 bg-rose-950/10 p-4 rounded-lg">
                                    <div className="sm:col-span-3">
                                        <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <Box size={10} /> 자산(Fleet Status) 연동 설정
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-slate-400 mb-1.5 uppercase">선종 (Vessel Type)</label>
                                        <input
                                            type="text"
                                            placeholder="예: VLCC, Suezmax"
                                            value={formData.vesselData?.vessel_type || ''}
                                            onChange={e => setFormData({ ...formData, vesselData: { ...formData.vesselData, vessel_type: e.target.value, location: formData.vesselData?.location || '', riskLevel: formData.vesselData?.riskLevel || 'Low' } })}
                                            className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-slate-400 mb-1.5 uppercase">위치 (Location)</label>
                                        <input
                                            type="text"
                                            placeholder="예: 중동, 북해 등"
                                            value={formData.vesselData?.location || ''}
                                            onChange={e => setFormData({ ...formData, vesselData: { ...formData.vesselData, location: e.target.value, vessel_type: formData.vesselData?.vessel_type || '', riskLevel: formData.vesselData?.riskLevel || 'Low' } })}
                                            className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-slate-400 mb-1.5 uppercase">기본 리스크 (Risk)</label>
                                        <select
                                            value={formData.vesselData?.riskLevel || 'Low'}
                                            onChange={e => setFormData({ ...formData, vesselData: { ...formData.vesselData, riskLevel: e.target.value as any, vessel_type: formData.vesselData?.vessel_type || '', location: formData.vesselData?.location || '' } })}
                                            className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                                        >
                                            <option value="Low">Low</option>
                                            <option value="Medium">Medium</option>
                                            <option value="High">High</option>
                                            <option value="Critical">Critical</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">상세 내용 및 연결 관계 명시</label>
                                <textarea
                                    value={formData.content}
                                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                                    placeholder="AI가 참조할 명확한 사실과 가이드라인을 작성하세요. 다른 변수와의 연관성을 적으면 망(Network)에 반영됩니다."
                                    rows={8}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 resize-none custom-scrollbar"
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-800 bg-slate-800/30 flex justify-end gap-3">
                            <button onClick={closeForm} className="px-5 py-2 text-sm text-slate-300 hover:text-white transition-colors">취소</button>
                            <button
                                onClick={handleSave}
                                className={cn("px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 text-white", formData.type === 'factor' ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/20' : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-900/20')}
                            >
                                <Save size={14} /> 저장하기
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden relative shadow-inner">
                        <OntologyGraph data={items} />
                    </div>
                )}
            </div>
        </div>
    );
}
