/**
 * apiConfigStore — Dynamic Data Connection Manager (Zustand + persist)
 * 
 * Manages user-defined API pipeline connections with encrypted localStorage persistence.
 * Uses Base64 + Salt obfuscation for API keys and custom headers.
 */

import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

// ============================================================
// API CONNECTION TYPE
// ============================================================

export interface ApiConnection {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    customHeaders: Record<string, string>;
    createdAt: string;
    lastTestedAt?: string;
    lastTestStatus?: 'success' | 'error' | 'pending';
}

// ============================================================
// BASE64 + SALT ENCRYPTION / DECRYPTION
// ============================================================

const SALT = 'SIDECAR_AIP_v2_';
const SUFFIX = '_MARITIME';

function encode(plain: string): string {
    if (!plain) return '';
    try {
        return btoa(SALT + plain + SUFFIX);
    } catch {
        return plain;
    }
}

function decode(encoded: string): string {
    if (!encoded) return '';
    try {
        const decoded = atob(encoded);
        if (decoded.startsWith(SALT) && decoded.endsWith(SUFFIX)) {
            return decoded.slice(SALT.length, -SUFFIX.length);
        }
        return decoded;
    } catch {
        return encoded; // fallback: return as-is if not encoded
    }
}

function encodeHeaders(headers: Record<string, string>): string {
    if (!headers || Object.keys(headers).length === 0) return '';
    return encode(JSON.stringify(headers));
}

function decodeHeaders(encoded: string): Record<string, string> {
    if (!encoded) return {};
    try {
        return JSON.parse(decode(encoded));
    } catch {
        return {};
    }
}

// ============================================================
// ENCRYPTED STORAGE ADAPTER
// ============================================================

const STORAGE_KEY = 'sidecar_api_connections';

interface StoredConnection {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;        // encoded
    customHeaders: string; // encoded JSON
    createdAt: string;
    lastTestedAt?: string;
    lastTestStatus?: 'success' | 'error' | 'pending';
}

function serializeConnections(connections: ApiConnection[]): StoredConnection[] {
    return connections.map(c => ({
        id: c.id,
        name: c.name,
        baseUrl: c.baseUrl,
        apiKey: encode(c.apiKey),
        customHeaders: encodeHeaders(c.customHeaders),
        createdAt: c.createdAt,
        lastTestedAt: c.lastTestedAt,
        lastTestStatus: c.lastTestStatus,
    }));
}

function deserializeConnections(stored: StoredConnection[]): ApiConnection[] {
    return stored.map(s => ({
        id: s.id,
        name: s.name,
        baseUrl: s.baseUrl,
        apiKey: decode(s.apiKey),
        customHeaders: decodeHeaders(s.customHeaders),
        createdAt: s.createdAt,
        lastTestedAt: s.lastTestedAt,
        lastTestStatus: s.lastTestStatus,
    }));
}

// Custom storage that encrypts sensitive fields
const encryptedStorage: StateStorage = {
    getItem: (name: string) => {
        const raw = localStorage.getItem(name);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            if (parsed.state?.connections) {
                parsed.state.connections = deserializeConnections(parsed.state.connections);
            }
            return JSON.stringify(parsed);
        } catch {
            return raw;
        }
    },
    setItem: (name: string, value: string) => {
        try {
            const parsed = JSON.parse(value);
            if (parsed.state?.connections) {
                parsed.state.connections = serializeConnections(parsed.state.connections);
            }
            localStorage.setItem(name, JSON.stringify(parsed));
        } catch {
            localStorage.setItem(name, value);
        }
    },
    removeItem: (name: string) => {
        localStorage.removeItem(name);
    },
};

// ============================================================
// STORE
// ============================================================

interface ApiConfigState {
    connections: ApiConnection[];
    addConnection: (conn: Omit<ApiConnection, 'id' | 'createdAt'>) => void;
    updateConnection: (id: string, updates: Partial<Omit<ApiConnection, 'id' | 'createdAt'>>) => void;
    removeConnection: (id: string) => void;
    testConnection: (id: string) => Promise<void>;
}

export const useApiConfigStore = create<ApiConfigState>()(
    persist(
        (set, get) => ({
            connections: [],

            addConnection: (conn) => {
                const newConn: ApiConnection = {
                    ...conn,
                    id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    createdAt: new Date().toISOString(),
                };
                set(state => ({ connections: [...state.connections, newConn] }));
            },

            updateConnection: (id, updates) => {
                set(state => ({
                    connections: state.connections.map(c =>
                        c.id === id ? { ...c, ...updates } : c,
                    ),
                }));
            },

            removeConnection: (id) => {
                set(state => ({
                    connections: state.connections.filter(c => c.id !== id),
                }));
            },

            testConnection: async (id) => {
                const conn = get().connections.find(c => c.id === id);
                if (!conn) return;

                set(state => ({
                    connections: state.connections.map(c =>
                        c.id === id ? { ...c, lastTestStatus: 'pending' as const, lastTestedAt: new Date().toISOString() } : c,
                    ),
                }));

                try {
                    const res = await fetch('/api/proxy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            targetUrl: conn.baseUrl,
                            method: 'GET',
                            headers: {
                                ...conn.customHeaders,
                                ...(conn.apiKey ? { 'Authorization': `Bearer ${conn.apiKey}` } : {}),
                            },
                        }),
                    });

                    const status = res.ok ? 'success' : 'error';
                    set(state => ({
                        connections: state.connections.map(c =>
                            c.id === id ? { ...c, lastTestStatus: status as 'success' | 'error', lastTestedAt: new Date().toISOString() } : c,
                        ),
                    }));
                } catch {
                    set(state => ({
                        connections: state.connections.map(c =>
                            c.id === id ? { ...c, lastTestStatus: 'error' as const, lastTestedAt: new Date().toISOString() } : c,
                        ),
                    }));
                }
            },
        }),
        {
            name: STORAGE_KEY,
            storage: createJSONStorage(() => encryptedStorage),
        },
    ),
);
