/**
 * Vercel Serverless BFF Proxy — Gemini AI
 *
 * Securely proxies Google Gemini API requests from the frontend.
 * GEMINI_API_KEY is injected server-side from process.env and never
 * exposed to the browser.
 *
 * Frontend sends: { action, model?, temperature?, prompt, stream? }
 * This function:
 *   1. Validates the request
 *   2. Injects the API key server-side
 *   3. Calls Google Generative AI
 *   4. Returns JSON or SSE stream
 *
 * Deploy: Vercel auto-detects api/ folder as serverless functions.
 * Local:  `vercel dev` routes /api/* to this function automatically.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // ── CORS preflight ────────────────────────────────────────
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // ── Only accept POST ──────────────────────────────────────
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    // ── Extract parameters ────────────────────────────────────
    const body = req.body || {};
    const {
        action = 'generate',   // 'generate' | 'stream'
        model = 'gemini-2.5-flash',
        temperature,
        prompt,
        tools,               // Optional: e.g. [{ googleSearch: {} }]
    } = body;

    // ── Validate prompt ───────────────────────────────────────
    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({
            error: 'Missing required field: prompt',
            hint: 'Send { prompt: "your text", action: "generate" } in the request body.',
        });
    }

    // ── Read server-only secret ───────────────────────────────
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error('[BFF Gemini] GEMINI_API_KEY is not configured in environment variables.');
        return res.status(500).json({
            error: 'Server configuration error',
            detail: 'Gemini API key is not configured. Please set GEMINI_API_KEY in Vercel environment variables.',
        });
    }

    // ── Build Google Generative AI request ────────────────────
    const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

    const requestBody: Record<string, unknown> = {
        contents: [
            {
                role: 'user',
                parts: [{ text: prompt }],
            },
        ],
    };

    if (temperature !== undefined) {
        requestBody.generationConfig = { temperature: Number(temperature) };
    }

    // Pass through tools config (e.g. Google Search Grounding)
    if (tools && Array.isArray(tools)) {
        requestBody.tools = tools;
    }

    // ── Route by action ───────────────────────────────────────
    try {
        if (action === 'stream') {
            // ── SSE Streaming ─────────────────────────────────
            const url = `${GOOGLE_API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

            const upstream = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!upstream.ok) {
                const errorText = await upstream.text();
                console.error(`[BFF Gemini] Upstream stream error ${upstream.status}:`, errorText);
                return res.status(upstream.status).json({
                    error: 'Gemini API error',
                    detail: errorText,
                });
            }

            // Set SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const reader = upstream.body?.getReader();
            if (!reader) {
                return res.status(502).json({ error: 'No response body from upstream' });
            }

            const decoder = new TextDecoder();

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    res.write(chunk);
                }
            } finally {
                reader.releaseLock();
            }

            return res.end();
        } else {
            // ── Standard JSON response ────────────────────────
            const url = `${GOOGLE_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

            const upstream = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!upstream.ok) {
                const errorText = await upstream.text();
                console.error(`[BFF Gemini] Upstream error ${upstream.status}:`, errorText);
                return res.status(upstream.status).json({
                    error: 'Gemini API error',
                    detail: errorText,
                });
            }

            const data = await upstream.json();
            return res.status(200).json(data);
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[BFF Gemini] Request failed:', message);
        return res.status(502).json({
            error: 'Gemini proxy request failed',
            detail: message,
        });
    }
}
