/**
 * Firestore Service Layer — SIDECAR Backend
 * 
 * Best Practices Applied:
 *   1. Single-document per user for small collections (settings, favorites)
 *      → Cost: 1 read per page load, 1 write per save. No query needed.
 *   2. Sub-collection for large/growing data (briefings, logicMaps)
 *      → Orphan prevention: cleanup function on scenario delete.
 *   3. Debounced writes — coalesce rapid changes (sliders, drags) into 1 write.
 *   4. Graceful fallback — if Firestore fails, falls back to localStorage.
 *   5. Firestore Security Rules documented below.
 * 
 * Firestore Rules (deploy to Firebase Console → Firestore → Rules):
 * ```
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     // Require authentication for all app data
 *     match /app/{docId} {
 *       allow read, write: if request.auth != null;
 *     }
 *     match /app/{docId}/{sub=**} {
 *       allow read, write: if request.auth != null;
 *     }
 *   }
 * }
 * ```
 * 
 * Collection Schema:
 *   app/settings        — { apiKey, theme, language, ... }
 *   app/favorites       — { items: [{scenarioId, alias}] }
 *   app/scenarios       — { items: [Scenario[]] }
 *   app/logicMaps/{id}  — { nodes[], edges[], updatedAt }
 *   app/briefings/{id}  — { name, content, createdAt }
 */

import {
    doc, getDoc, setDoc, deleteDoc,
    collection, getDocs, writeBatch,
    serverTimestamp, Timestamp,
    type DocumentData
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Scenario, SimulationParams, AppSettings } from '../types';

// ============================================================
// DEBOUNCE UTILITY — Prevent rapid Firestore writes
// ============================================================

const debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

function debouncedWrite(key: string, fn: () => Promise<void>, delayMs = 1500) {
    const existing = debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    debounceTimers.set(key, setTimeout(async () => {
        try {
            await fn();
        } catch (err) {
            console.warn(`[Firestore] Debounced write failed for ${key}:`, err);
        }
        debounceTimers.delete(key);
    }, delayMs));
}

// ============================================================
// SETTINGS — Single document: app/settings
// Cost: 1 read on load, 1 write on save
// ============================================================

export async function loadSettings(): Promise<AppSettings | null> {
    try {
        const snap = await getDoc(doc(db, 'app', 'settings'));
        if (snap.exists()) {
            return snap.data() as AppSettings;
        }
    } catch (err) {
        console.warn('[Firestore] loadSettings failed, using localStorage fallback:', err);
    }
    return null;
}

export function saveSettings(settings: AppSettings): void {
    // Also keep localStorage as immediate cache
    localStorage.setItem('sidecar_settings', JSON.stringify(settings));

    debouncedWrite('settings', async () => {
        await setDoc(doc(db, 'app', 'settings'), {
            ...settings,
            updatedAt: serverTimestamp(),
        }, { merge: true });
    });
}

// ============================================================
// FAVORITES — Single document: app/favorites
// Cost: 1 read on load, 1 write on save
// ============================================================

export interface FavoriteEntry {
    scenarioId: string;
    alias?: string;
}

export async function loadFavorites(): Promise<FavoriteEntry[]> {
    try {
        const snap = await getDoc(doc(db, 'app', 'favorites'));
        if (snap.exists()) {
            return (snap.data().items as FavoriteEntry[]) || [];
        }
    } catch (err) {
        console.warn('[Firestore] loadFavorites failed, using localStorage fallback:', err);
    }
    // Fallback to localStorage
    try {
        const raw = localStorage.getItem('sidecar_scenario_favorites');
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

export function saveFavorites(favorites: FavoriteEntry[]): void {
    // Keep localStorage as instant cache
    localStorage.setItem('sidecar_scenario_favorites', JSON.stringify(favorites));

    debouncedWrite('favorites', async () => {
        await setDoc(doc(db, 'app', 'favorites'), {
            items: favorites,
            updatedAt: serverTimestamp(),
        });
    });
}

// ============================================================
// SCENARIOS — Single document: app/scenarios
// Cost: 1 read on load, 1 write on save
// User-created scenarios only; base scenarios come from mockData.ts
// ============================================================

export async function loadCustomScenarios(): Promise<Scenario[]> {
    try {
        const snap = await getDoc(doc(db, 'app', 'scenarios'));
        if (snap.exists()) {
            return (snap.data().items as Scenario[]) || [];
        }
    } catch (err) {
        console.warn('[Firestore] loadCustomScenarios failed:', err);
    }
    return [];
}

export function saveCustomScenarios(scenarios: Scenario[]): void {
    // Only persist custom (user-created) scenarios
    const customOnly = scenarios.filter(s => s.isCustom);
    debouncedWrite('scenarios', async () => {
        await setDoc(doc(db, 'app', 'scenarios'), {
            items: customOnly,
            updatedAt: serverTimestamp(),
        });
    });
}

// ============================================================
// LOGIC MAPS — Sub-collection: app/logicMaps/{scenarioId}
// Cost: 1 read per scenario, 1 write per save
// Orphan prevention: cleanup on scenario delete
// ============================================================

export async function loadLogicMap(scenarioId: string): Promise<{ nodes: any[]; edges: any[] } | null> {
    try {
        const snap = await getDoc(doc(db, 'app', 'logicMaps', scenarioId));
        if (snap.exists()) {
            const data = snap.data();
            return { nodes: data.nodes || [], edges: data.edges || [] };
        }
    } catch (err) {
        console.warn(`[Firestore] loadLogicMap(${scenarioId}) failed:`, err);
    }
    // Fallback to localStorage
    try {
        const raw = localStorage.getItem(`sidecar_logicmap_${scenarioId}`);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function saveLogicMap(scenarioId: string, nodes: any[], edges: any[]): void {
    // Keep localStorage as cache
    if (nodes.length > 0 || edges.length > 0) {
        localStorage.setItem(`sidecar_logicmap_${scenarioId}`, JSON.stringify({ nodes, edges }));
    } else {
        localStorage.removeItem(`sidecar_logicmap_${scenarioId}`);
    }

    debouncedWrite(`logicMap_${scenarioId}`, async () => {
        if (nodes.length === 0 && edges.length === 0) {
            // Delete empty maps → no orphan documents
            await deleteDoc(doc(db, 'app', 'logicMaps', scenarioId));
        } else {
            await setDoc(doc(db, 'app', 'logicMaps', scenarioId), {
                nodes,
                edges,
                updatedAt: serverTimestamp(),
            });
        }
    });
}

// ============================================================
// BRIEFINGS — Sub-collection: app/briefings/{id}
// Cost: N reads to list, 1 write per save
// ============================================================

export interface BriefingDoc {
    id: string;
    name: string;
    content: string;
    createdAt: string;
}

export async function loadBriefings(): Promise<BriefingDoc[]> {
    try {
        const snap = await getDocs(collection(db, 'app', 'briefings'));
        if (!snap.empty) {
            return snap.docs.map(d => ({ id: d.id, ...d.data() } as BriefingDoc));
        }
    } catch (err) {
        console.warn('[Firestore] loadBriefings failed:', err);
    }
    // Fallback
    try {
        const raw = localStorage.getItem('sidecar_briefings');
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

export function saveBriefing(briefing: BriefingDoc): void {
    debouncedWrite(`briefing_${briefing.id}`, async () => {
        await setDoc(doc(db, 'app', 'briefings', briefing.id), {
            name: briefing.name,
            content: briefing.content,
            createdAt: briefing.createdAt,
            updatedAt: serverTimestamp(),
        });
    }, 500);
}

export async function deleteBriefing(id: string): Promise<void> {
    try {
        await deleteDoc(doc(db, 'app', 'briefings', id));
    } catch (err) {
        console.warn(`[Firestore] deleteBriefing(${id}) failed:`, err);
    }
}

// ============================================================
// ORPHAN CLEANUP — Call when a scenario is deleted
// Removes associated logicMap + any dangling references
// ============================================================

export async function cleanupScenarioOrphans(scenarioId: string): Promise<void> {
    try {
        // Delete logic map for this scenario
        await deleteDoc(doc(db, 'app', 'logicMaps', scenarioId));
        localStorage.removeItem(`sidecar_logicmap_${scenarioId}`);
        console.info(`[Firestore] Cleaned up orphans for scenario: ${scenarioId}`);
    } catch (err) {
        console.warn(`[Firestore] Orphan cleanup failed for ${scenarioId}:`, err);
    }
}

// ============================================================
// BATCH SYNC — Initial migration of localStorage → Firestore
// Run once on first visit after Firebase integration.
// ============================================================

export async function migrateLocalStorageToFirestore(): Promise<void> {
    const migrationFlag = 'sidecar_firestore_migrated';
    if (localStorage.getItem(migrationFlag) === 'true') return;

    console.info('[Firestore] Starting localStorage → Firestore migration...');

    try {
        // Migrate settings
        const settingsRaw = localStorage.getItem('sidecar_settings');
        if (settingsRaw) {
            const existing = await getDoc(doc(db, 'app', 'settings'));
            if (!existing.exists()) {
                await setDoc(doc(db, 'app', 'settings'), {
                    ...JSON.parse(settingsRaw),
                    updatedAt: serverTimestamp(),
                });
            }
        }

        // Migrate favorites
        const favsRaw = localStorage.getItem('sidecar_scenario_favorites');
        if (favsRaw) {
            const existing = await getDoc(doc(db, 'app', 'favorites'));
            if (!existing.exists()) {
                await setDoc(doc(db, 'app', 'favorites'), {
                    items: JSON.parse(favsRaw),
                    updatedAt: serverTimestamp(),
                });
            }
        }

        // Migrate briefings
        const briefingsRaw = localStorage.getItem('sidecar_briefings');
        if (briefingsRaw) {
            const briefings: BriefingDoc[] = JSON.parse(briefingsRaw);
            const batch = writeBatch(db);
            for (const b of briefings) {
                batch.set(doc(db, 'app', 'briefings', b.id), {
                    name: b.name,
                    content: b.content,
                    createdAt: b.createdAt,
                    updatedAt: serverTimestamp(),
                });
            }
            await batch.commit();
        }

        localStorage.setItem(migrationFlag, 'true');
        console.info('[Firestore] Migration completed successfully.');
    } catch (err) {
        console.warn('[Firestore] Migration failed (will retry next visit):', err);
    }
}
