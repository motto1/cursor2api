import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import type { AppConfig } from './types.js';

let config: AppConfig;

function parseBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    }
    return fallback;
}

function parseNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
}

export function getConfig(): AppConfig {
    if (config) return config;

    // 默认配置
    config = {
        port: 3010,
        timeout: 120,
        cursorModel: 'anthropic/claude-sonnet-4.6',
        admin: {
            enabled: true,
            path: '/admin',
        },
        observability: {
            enabled: true,
            maxRequests: 500,
            logDir: './data',
            persistJsonl: true,
        },
        fingerprint: {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        },
    };

    // 从 config.yaml 加载
    if (existsSync('config.yaml')) {
        try {
            const raw = readFileSync('config.yaml', 'utf-8');
            const yaml = parseYaml(raw);
            if (yaml.port) config.port = yaml.port;
            if (yaml.timeout) config.timeout = yaml.timeout;
            if (yaml.proxy) config.proxy = yaml.proxy;
            if (yaml.cursor_model) config.cursorModel = yaml.cursor_model;
            if (yaml.admin) {
                config.admin.enabled = parseBoolean(yaml.admin.enabled, config.admin.enabled);
                if (typeof yaml.admin.path === 'string' && yaml.admin.path.trim()) {
                    config.admin.path = yaml.admin.path.trim();
                }
            }
            if (yaml.observability) {
                config.observability.enabled = parseBoolean(yaml.observability.enabled, config.observability.enabled);
                config.observability.maxRequests = parseNumber(yaml.observability.max_requests, config.observability.maxRequests);
                if (typeof yaml.observability.log_dir === 'string' && yaml.observability.log_dir.trim()) {
                    config.observability.logDir = yaml.observability.log_dir.trim();
                }
                config.observability.persistJsonl = parseBoolean(yaml.observability.persist_jsonl, config.observability.persistJsonl);
            }
            if (yaml.fingerprint) {
                if (yaml.fingerprint.user_agent) config.fingerprint.userAgent = yaml.fingerprint.user_agent;
            }
        } catch (e) {
            console.warn('[Config] 读取 config.yaml 失败:', e);
        }
    }

    // 环境变量覆盖
    if (process.env.PORT) config.port = parseInt(process.env.PORT);
    if (process.env.TIMEOUT) config.timeout = parseInt(process.env.TIMEOUT);
    if (process.env.PROXY) config.proxy = process.env.PROXY;
    if (process.env.CURSOR_MODEL) config.cursorModel = process.env.CURSOR_MODEL;
    if (process.env.ADMIN_ENABLED) config.admin.enabled = parseBoolean(process.env.ADMIN_ENABLED, config.admin.enabled);
    if (process.env.ADMIN_PATH?.trim()) config.admin.path = process.env.ADMIN_PATH.trim();
    if (process.env.OBS_ENABLED) config.observability.enabled = parseBoolean(process.env.OBS_ENABLED, config.observability.enabled);
    if (process.env.OBS_MAX_REQUESTS) config.observability.maxRequests = parseNumber(process.env.OBS_MAX_REQUESTS, config.observability.maxRequests);
    if (process.env.OBS_LOG_DIR?.trim()) config.observability.logDir = process.env.OBS_LOG_DIR.trim();
    if (process.env.OBS_PERSIST_JSONL) config.observability.persistJsonl = parseBoolean(process.env.OBS_PERSIST_JSONL, config.observability.persistJsonl);

    // 从 base64 FP 环境变量解析指纹
    if (process.env.FP) {
        try {
            const fp = JSON.parse(Buffer.from(process.env.FP, 'base64').toString());
            if (fp.userAgent) config.fingerprint.userAgent = fp.userAgent;
        } catch (e) {
            console.warn('[Config] 解析 FP 环境变量失败:', e);
        }
    }

    return config;
}
