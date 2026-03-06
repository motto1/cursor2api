import { Readable } from 'stream';
import type { Request, Response } from 'express';

const REQUEST_HEADERS_TO_SKIP = new Set([
    'host',
    'content-length',
    'connection',
]);

const RESPONSE_HEADERS_TO_SKIP = new Set([
    'connection',
    'content-length',
    'transfer-encoding',
]);

export async function proxyRequest(req: Request, res: Response, upstreamBaseUrl: string): Promise<void> {
    const targetUrl = new URL(req.originalUrl, ensureTrailingSlash(upstreamBaseUrl));
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
        if (!value || REQUEST_HEADERS_TO_SKIP.has(key.toLowerCase())) continue;

        if (Array.isArray(value)) {
            headers.set(key, value.join(', '));
        } else {
            headers.set(key, value);
        }
    }

    const method = req.method.toUpperCase();
    const body = createRequestBody(req, method, headers);

    const upstreamResponse = await fetch(targetUrl, {
        method,
        headers,
        body,
        redirect: 'manual',
    });

    res.status(upstreamResponse.status);
    upstreamResponse.headers.forEach((value, key) => {
        if (RESPONSE_HEADERS_TO_SKIP.has(key.toLowerCase())) return;
        res.setHeader(key, value);
    });

    const contentType = upstreamResponse.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
        if (!upstreamResponse.body) {
            res.end();
            return;
        }

        const stream = Readable.fromWeb(upstreamResponse.body as any);
        stream.on('error', () => res.end());
        stream.pipe(res);
        return;
    }

    const text = await upstreamResponse.text();
    res.send(text);
}

function createRequestBody(req: Request, method: string, headers: Headers): string | undefined {
    if (method === 'GET' || method === 'HEAD') return undefined;
    if (!req.body || Object.keys(req.body as object).length === 0) return undefined;

    if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
    }

    return JSON.stringify(req.body);
}

function ensureTrailingSlash(baseUrl: string): string {
    return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}
