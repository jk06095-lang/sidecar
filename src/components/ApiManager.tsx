/**
 * ApiManager — Dynamic Data Connection CRUD UI (Part 1)
 * 
 * Real, working CRUD interface for managing API pipeline connections.
 * Uses apiConfigStore for encrypted persistence.
 * Designed to be embedded inside SettingsModal's "Data Connections" tab.
 */

import React, { useState } from 'react';
import {
    Plus, Trash2, Edit2, Check, X, Server, Loader2,
    Wifi, WifiOff, Lock, Globe, ChevronDown, ChevronRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useApiConfigStore, type ApiConnection } from '../store/apiConfigStore';

// ============================================================
// NEW CONNECTION FORM
// ============================================================

const EMPTY_FORM = {
    name: '',
    baseUrl: '',
    apiKey: '',
    customHeaders: '{}',
};

export default function ApiManager() {
    const connections = useApiConfigStore(s => s.connections);
    const addConnection = useApiConfigStore(s => s.addConnection);
    const updateConnection = useApiConfigStore(s => s.updateConnection);
    const removeConnection = useApiConfigStore(s => s.removeConnection);
    const testConnection = useApiConfigStore(s => s.testConnection);

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [headerError, setHeaderError] = useState('');

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setShowForm(false);
        setEditingId(null);
        setHeaderError('');
    };

    const validateHeaders = (str: string): boolean => {
        if (!str.trim() || str.trim() === '{}') return true;
        try {
            const parsed = JSON.parse(str);
            if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                setHeaderError('JSON 객체 형식이어야 합니다');
                return false;
            }
            setHeaderError('');
            return true;
        } catch {
            setHeaderError('유효하지 않은 JSON 형식입니다');
            return false;
        }
    };

    const handleSubmit = () => {
        if (!form.name.trim() || !form.baseUrl.trim()) return;
        if (!validateHeaders(form.customHeaders)) return;

        const headers = form.customHeaders.trim() && form.customHeaders.trim() !== '{}'
            ? JSON.parse(form.customHeaders)
            : {};

        if (editingId) {
            updateConnection(editingId, {
                name: form.name.trim(),
                baseUrl: form.baseUrl.trim(),
                apiKey: form.apiKey,
                customHeaders: headers,
            });
        } else {
            addConnection({
                name: form.name.trim(),
                baseUrl: form.baseUrl.trim(),
                apiKey: form.apiKey,
                customHeaders: headers,
            });
        }
        resetForm();
    };

    const startEdit = (conn: ApiConnection) => {
        setForm({
            name: conn.name,
            baseUrl: conn.baseUrl,
            apiKey: conn.apiKey,
            customHeaders: Object.keys(conn.customHeaders).length > 0
                ? JSON.stringify(conn.customHeaders, null, 2)
                : '{}',
        });
        setEditingId(conn.id);
        setShowForm(true);
    };

    const statusIcon = (status?: string) => {
        if (status === 'success') return <Wifi size={12} className="text-emerald-400" />;
        if (status === 'error') return <WifiOff size={12} className="text-rose-400" />;
        if (status === 'pending') return <Loader2 size={12} className="text-amber-400 animate-spin" />;
        return <div className="w-3 h-3 rounded-full bg-slate-600" />;
    };

    const statusLabel = (status?: string) => {
        if (status === 'success') return '연결됨';
        if (status === 'error') return '오류';
        if (status === 'pending') return '테스트 중...';
        return '미테스트';
    };

    return (
        <div className="space-y-4">
            {/* Connection List */}
            {connections.length > 0 && (
                <div className="space-y-2">
                    {connections.map(conn => {
                        const isExpanded = expandedId === conn.id;
                        return (
                            <div
                                key={conn.id}
                                className="bg-slate-950/60 border border-slate-700/50 rounded-xl overflow-hidden"
                            >
                                {/* Summary Row */}
                                <div
                                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/30 transition-colors"
                                    onClick={() => setExpandedId(isExpanded ? null : conn.id)}
                                >
                                    {isExpanded
                                        ? <ChevronDown size={12} className="text-slate-500 shrink-0" />
                                        : <ChevronRight size={12} className="text-slate-500 shrink-0" />
                                    }
                                    {statusIcon(conn.lastTestStatus)}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold text-slate-200 truncate">{conn.name}</div>
                                        <div className="text-[10px] text-slate-500 font-mono truncate">{conn.baseUrl}</div>
                                    </div>
                                    <span className={cn(
                                        "text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0",
                                        conn.lastTestStatus === 'success'
                                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                            : conn.lastTestStatus === 'error'
                                                ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                                : "bg-slate-700/30 text-slate-500 border-slate-600/30"
                                    )}>
                                        {statusLabel(conn.lastTestStatus)}
                                    </span>
                                </div>

                                {/* Expanded Detail */}
                                {isExpanded && (
                                    <div className="px-4 pb-3 space-y-2 border-t border-slate-800/50 animate-fade-in">
                                        <div className="pt-2 grid grid-cols-2 gap-2 text-[10px]">
                                            <div>
                                                <span className="text-slate-500">API Key:</span>
                                                <span className="ml-1 text-slate-300 font-mono">
                                                    {conn.apiKey ? '••••••••' + conn.apiKey.slice(-4) : '미설정'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500">생성일:</span>
                                                <span className="ml-1 text-slate-400 font-mono">
                                                    {new Date(conn.createdAt).toLocaleDateString('ko-KR')}
                                                </span>
                                            </div>
                                            {Object.keys(conn.customHeaders).length > 0 && (
                                                <div className="col-span-2">
                                                    <span className="text-slate-500">Custom Headers:</span>
                                                    <span className="ml-1 text-slate-400 font-mono text-[9px]">
                                                        {Object.keys(conn.customHeaders).join(', ')}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-2 pt-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); testConnection(conn.id); }}
                                                className="flex items-center gap-1 px-2.5 py-1.5 bg-cyan-600/20 text-cyan-400 text-[10px] font-medium rounded-lg border border-cyan-500/30 hover:bg-cyan-600/30 transition-colors"
                                            >
                                                <Globe size={10} /> 연결 테스트
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); startEdit(conn); }}
                                                className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-600/20 text-amber-400 text-[10px] font-medium rounded-lg border border-amber-500/30 hover:bg-amber-600/30 transition-colors"
                                            >
                                                <Edit2 size={10} /> 편집
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); removeConnection(conn.id); }}
                                                className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-600/20 text-rose-400 text-[10px] font-medium rounded-lg border border-rose-500/30 hover:bg-rose-600/30 transition-colors"
                                            >
                                                <Trash2 size={10} /> 삭제
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Empty State */}
            {connections.length === 0 && !showForm && (
                <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                    <Server size={32} className="text-slate-600 mb-3" />
                    <p className="text-xs font-medium">등록된 데이터 커넥션이 없습니다</p>
                    <p className="text-[10px] text-slate-600 mt-1">아래 버튼을 눌러 외부 API 파이프라인을 추가하세요</p>
                </div>
            )}

            {/* Add/Edit Form */}
            {showForm && (
                <div className="bg-slate-950/60 border border-cyan-500/30 rounded-xl p-4 space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between mb-1">
                        <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                            {editingId ? '커넥션 편집' : '새 커넥션 추가'}
                        </h4>
                        <button onClick={resetForm} className="p-1 text-slate-500 hover:text-slate-300">
                            <X size={14} />
                        </button>
                    </div>

                    <div>
                        <label className="block text-[10px] font-medium text-slate-400 mb-1">커넥션 이름 *</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="예: LSEG 운임 데이터, Baltic Exchange"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 placeholder:text-slate-600"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-medium text-slate-400 mb-1">Base URL *</label>
                        <input
                            type="text"
                            value={form.baseUrl}
                            onChange={e => setForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                            placeholder="https://api.example.com/v1/data"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono placeholder:text-slate-600"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-medium text-slate-400 mb-1">API Key</label>
                        <div className="relative">
                            <Lock size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="password"
                                value={form.apiKey}
                                onChange={e => setForm(prev => ({ ...prev, apiKey: e.target.value }))}
                                placeholder="Bearer token 또는 API key"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 placeholder:text-slate-600"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-medium text-slate-400 mb-1">Custom Headers (JSON)</label>
                        <textarea
                            value={form.customHeaders}
                            onChange={e => {
                                setForm(prev => ({ ...prev, customHeaders: e.target.value }));
                                if (headerError) validateHeaders(e.target.value);
                            }}
                            placeholder='{"X-Custom-Header": "value"}'
                            rows={2}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono resize-none placeholder:text-slate-600"
                        />
                        {headerError && (
                            <p className="text-[10px] text-rose-400 mt-1">{headerError}</p>
                        )}
                    </div>

                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={handleSubmit}
                            disabled={!form.name.trim() || !form.baseUrl.trim()}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors",
                                form.name.trim() && form.baseUrl.trim()
                                    ? "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white"
                                    : "bg-slate-800 text-slate-600 cursor-not-allowed"
                            )}
                        >
                            <Check size={12} />
                            {editingId ? '변경사항 저장' : '커넥션 추가'}
                        </button>
                        <button
                            onClick={resetForm}
                            className="px-4 py-2 bg-slate-800 text-slate-400 text-xs rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors"
                        >
                            취소
                        </button>
                    </div>
                </div>
            )}

            {/* Add Button */}
            {!showForm && (
                <button
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-cyan-500/30 rounded-xl text-xs font-medium text-slate-400 hover:text-cyan-400 transition-all"
                >
                    <Plus size={14} /> 새 커넥션 추가
                </button>
            )}
        </div>
    );
}
