import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin, Connect } from 'vite';

// ============================================================
// LOCAL DEV PROXY — Mimics Vercel's api/gemini.ts serverless fn
// ============================================================
function geminiDevProxy(): Plugin {
    let geminiApiKey = '';

    return {
        name: 'gemini-dev-proxy',
        configResolved(config) {
            // Load API key from env — try both GEMINI_API_KEY and VITE_GEMINI_API_KEY
            geminiApiKey =
                (config.env as Record<string, string>)?.GEMINI_API_KEY ||
                (config.env as Record<string, string>)?.VITE_GEMINI_API_KEY ||
                process.env.GEMINI_API_KEY ||
                process.env.VITE_GEMINI_API_KEY ||
                '';

            if (geminiApiKey) {
                console.info('[GeminiProxy] ✅ API key loaded (local dev proxy active)');
            } else {
                console.warn('[GeminiProxy] ⚠️  No GEMINI_API_KEY found in .env — Gemini calls will fail');
            }
        },
        configureServer(server) {
            server.middlewares.use('/api/gemini', (async (
                req: Connect.IncomingMessage,
                res: any,
            ) => {
                // CORS
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

                if (req.method === 'OPTIONS') {
                    res.statusCode = 204;
                    return res.end();
                }

                if (req.method !== 'POST') {
                    res.statusCode = 405;
                    return res.end(JSON.stringify({ error: 'Method not allowed' }));
                }

                if (!geminiApiKey) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({
                        error: 'Server configuration error',
                        detail: 'GEMINI_API_KEY is not set. Create a .env file with GEMINI_API_KEY="your-key" or VITE_GEMINI_API_KEY="your-key".',
                    }));
                }

                // Read request body
                const chunks: Buffer[] = [];
                for await (const chunk of req) {
                    chunks.push(chunk as Buffer);
                }
                const bodyStr = Buffer.concat(chunks).toString('utf-8');
                let body: Record<string, any>;
                try {
                    body = JSON.parse(bodyStr);
                } catch {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                }

                const {
                    action = 'generate',
                    model = 'gemini-2.5-flash',
                    temperature,
                    prompt,
                    tools,
                } = body;

                if (!prompt || typeof prompt !== 'string') {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: 'Missing required field: prompt' }));
                }

                const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
                const requestBody: Record<string, unknown> = {
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                };
                if (temperature !== undefined) {
                    requestBody.generationConfig = { temperature: Number(temperature) };
                }
                if (tools && Array.isArray(tools)) {
                    requestBody.tools = tools;
                }

                try {
                    if (action === 'stream') {
                        const url = `${GOOGLE_API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${geminiApiKey}`;
                        const upstream = await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(requestBody),
                        });

                        if (!upstream.ok) {
                            const errorText = await upstream.text();
                            console.error(`[GeminiProxy] Upstream stream error ${upstream.status}:`, errorText);
                            res.statusCode = upstream.status;
                            res.setHeader('Content-Type', 'application/json');
                            return res.end(JSON.stringify({ error: 'Gemini API error', detail: errorText }));
                        }

                        res.setHeader('Content-Type', 'text/event-stream');
                        res.setHeader('Cache-Control', 'no-cache');
                        res.setHeader('Connection', 'keep-alive');

                        const reader = upstream.body?.getReader();
                        if (!reader) {
                            res.statusCode = 502;
                            return res.end(JSON.stringify({ error: 'No response body' }));
                        }

                        const decoder = new TextDecoder();
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                res.write(decoder.decode(value, { stream: true }));
                            }
                        } finally {
                            reader.releaseLock();
                        }
                        return res.end();
                    } else {
                        const url = `${GOOGLE_API_BASE}/models/${model}:generateContent?key=${geminiApiKey}`;
                        const upstream = await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(requestBody),
                        });

                        if (!upstream.ok) {
                            const errorText = await upstream.text();
                            console.error(`[GeminiProxy] Upstream error ${upstream.status}:`, errorText);
                            res.statusCode = upstream.status;
                            res.setHeader('Content-Type', 'application/json');
                            return res.end(JSON.stringify({ error: 'Gemini API error', detail: errorText }));
                        }

                        const data = await upstream.json();
                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'application/json');
                        return res.end(JSON.stringify(data));
                    }
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Unknown error';
                    console.error('[GeminiProxy] Request failed:', message);
                    res.statusCode = 502;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ error: 'Gemini proxy request failed', detail: message }));
                }
            }) as Connect.NextHandleFunction);
        },
    };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
        plugins: [react(), tailwindcss(), geminiDevProxy(), rssDevProxy()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            },
        },
        server: {
            hmr: process.env.DISABLE_HMR !== 'true',
        },
    };
});

// ============================================================
// LOCAL DEV PROXY — Mimics api/rss.ts serverless fn
// ============================================================
function rssDevProxy(): Plugin {
    return {
        name: 'rss-dev-proxy',
        configureServer(server) {
            server.middlewares.use('/api/rss', (async (
                req: Connect.IncomingMessage,
                res: any,
            ) => {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

                // Parse query string
                const url = new URL(req.url || '/', `http://${req.headers.host}`);
                const feedsParam = url.searchParams.get('feeds') || '';
                const category = url.searchParams.get('category') || 'news';

                if (!feedsParam) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ error: 'Missing ?feeds= parameter' }));
                }

                const feedUrls = feedsParam.split(',').map(u => decodeURIComponent(u.trim())).filter(Boolean);

                const allItems: any[] = [];
                for (const feedUrl of feedUrls) {
                    try {
                        const resp = await fetch(feedUrl, {
                            signal: AbortSignal.timeout(8000),
                            headers: { 'User-Agent': 'SIDECAR-RSS/1.0' },
                        });
                        if (!resp.ok) continue;
                        const xml = await resp.text();
                        // Basic XML item extraction
                        const itemRegex = /<item[\s>]([\s\S]*?)<\/item>|<entry[\s>]([\s\S]*?)<\/entry>/gi;
                        let match;
                        while ((match = itemRegex.exec(xml)) !== null && allItems.length < 50) {
                            const block = match[1] || match[2];
                            const titleMatch = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
                            const linkMatch = block.match(/<link[^>]*(?:href=["'](.*?)["'])?[^>]*>(.*?)<\/link>/i)
                                || block.match(/<link[^>]*href=["'](.*?)["'][^>]*\/?>/i);
                            const descMatch = block.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)
                                || block.match(/<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i);
                            const dateMatch = block.match(/<pubDate[^>]*>(.*?)<\/pubDate>/i)
                                || block.match(/<published[^>]*>(.*?)<\/published>/i);

                            const rawTitle = titleMatch?.[1]?.trim() || '';
                            if (!rawTitle) continue;
                            const title = rawTitle.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                            const link = linkMatch ? (linkMatch[1] || linkMatch[2] || '').trim() : '';
                            const rawDesc = descMatch?.[1] || '';
                            const imgMatch = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
                            const description = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);

                            // Google News title format: "Title - Source"
                            let source = new URL(feedUrl).hostname;
                            let cleanTitle = title;
                            const dashIdx = title.lastIndexOf(' - ');
                            if (dashIdx > 0 && dashIdx > title.length - 60) {
                                source = title.slice(dashIdx + 3).trim() || source;
                                cleanTitle = title.slice(0, dashIdx).trim();
                            }

                            allItems.push({
                                title: cleanTitle,
                                link,
                                description,
                                pubDate: dateMatch?.[1]?.trim() || new Date().toISOString(),
                                source,
                                thumbnailUrl: imgMatch?.[1]?.includes('1x1') ? undefined : imgMatch?.[1],
                            });
                        }
                    } catch { /* skip failed feeds */ }
                }

                allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
                return res.end(JSON.stringify({
                    items: allItems.slice(0, 50),
                    category,
                    fetchedAt: new Date().toISOString(),
                    feedCount: feedUrls.length,
                    totalItems: allItems.length,
                }));
            }) as Connect.NextHandleFunction);
        },
    };
}
