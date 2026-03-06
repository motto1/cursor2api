import type { GatewayConfig } from './types.js';

let config: GatewayConfig;

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (!value) return fallback;

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

function parseNumber(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function getConfig(): GatewayConfig {
    if (config) return config;

    config = {
        port: parseNumber(process.env.PORT, 3010),
        upstreamBaseUrl: process.env.UPSTREAM_BASE_URL?.trim() || 'http://127.0.0.1:3011',
        adminPath: process.env.ADMIN_PATH?.trim() || '/admin',
        observability: {
            enabled: parseBoolean(process.env.OBS_ENABLED, true),
            maxRequests: parseNumber(process.env.OBS_MAX_REQUESTS, 500),
            logDir: process.env.OBS_LOG_DIR?.trim() || './data',
            persistJsonl: parseBoolean(process.env.OBS_PERSIST_JSONL, true),
        },
    };

    return config;
}
