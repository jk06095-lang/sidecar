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
    onSnapshot,
    type DocumentData,
    type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Scenario, SimulationParams, AppSettings, StrategicDecision, StrategicActionLog, OntologyObject, OntologyLink, IntelArticle } from '../types';

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
// (Briefing persistence moved to BRIEFINGS section below reports)

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

        // Migrate briefings (legacy format → new format)
        const briefingsRaw = localStorage.getItem('sidecar_briefings');
        if (briefingsRaw) {
            const briefings = JSON.parse(briefingsRaw) as { id: string; name?: string; content?: string; createdAt?: string }[];
            const batch = writeBatch(db);
            for (const b of briefings) {
                batch.set(doc(db, 'briefings', b.id), {
                    id: b.id,
                    title: b.name || 'Legacy Briefing',
                    scenarioName: '',
                    date: b.createdAt || new Date().toISOString(),
                    briefingData: { legacyContent: b.content || '' },
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

// ============================================================
// STRATEGIC DECISIONS — Sub-collection: app/strategic_decisions/{id}
// Module 4: C-Level executive action approval records.
// No debounce — executive actions require instant persistence.
// ============================================================

export async function saveStrategicDecision(decision: StrategicDecision): Promise<void> {
    // Instant localStorage cache
    try {
        const existing = JSON.parse(localStorage.getItem('sidecar_strategic_decisions') || '[]') as StrategicDecision[];
        const updated = [decision, ...existing.filter(d => d.id !== decision.id)];
        localStorage.setItem('sidecar_strategic_decisions', JSON.stringify(updated));
    } catch { /* ignore */ }

    // Direct Firestore write (no debounce for executive actions)
    try {
        await setDoc(doc(db, 'app', 'strategic_decisions', decision.id), {
            ...decision,
            updatedAt: serverTimestamp(),
        });
        console.info(`[Firestore] Strategic decision saved: ${decision.id}`);
    } catch (err) {
        console.warn(`[Firestore] saveStrategicDecision failed:`, err);
    }
}

export async function loadStrategicDecisions(): Promise<StrategicDecision[]> {
    try {
        const snap = await getDocs(collection(db, 'app', 'strategic_decisions'));
        if (!snap.empty) {
            return snap.docs.map(d => ({ id: d.id, ...d.data() } as StrategicDecision));
        }
    } catch (err) {
        console.warn('[Firestore] loadStrategicDecisions failed:', err);
    }
    // Fallback to localStorage
    try {
        const raw = localStorage.getItem('sidecar_strategic_decisions');
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

// ============================================================
// STRATEGIC ACTION LOG — Audit trail: app/strategic_action_logs/{id}
// Module 5: Permanent audit record with justification metrics.
// No debounce — executive actions require instant persistence.
// ============================================================

export async function logStrategicDecision(actionLog: StrategicActionLog): Promise<void> {
    // Instant localStorage cache for offline resilience
    try {
        const existing = JSON.parse(localStorage.getItem('sidecar_action_logs') || '[]') as StrategicActionLog[];
        const updated = [actionLog, ...existing.filter(a => a.id !== actionLog.id)].slice(0, 100);
        localStorage.setItem('sidecar_action_logs', JSON.stringify(updated));
    } catch { /* ignore */ }

    // Direct Firestore write — no debounce for audit trail
    try {
        await setDoc(doc(db, 'app', 'strategic_action_logs', actionLog.id), {
            ...actionLog,
            serverTimestamp: serverTimestamp(),
        });
        console.info(`[Firestore] ✅ Audit log saved: ${actionLog.id} (${actionLog.actionType})`);
    } catch (err) {
        console.warn('[Firestore] logStrategicDecision failed (app continues):', err);
        // App does NOT crash — UI state already updated via actionStore
    }
}

// ============================================================
// APPROVAL EVENT LOG — Audit trail for state transitions
// Phase 4: DRAFT → PENDING_APPROVAL → EXECUTED transitions
// ============================================================

export async function logApprovalEvent(
    actionId: string,
    event: { from: string; to: string; timestamp: string; approvedBy?: string; reason?: string },
): Promise<void> {
    const eventId = `${actionId}_${Date.now()}`;
    try {
        await setDoc(doc(db, 'app', 'approval_events', eventId), {
            actionId,
            ...event,
            serverTimestamp: serverTimestamp(),
        });
        console.info(`[Firestore] Approval event logged: ${actionId} ${event.from}→${event.to}`);
    } catch (err) {
        console.warn('[Firestore] logApprovalEvent failed (non-critical):', err);
    }
}

// ============================================================
// ACTION CENTER STATE — Single-document persistence
//   app/action_state — { draftActions, pendingApproval, executedActions }
//   No debounce — user expects instant persistence.
// ============================================================

export async function loadActionState(): Promise<{
    draftActions: StrategicActionLog[];
    pendingApproval: StrategicActionLog[];
    executedActions: StrategicActionLog[];
} | null> {
    try {
        const snap = await getDoc(doc(db, 'app', 'action_state'));
        if (snap.exists()) {
            const data = snap.data();
            return {
                draftActions: (data.draftActions as StrategicActionLog[]) || [],
                pendingApproval: (data.pendingApproval as StrategicActionLog[]) || [],
                executedActions: (data.executedActions as StrategicActionLog[]) || [],
            };
        }
    } catch (err) {
        console.warn('[Firestore] loadActionState failed:', err);
    }
    return null;
}

export async function saveActionState(
    draftActions: StrategicActionLog[],
    pendingApproval: StrategicActionLog[],
    executedActions: StrategicActionLog[],
): Promise<void> {
    try {
        await setDoc(doc(db, 'app', 'action_state'), {
            draftActions,
            pendingApproval,
            executedActions: executedActions.slice(0, 200), // Cap at 200 for document size
            updatedAt: serverTimestamp(),
        });
    } catch (err) {
        console.warn('[Firestore] saveActionState failed:', err);
    }
}

// ============================================================
// REPORTS — Individual document persistence
//   reports/{id} — { id, title, date, content, type, updatedAt }
// ============================================================

export interface ReportDoc {
    id: string;
    title: string;
    date: string;
    content: string;
    type?: 'marp' | 'aip';
}

export async function saveReport(report: ReportDoc): Promise<void> {
    try {
        await setDoc(doc(db, 'reports', report.id), {
            ...report,
            updatedAt: serverTimestamp(),
        });
    } catch (err) {
        console.warn('[Firestore] saveReport failed:', err);
    }
}

export async function loadReports(): Promise<ReportDoc[]> {
    try {
        const snap = await getDocs(collection(db, 'reports'));
        const reports: ReportDoc[] = [];
        snap.forEach(d => {
            const data = d.data();
            reports.push({
                id: d.id,
                title: data.title || '',
                date: data.date || '',
                content: data.content || '',
                type: data.type || 'marp',
            });
        });
        // Sort newest first
        reports.sort((a, b) => b.id.localeCompare(a.id));
        return reports;
    } catch (err) {
        console.warn('[Firestore] loadReports failed:', err);
        return [];
    }
}

export async function deleteReport(reportId: string): Promise<void> {
    try {
        await deleteDoc(doc(db, 'reports', reportId));
    } catch (err) {
        console.warn('[Firestore] deleteReport failed:', err);
    }
}

// ============================================================
// BRIEFINGS — AIP Executive Briefing persistence
//   briefings/{id} — { id, title, scenarioName, date, briefingData, updatedAt }
// ============================================================

export interface BriefingDoc {
    id: string;
    title: string;
    scenarioName: string;
    date: string;
    briefingData: Record<string, unknown>; // AIPExecutiveBriefing serialized
}

export async function saveBriefing(briefing: BriefingDoc): Promise<void> {
    try {
        await setDoc(doc(db, 'briefings', briefing.id), {
            ...briefing,
            updatedAt: serverTimestamp(),
        });
    } catch (err) {
        console.warn('[Firestore] saveBriefing failed:', err);
    }
}

export async function loadBriefings(): Promise<BriefingDoc[]> {
    try {
        const snap = await getDocs(collection(db, 'briefings'));
        const items: BriefingDoc[] = [];
        snap.forEach(d => {
            const data = d.data();
            items.push({
                id: d.id,
                title: data.title || '',
                scenarioName: data.scenarioName || '',
                date: data.date || '',
                briefingData: data.briefingData || {},
            });
        });
        items.sort((a, b) => b.id.localeCompare(a.id));
        return items;
    } catch (err) {
        console.warn('[Firestore] loadBriefings failed:', err);
        return [];
    }
}

export async function deleteBriefing(briefingId: string): Promise<void> {
    try {
        await deleteDoc(doc(db, 'briefings', briefingId));
    } catch (err) {
        console.warn('[Firestore] deleteBriefing failed:', err);
    }
}

// ============================================================
// ONTOLOGY GRAPH — Single-document persistence
//   app/ontology_objects  — { items: OntologyObject[] }
//   app/ontology_links    — { items: OntologyLink[] }
//
// Single-doc pattern: 2 reads on load, 1 write per mutation.
// Cost-efficient for graphs < 500 nodes.
// ============================================================

/**
 * Load the full ontology graph from Firestore.
 * Returns null if DB is empty (first-run signal for seeding).
 */
export async function loadOntologyGraph(): Promise<{
    objects: OntologyObject[];
    links: OntologyLink[];
} | null> {
    try {
        const [objSnap, linkSnap] = await Promise.all([
            getDoc(doc(db, 'app', 'ontology_objects')),
            getDoc(doc(db, 'app', 'ontology_links')),
        ]);

        if (!objSnap.exists()) {
            console.info('[Firestore] Ontology graph not found — first run detected');
            return null; // Signal: need seeding
        }

        const objects = (objSnap.data().items as OntologyObject[]) || [];
        const links = linkSnap.exists()
            ? (linkSnap.data().items as OntologyLink[]) || []
            : [];

        console.info(`[Firestore] Ontology loaded: ${objects.length} objects, ${links.length} links`);
        return { objects, links };
    } catch (err) {
        console.warn('[Firestore] loadOntologyGraph failed:', err);

        // Fallback: try localStorage cache
        try {
            const objRaw = localStorage.getItem('sidecar_ontology_objects');
            const linkRaw = localStorage.getItem('sidecar_ontology_links');
            if (objRaw) {
                const objects = JSON.parse(objRaw) as OntologyObject[];
                const links = linkRaw ? (JSON.parse(linkRaw) as OntologyLink[]) : [];
                console.info('[Firestore] Using localStorage fallback for ontology');
                return { objects, links };
            }
        } catch { /* ignore */ }

        return null;
    }
}

/**
 * Seed the ontology graph into Firestore (first-run only).
 * Writes all objects and links as a batch, then caches in localStorage.
 */
export async function seedOntologyGraph(
    objects: OntologyObject[],
    links: OntologyLink[],
): Promise<void> {
    console.info(`[Firestore] Seeding ontology: ${objects.length} objects, ${links.length} links`);
    try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'app', 'ontology_objects'), {
            items: objects,
            updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'app', 'ontology_links'), {
            items: links,
            updatedAt: serverTimestamp(),
        });
        await batch.commit();

        // Cache in localStorage
        localStorage.setItem('sidecar_ontology_objects', JSON.stringify(objects));
        localStorage.setItem('sidecar_ontology_links', JSON.stringify(links));
        console.info('[Firestore] Ontology seed completed successfully');
    } catch (err) {
        console.error('[Firestore] seedOntologyGraph failed:', err);
        throw err; // Propagate — caller should handle
    }
}

/**
 * Persist the full objects array to Firestore.
 * Used after add/remove/update operations.
 */
export function persistOntologyObjects(objects: OntologyObject[]): void {
    // Instant localStorage cache
    localStorage.setItem('sidecar_ontology_objects', JSON.stringify(objects));

    debouncedWrite('ontology_objects', async () => {
        await setDoc(doc(db, 'app', 'ontology_objects'), {
            items: objects,
            updatedAt: serverTimestamp(),
        });
    }, 800);
}

/**
 * Persist the full links array to Firestore.
 * Used after add/remove link operations.
 */
export function persistOntologyLinks(links: OntologyLink[]): void {
    // Instant localStorage cache
    localStorage.setItem('sidecar_ontology_links', JSON.stringify(links));

    debouncedWrite('ontology_links', async () => {
        await setDoc(doc(db, 'app', 'ontology_links'), {
            items: links,
            updatedAt: serverTimestamp(),
        });
    }, 800);
}

/**
 * Immediately persist objects (no debounce).
 * Used for critical operations like add/remove where data loss is unacceptable.
 */
export async function persistOntologyObjectsImmediate(objects: OntologyObject[]): Promise<void> {
    localStorage.setItem('sidecar_ontology_objects', JSON.stringify(objects));
    try {
        await setDoc(doc(db, 'app', 'ontology_objects'), {
            items: objects,
            updatedAt: serverTimestamp(),
        });
    } catch (err) {
        console.error('[Firestore] persistOntologyObjectsImmediate failed:', err);
        throw err;
    }
}

/**
 * Immediately persist links (no debounce).
 */
export async function persistOntologyLinksImmediate(links: OntologyLink[]): Promise<void> {
    localStorage.setItem('sidecar_ontology_links', JSON.stringify(links));
    try {
        await setDoc(doc(db, 'app', 'ontology_links'), {
            items: links,
            updatedAt: serverTimestamp(),
        });
    } catch (err) {
        console.error('[Firestore] persistOntologyLinksImmediate failed:', err);
        throw err;
    }
}

// ============================================================
// ONTOLOGY GRAPH — Real-time onSnapshot listener
// Returns unsubscribe functions for cleanup.
// Uses the same single-doc pattern (app/ontology_objects, app/ontology_links).
// ============================================================

export interface OntologySnapshot {
    objects: OntologyObject[];
    links: OntologyLink[];
}

/**
 * Subscribe to real-time ontology graph updates via onSnapshot.
 * Calls `onChange` whenever either objects or links doc changes.
 * Returns a cleanup function that unsubscribes both listeners.
 *
 * On first call, the snapshot fires immediately with current data.
 * Subsequent fires = remote changes from other tabs/clients.
 */
export function subscribeOntologyGraph(
    onChange: (snapshot: OntologySnapshot) => void,
    onError?: (error: Error) => void,
): Unsubscribe {
    let latestObjects: OntologyObject[] = [];
    let latestLinks: OntologyLink[] = [];
    let objectsReceived = false;
    let linksReceived = false;

    const emit = () => {
        if (objectsReceived && linksReceived) {
            onChange({ objects: latestObjects, links: latestLinks });
        }
    };

    const unsubObjects = onSnapshot(
        doc(db, 'app', 'ontology_objects'),
        (snap) => {
            if (snap.exists()) {
                latestObjects = (snap.data().items as OntologyObject[]) || [];
            } else {
                latestObjects = [];
            }
            objectsReceived = true;
            emit();
        },
        (err) => {
            console.error('[Firestore] onSnapshot ontology_objects error:', err);
            onError?.(err);
        },
    );

    const unsubLinks = onSnapshot(
        doc(db, 'app', 'ontology_links'),
        (snap) => {
            if (snap.exists()) {
                latestLinks = (snap.data().items as OntologyLink[]) || [];
            } else {
                latestLinks = [];
            }
            linksReceived = true;
            emit();
        },
        (err) => {
            console.error('[Firestore] onSnapshot ontology_links error:', err);
            onError?.(err);
        },
    );

    console.info('[Firestore] 🔴 LIVE: Subscribed to ontology graph (onSnapshot)');

    return () => {
        unsubObjects();
        unsubLinks();
        console.info('[Firestore] Unsubscribed from ontology graph');
    };
}

// ============================================================
// FLEET TELEMETRY — Real-time onSnapshot listener
// Listens to app/fleet_telemetry for vessel position updates.
// ============================================================

export interface FleetTelemetryEntry {
    mmsi: string;
    lat: number;
    lng: number;
    speed: number;
    heading: number;
    vesselName?: string;
    timestamp: string;
}

/**
 * Subscribe to fleet telemetry updates.
 * Fires onChange with the full array whenever any position doc changes.
 */
export function subscribeFleetTelemetry(
    onChange: (entries: FleetTelemetryEntry[]) => void,
    onError?: (error: Error) => void,
): Unsubscribe {
    const colRef = collection(db, 'app', 'fleet_telemetry', 'positions');

    const unsub = onSnapshot(
        colRef,
        (snapshot) => {
            const entries: FleetTelemetryEntry[] = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                entries.push({
                    mmsi: docSnap.id,
                    lat: data.lat ?? 0,
                    lng: data.lng ?? 0,
                    speed: data.speed ?? 0,
                    heading: data.heading ?? 0,
                    vesselName: data.vesselName,
                    timestamp: data.timestamp ?? new Date().toISOString(),
                });
            });
            onChange(entries);
        },
        (err) => {
            console.warn('[Firestore] onSnapshot fleet_telemetry error:', err);
            onError?.(err);
        },
    );

    console.info('[Firestore] 🔴 LIVE: Subscribed to fleet telemetry (onSnapshot)');
    return unsub;
}

/**
 * Write a single vessel telemetry position to Firestore.
 * Used by AIS service to persist received positions.
 */
export async function writeFleetTelemetryPosition(entry: FleetTelemetryEntry): Promise<void> {
    try {
        await setDoc(
            doc(db, 'app', 'fleet_telemetry', 'positions', entry.mmsi),
            {
                ...entry,
                serverTimestamp: serverTimestamp(),
            },
        );
    } catch (err) {
        console.warn('[Firestore] writeFleetTelemetryPosition failed:', err);
    }
}

// ============================================================
// INTELLIGENCE ARTICLES — Cached news feed (chat-like history)
// Documents: app/intel_osint, app/intel_official
// TTL: 14 days — scrapped/ontology-linked articles exempt
// ============================================================

type IntelCategory = 'osint' | 'official';

const INTEL_DOC_KEY: Record<IntelCategory, string> = {
    osint: 'intel_osint',
    official: 'intel_official',
};

const INTEL_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const INTEL_MAX_ITEMS = 100;

/**
 * Load cached Intel articles from Firestore.
 * Automatically prunes articles older than 14 days,
 * but preserves any articles whose IDs appear in the scrappedIds set.
 */
export async function loadIntelArticles(
    category: IntelCategory,
    scrappedArticleUrls?: Set<string>,
): Promise<IntelArticle[]> {
    try {
        const snap = await getDoc(doc(db, 'app', INTEL_DOC_KEY[category]));
        if (!snap.exists()) return [];

        const data = snap.data();
        const items: IntelArticle[] = data.items || [];

        // TTL cleanup: remove articles older than 14 days, but keep scrapped ones
        const cutoff = Date.now() - INTEL_TTL_MS;
        const filtered = items.filter(article => {
            const fetchedAt = new Date(article.fetchedAt || article.publishedAt).getTime();
            const isExpired = fetchedAt < cutoff;
            const isScrapped = scrappedArticleUrls?.has(article.url) ?? false;
            return !isExpired || isScrapped;
        });

        // If we pruned any, persist the cleaned list back
        if (filtered.length < items.length) {
            console.info(`[Firestore] Intel ${category}: pruned ${items.length - filtered.length} expired articles (14d TTL)`);
            persistIntelArticlesImmediate(category, filtered);
        }

        console.info(`[Firestore] Loaded ${filtered.length} cached ${category} articles`);
        return filtered;
    } catch (err) {
        console.warn(`[Firestore] loadIntelArticles(${category}) failed:`, err);
        return [];
    }
}

/**
 * Persist Intel articles to Firestore (debounced, 2s).
 * Caps at INTEL_MAX_ITEMS to stay within Firestore document size limits.
 */
export function persistIntelArticles(category: IntelCategory, articles: IntelArticle[]): void {
    debouncedWrite(`intel_${category}`, async () => {
        await persistIntelArticlesImmediate(category, articles);
    }, 2000);
}

/** Immediate (non-debounced) persist for cleanup writes */
async function persistIntelArticlesImmediate(category: IntelCategory, articles: IntelArticle[]): Promise<void> {
    try {
        // Keep only the most recent items
        const trimmed = articles.slice(0, INTEL_MAX_ITEMS);
        await setDoc(doc(db, 'app', INTEL_DOC_KEY[category]), {
            items: trimmed,
            updatedAt: serverTimestamp(),
        });
        console.info(`[Firestore] Persisted ${trimmed.length} ${category} articles`);
    } catch (err) {
        console.warn(`[Firestore] persistIntelArticles(${category}) failed:`, err);
    }
}
