export interface GatewayConfig {
    port: number;
    upstreamBaseUrl: string;
    adminPath: string;
    observability: {
        enabled: boolean;
        maxRequests: number;
        logDir: string;
        persistJsonl: boolean;
    };
}
