/**
 * Vercel Serverless BFF Proxy — SIDECAR
 *
 * Securely proxies LSEG API requests from the frontend.
 * API keys are injected server-side from process.env and never
 * exposed to the browser.
 *
 * Frontend sends: { endpoint, params?, method?, body? }
 * This function:
 *   1. Validates the request
 *   2. Constructs the full LSEG URL
 *   3. Injects Authorization + Product-ID headers
 *   4. Forwards the request and streams the response back
 *
 * Deploy: Vercel auto-detects api/ folder as serverless functions.
 * Local:  `vercel dev` routes /api/* to this function automatically.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Security ──────────────────────────────────────────────────
const ALLOWED_UPSTREAM_HOST = 'api.refinitiv.com';
const LSEG_BASE_URL = `https://${ALLOWED_UPSTREAM_HOST}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // ── CORS preflight ────────────────────────────────────────
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // ── Only accept GET and POST ──────────────────────────────
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
    }

    // ── Extract parameters ────────────────────────────────────
    // GET  → query params: ?endpoint=/data/pricing&params=...
    // POST → JSON body:    { endpoint, params, method, body }
    let endpoint: string | undefined;
    let params: Record<string, string> | undefined;
    let upstreamMethod: string = 'GET';
    let upstreamBody: unknown | undefined;

    if (req.method === 'GET') {
        endpoint = req.query.endpoint as string | undefined;
        const rawParams = req.query.params as string | undefined;
        if (rawParams) {
            try {
                params = JSON.parse(rawParams);
            } catch {
                return res.status(400).json({ error: 'Invalid params JSON in query string.' });
            }
        }
    } else {
        // POST
        const body = req.body || {};
        endpoint = body.endpoint;
        params = body.params;
        upstreamMethod = (body.method || 'GET').toUpperCase();
        upstreamBody = body.body;
    }

    // ── Validate endpoint ─────────────────────────────────────
    if (!endpoint || typeof endpoint !== 'string') {
        return res.status(400).json({
            error: 'Missing required field: endpoint',
            hint: 'Send { endpoint: "/data/pricing/snapshots" } in the request body or as a query parameter.',
        });
    }

    // Prevent path traversal & enforce relative path
    if (!endpoint.startsWith('/')) {
        endpoint = `/${endpoint}`;
    }

    // ── Read server-only secrets ──────────────────────────────
    const apiKey = process.env.LSEG_API_KEY;
    const productId = process.env.LSEG_PRODUCT_ID;

    if (!apiKey) {
        console.error('[BFF Proxy] LSEG_API_KEY is not configured in environment variables.');
        return res.status(500).json({
            error: 'Server configuration error',
            detail: 'LSEG API key is not configured. Please set LSEG_API_KEY in Vercel environment variables.',
        });
    }

    // ── Build upstream URL ────────────────────────────────────
    const url = new URL(`${LSEG_BASE_URL}${endpoint}`);

    if (params && typeof params === 'object') {
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.set(key, String(value));
        });
    }

    // ── Build upstream request ────────────────────────────────
    const upstreamHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
    };

    if (productId) {
        upstreamHeaders['X-Product-ID'] = productId;
    }

    const fetchOptions: RequestInit = {
        method: upstreamMethod,
        headers: upstreamHeaders,
    };

    if (['POST', 'PUT', 'PATCH'].includes(upstreamMethod) && upstreamBody) {
        fetchOptions.body = typeof upstreamBody === 'string'
            ? upstreamBody
            : JSON.stringify(upstreamBody);
    }

    // ── Execute upstream request ──────────────────────────────
    try {
        console.info(`[BFF Proxy] ${upstreamMethod} ${url.pathname}${url.search}`);

        const upstream = await fetch(url.toString(), fetchOptions);
        const contentType = upstream.headers.get('content-type') || '';

        // Forward rate-limit headers if present
        const rateLimitHeaders = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'];
        rateLimitHeaders.forEach((header) => {
            const value = upstream.headers.get(header);
            if (value) res.setHeader(header, value);
        });

        if (contentType.includes('application/json')) {
            const data = await upstream.json();
            return res.status(upstream.status).json(data);
        } else {
            const text = await upstream.text();
            return res.status(upstream.status).send(text);
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[BFF Proxy] Upstream request failed:', message);
        return res.status(502).json({
            error: 'Upstream request failed',
            detail: message,
        });
    }
}
