export type RequestProvider = 'anthropic' | 'openai' | 'internal';

export interface RequestRecord {
    id: string;
    timestamp: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    ip: string;
    userAgent: string;
    provider: RequestProvider;
    model?: string;
    stream?: boolean;
    success: boolean;
    error?: string;
}

export interface EndpointDescriptor {
    name: string;
    category: 'proxy' | 'system' | 'admin';
    method: 'GET' | 'POST';
    path: string;
    description: string;
    source: 'admin-api';
}

export interface RequestListQuery {
    limit: number;
    path?: string;
    status?: number;
    provider?: RequestProvider;
    search?: string;
}

export interface RequestStats {
    totalRequests: number;
    recent24hRequests: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    averageDurationMs: number;
    byPath: Array<{
        path: string;
        count: number;
        averageDurationMs: number;
    }>;
    recentErrors: Array<{
        timestamp: string;
        path: string;
        error: string;
        statusCode: number;
    }>;
}
