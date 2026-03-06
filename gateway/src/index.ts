import express from 'express';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { getConfig } from './config.js';
import { createAdminRouter } from './admin/routes.js';
import { createObservabilityMiddleware } from './observability/middleware.js';
import { RequestStore } from './observability/request-store.js';
import { proxyRequest } from './proxy.js';

const app = express();
const config = getConfig();
const requestStore = new RequestStore({
    enabled: config.observability.enabled,
    maxRequests: config.observability.maxRequests,
    logDir: config.observability.logDir,
    persistJsonl: config.observability.persistJsonl,
});
const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const publicDir = path.resolve(currentDir, '../public');

app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));

app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    if (_req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    next();
});

app.use(createObservabilityMiddleware(config, requestStore));
app.use(config.adminPath, createAdminRouter({
    config,
    store: requestStore,
    version: '1.0.0',
}));

if (existsSync(publicDir)) {
    app.get(config.adminPath, (_req, res) => {
        res.redirect(`${config.adminPath}/`);
    });
    app.use(config.adminPath, express.static(publicDir, { index: 'index.html' }));
}

app.use(async (req, res) => {
    try {
        await proxyRequest(req, res, config.upstreamBaseUrl);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(502).json({
            error: {
                type: 'upstream_proxy_error',
                message,
            },
        });
    }
});

app.listen(config.port, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║   Cursor2API Admin Gateway v1.0.0   ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║  Server:   http://localhost:${config.port}      ║`);
    console.log(`  ║  Upstream: ${config.upstreamBaseUrl.padEnd(28)}║`);
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║  Admin UI: ${config.adminPath.padEnd(28)}║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
});
