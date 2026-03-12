/**
 * Vercel Serverless Proxy — SIDECAR BFF
 * 
 * Receives { targetUrl, headers, method, body } from the frontend,
 * makes the actual HTTP request server-side to bypass CORS,
 * and returns the response as-is.
 * 
 * Deploy: Vercel auto-detects api/ folder as serverless functions.
 * Local: vite.config.ts proxies /api/proxy → this function via Vercel CLI.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    const { targetUrl, headers = {}, method = 'GET', body } = req.body || {};

    if (!targetUrl || typeof targetUrl !== 'string') {
        return res.status(400).json({ error: 'Missing required field: targetUrl' });
    }

    // Validate URL
    try {
        new URL(targetUrl);
    } catch {
        return res.status(400).json({ error: 'Invalid targetUrl format' });
    }

    try {
        const fetchOptions: RequestInit = {
            method: method.toUpperCase(),
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
        };

        // Only attach body for methods that support it
        if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && body) {
            fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        const upstream = await fetch(targetUrl, fetchOptions);
        const contentType = upstream.headers.get('content-type') || '';

        // Stream text or JSON response back
        if (contentType.includes('application/json')) {
            const data = await upstream.json();
            return res.status(upstream.status).json(data);
        } else {
            const text = await upstream.text();
            return res.status(upstream.status).send(text);
        }
    } catch (err: any) {
        console.error('[Proxy] Upstream request failed:', err?.message || err);
        return res.status(502).json({
            error: 'Upstream request failed',
            detail: err?.message || 'Unknown error',
        });
    }
}
