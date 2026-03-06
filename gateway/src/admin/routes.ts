import { Router } from 'express';
import type { GatewayConfig } from '../types.js';
import { RequestStore } from '../observability/request-store.js';
import { buildEndpointCatalog } from './endpoints.js';

interface AdminRouterOptions {
    config: GatewayConfig;
    store: RequestStore;
    version: string;
}

export function createAdminRouter({ config, store, version }: AdminRouterOptions): Router {
    const router = Router();

    router.get('/api/health', async (_req, res) => {
        const upstream = await fetchUpstreamSnapshot(config.upstreamBaseUrl);
        res.json({
            status: 'ok',
            version,
            adminPath: config.adminPath,
            upstream,
        });
    });

    router.get('/api/endpoints', (_req, res) => {
        res.json({ items: buildEndpointCatalog(config.adminPath) });
    });

    router.get('/api/requests', (req, res) => {
        const status = req.query.status ? Number(req.query.status) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
        const path = typeof req.query.path === 'string' ? req.query.path : undefined;
        const search = typeof req.query.search === 'string' ? req.query.search : undefined;
        const result = store.list({
            limit,
            path,
            status: Number.isFinite(status) ? status : undefined,
            provider: provider === 'anthropic' || provider === 'openai' || provider === 'internal' ? provider : undefined,
            search,
        });

        res.json({
            total: result.total,
            items: result.items.map((item) => ({
                id: item.id,
                timestamp: item.timestamp,
                method: item.method,
                path: item.path,
                status: item.statusCode,
                latencyMs: item.durationMs,
                model: item.model,
                clientIp: item.ip,
                stream: item.stream,
                error: item.error,
                provider: item.provider,
            })),
        });
    });

    router.get('/api/stats', (_req, res) => {
        const stats = store.stats();
        res.json({
            totalRequests: stats.totalRequests,
            requests24h: stats.recent24hRequests,
            successRate: `${stats.successRate}%`,
            avgLatencyMs: stats.averageDurationMs,
            latestError: stats.recentErrors[0]?.error ?? '暂无错误',
            healthStatus: 'ok',
            version,
            endpointCount: buildEndpointCatalog(config.adminPath).length,
            successCount: stats.successCount,
            failureCount: stats.failureCount,
            byPath: stats.byPath,
            recentErrors: stats.recentErrors,
        });
    });

    return router;
}

async function fetchUpstreamSnapshot(upstreamBaseUrl: string): Promise<{ status: string; version?: string }> {
    try {
        const response = await fetch(new URL('/health', ensureTrailingSlash(upstreamBaseUrl)));
        if (!response.ok) {
            return { status: `error:${response.status}` };
        }

        const payload = await response.json() as { status?: string; version?: string };
        return {
            status: payload.status || 'ok',
            version: payload.version,
        };
    } catch {
        return { status: 'unreachable' };
    }
}

function ensureTrailingSlash(baseUrl: string): string {
    return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}
