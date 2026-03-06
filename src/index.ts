/**
 * Cursor2API v2 - 入口
 *
 * 将 Cursor 文档页免费 AI 接口代理为 Anthropic Messages API
 * 通过提示词注入让 Claude Code 拥有完整工具调用能力
 */

import 'dotenv/config';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createAdminRouter } from './admin/routes.js';
import { getConfig } from './config.js';
import { handleMessages, listModels, countTokens } from './handler.js';
import { handleOpenAIChatCompletions } from './openai-handler.js';
import { createObservabilityMiddleware } from './observability/middleware.js';
import { RequestStore } from './observability/request-store.js';

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
const adminUiDir = path.resolve(currentDir, '../admin-ui');

app.disable('x-powered-by');

// 解析 JSON body（增大限制以支持大型消息）
app.use(express.json({ limit: '10mb' }));

// CORS
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

// ==================== 路由 ====================

if (config.admin.enabled) {
    app.use(config.admin.path, createAdminRouter({
        config,
        store: requestStore,
        version: '2.0.0',
    }));

    if (existsSync(adminUiDir)) {
        app.get(config.admin.path, (_req, res) => {
            res.redirect(`${config.admin.path}/`);
        });
        app.use(config.admin.path, express.static(adminUiDir, { index: 'index.html' }));
    }
}

// Anthropic Messages API
app.post('/v1/messages', handleMessages);
app.post('/messages', handleMessages);

// OpenAI Chat Completions API（兼容）
app.post('/v1/chat/completions', handleOpenAIChatCompletions);
app.post('/chat/completions', handleOpenAIChatCompletions);

// Token 计数
app.post('/v1/messages/count_tokens', countTokens);
app.post('/messages/count_tokens', countTokens);

// OpenAI 兼容模型列表
app.get('/v1/models', listModels);

// 健康检查
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '2.0.0' });
});

// 根路径
app.get('/', (_req, res) => {
    res.json({
        name: 'cursor2api',
        version: '2.0.0',
        description: 'Cursor Docs AI → Anthropic & OpenAI API Proxy',
        endpoints: {
            anthropic_messages: 'POST /v1/messages',
            openai_chat: 'POST /v1/chat/completions',
            models: 'GET /v1/models',
            health: 'GET /health',
            admin_ui: config.admin.enabled ? `GET ${config.admin.path}` : 'disabled',
        },
        usage: {
            claude_code: 'export ANTHROPIC_BASE_URL=http://localhost:' + config.port,
            openai_compatible: 'OPENAI_BASE_URL=http://localhost:' + config.port + '/v1',
        },
        observability: {
            enabled: config.observability.enabled,
            max_requests: config.observability.maxRequests,
        },
    });
});

// ==================== 启动 ====================

app.listen(config.port, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║        Cursor2API v2.0.0             ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║  Server:  http://localhost:${config.port}      ║`);
    console.log('  ║  Model:   ' + config.cursorModel.padEnd(26) + '║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log('  ║  API Endpoints:                      ║');
    console.log('  ║  • Anthropic: /v1/messages            ║');
    console.log('  ║  • OpenAI:   /v1/chat/completions     ║');
    if (config.admin.enabled) console.log(`  ║  • Admin:    ${config.admin.path.padEnd(24)}║`);
    console.log('  ╠══════════════════════════════════════╣');
    console.log('  ║  Claude Code:                        ║');
    console.log(`  ║  export ANTHROPIC_BASE_URL=           ║`);
    console.log(`  ║    http://localhost:${config.port}              ║`);
    console.log('  ║  OpenAI 兼容:                        ║');
    console.log(`  ║  OPENAI_BASE_URL=                     ║`);
    console.log(`  ║    http://localhost:${config.port}/v1            ║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
});
