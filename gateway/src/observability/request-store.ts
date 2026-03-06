import { mkdirSync } from 'fs';
import { appendFile } from 'fs/promises';
import path from 'path';
import type { RequestListQuery, RequestRecord, RequestStats } from './types.js';

interface RequestStoreOptions {
    enabled: boolean;
    maxRequests: number;
    logDir: string;
    persistJsonl: boolean;
}

export class RequestStore {
    private readonly records: RequestRecord[] = [];
    private readonly logFilePath: string;

    constructor(private readonly options: RequestStoreOptions) {
        this.logFilePath = path.join(this.options.logDir, 'requests.jsonl');

        if (this.options.enabled && this.options.persistJsonl) {
            mkdirSync(this.options.logDir, { recursive: true });
        }
    }

    add(record: RequestRecord): void {
        if (!this.options.enabled) return;

        this.records.unshift(record);
        if (this.records.length > this.options.maxRequests) {
            this.records.length = this.options.maxRequests;
        }

        if (this.options.persistJsonl) {
            void appendFile(this.logFilePath, JSON.stringify(record) + '\n', 'utf8').catch((error: unknown) => {
                console.warn('[Observability] 写入 requests.jsonl 失败:', error);
            });
        }
    }

    list(query: Partial<RequestListQuery> = {}): { total: number; items: RequestRecord[] } {
        const limit = normalizeLimit(query.limit ?? 100, this.options.maxRequests);
        const pathFilter = query.path?.trim().toLowerCase();
        const searchFilter = query.search?.trim().toLowerCase();

        const filtered = this.records.filter((record) => {
            if (pathFilter && !record.path.toLowerCase().includes(pathFilter)) return false;
            if (typeof query.status === 'number' && record.statusCode !== query.status) return false;
            if (query.provider && record.provider !== query.provider) return false;

            if (searchFilter) {
                const haystack = `${record.path} ${record.method} ${record.provider} ${record.model ?? ''} ${record.error ?? ''}`.toLowerCase();
                if (!haystack.includes(searchFilter)) return false;
            }

            return true;
        });

        return {
            total: filtered.length,
            items: filtered.slice(0, limit),
        };
    }

    stats(): RequestStats {
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        const totalRequests = this.records.length;
        const successCount = this.records.filter((record) => record.success).length;
        const failureCount = totalRequests - successCount;
        const recent24hRequests = this.records.filter((record) => Date.parse(record.timestamp) >= oneDayAgo).length;
        const averageDurationMs = totalRequests > 0
            ? round(this.records.reduce((sum, record) => sum + record.durationMs, 0) / totalRequests)
            : 0;

        const byPathMap = new Map<string, { count: number; totalDuration: number }>();
        for (const record of this.records) {
            const current = byPathMap.get(record.path) ?? { count: 0, totalDuration: 0 };
            current.count += 1;
            current.totalDuration += record.durationMs;
            byPathMap.set(record.path, current);
        }

        const byPath = [...byPathMap.entries()]
            .map(([routePath, value]) => ({
                path: routePath,
                count: value.count,
                averageDurationMs: round(value.totalDuration / value.count),
            }))
            .sort((left, right) => right.count - left.count)
            .slice(0, 10);

        const recentErrors = this.records
            .filter((record) => !record.success && record.error)
            .slice(0, 10)
            .map((record) => ({
                timestamp: record.timestamp,
                path: record.path,
                error: record.error ?? 'Unknown error',
                statusCode: record.statusCode,
            }));

        return {
            totalRequests,
            recent24hRequests,
            successCount,
            failureCount,
            successRate: totalRequests > 0 ? round((successCount / totalRequests) * 100) : 0,
            averageDurationMs,
            byPath,
            recentErrors,
        };
    }
}

function normalizeLimit(limit: number, max: number): number {
    if (!Number.isFinite(limit) || limit <= 0) return Math.min(100, max);
    return Math.min(limit, max);
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}
