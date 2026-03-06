import { randomUUID } from 'crypto';
import { Buffer } from 'buffer';
import type { Request, RequestHandler } from 'express';
import type { AppConfig } from '../types.js';
import { RequestStore } from './request-store.js';
import type { RequestProvider } from './types.js';

export function createObservabilityMiddleware(config: AppConfig, store: RequestStore): RequestHandler {
    return (req, res, next) => {
        const requestPath = getRequestPath(req);

        if (!config.observability.enabled || shouldIgnoreRequest(requestPath, config.admin.path)) {
            next();
            return;
        }

        const startedAt = Date.now();
        const requestId = randomUUID();
        let errorMessage: string | undefined;
        let finalized = false;

        res.setHeader('x-request-id', requestId);

        const originalJson = res.json.bind(res);
        res.json = ((body: unknown) => {
            errorMessage = errorMessage ?? inferErrorMessage(body);
            return originalJson(body);
        }) as typeof res.json;

        const originalWrite = res.write.bind(res);
        res.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
            const value = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
            errorMessage = errorMessage ?? inferSseErrorMessage(value);
            return originalWrite(chunk, ...(args as []));
        }) as typeof res.write;

        const finalize = (aborted: boolean): void => {
            if (finalized) return;
            finalized = true;

            const { provider, model, stream } = inferRequestMeta(req, requestPath);
            const statusCode = aborted && res.statusCode < 400 ? 499 : res.statusCode;
            const success = !aborted && statusCode < 400 && !errorMessage;

            store.add({
                id: requestId,
                timestamp: new Date().toISOString(),
                method: req.method,
                path: requestPath,
                statusCode,
                durationMs: Date.now() - startedAt,
                ip: req.ip || req.socket.remoteAddress || 'unknown',
                userAgent: req.get('user-agent') || '',
                provider,
                model,
                stream,
                success,
                error: errorMessage,
            });
        };

        res.on('finish', () => finalize(false));
        res.on('close', () => {
            if (!res.writableEnded) {
                finalize(true);
            }
        });

        next();
    };
}

function shouldIgnoreRequest(requestPath: string, adminPath: string): boolean {
    if (!requestPath.startsWith(adminPath)) return false;
    return !requestPath.startsWith(`${adminPath}/api`);
}

function inferRequestMeta(req: Request, requestPath: string): { provider: RequestProvider; model?: string; stream?: boolean } {
    const body = typeof req.body === 'object' && req.body !== null ? req.body as Record<string, unknown> : undefined;

    return {
        provider: inferProvider(requestPath),
        model: typeof body?.model === 'string' ? body.model : undefined,
        stream: typeof body?.stream === 'boolean' ? body.stream : undefined,
    };
}

function getRequestPath(req: Request): string {
    return req.originalUrl.split('?')[0] || req.url || req.path;
}

function inferProvider(requestPath: string): RequestProvider {
    if (requestPath.includes('/chat/completions')) return 'openai';
    if (requestPath.includes('/messages')) return 'anthropic';
    return 'internal';
}

function inferErrorMessage(body: unknown): string | undefined {
    if (!body || typeof body !== 'object') return undefined;

    const error = (body as { error?: unknown }).error;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message;
    }

    const message = (body as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
}

function inferSseErrorMessage(value: string): string | undefined {
    if (!value.includes('event: error')) return undefined;

    const matched = value.match(/data:\s*(\{.*\})/s);
    if (!matched) return 'SSE error';

    try {
        const payload = JSON.parse(matched[1]) as { error?: { message?: string } };
        return payload.error?.message || 'SSE error';
    } catch {
        return 'SSE error';
    }
}
