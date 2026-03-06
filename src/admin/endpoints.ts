import type { EndpointDescriptor } from '../observability/types.js';

export function buildEndpointCatalog(adminPath: string): EndpointDescriptor[] {
    return [
        { name: 'anthropic_messages', category: 'proxy', method: 'POST', path: '/v1/messages', description: 'Anthropic Messages API 兼容入口', source: 'admin-api' },
        { name: 'messages', category: 'proxy', method: 'POST', path: '/messages', description: 'Anthropic Messages API 简写入口', source: 'admin-api' },
        { name: 'openai_chat', category: 'proxy', method: 'POST', path: '/v1/chat/completions', description: 'OpenAI Chat Completions 兼容入口', source: 'admin-api' },
        { name: 'chat_completions', category: 'proxy', method: 'POST', path: '/chat/completions', description: 'OpenAI Chat Completions 简写入口', source: 'admin-api' },
        { name: 'count_tokens', category: 'proxy', method: 'POST', path: '/v1/messages/count_tokens', description: 'Token 计数接口', source: 'admin-api' },
        { name: 'count_tokens_short', category: 'proxy', method: 'POST', path: '/messages/count_tokens', description: 'Token 计数简写接口', source: 'admin-api' },
        { name: 'models', category: 'system', method: 'GET', path: '/v1/models', description: 'OpenAI 兼容模型列表', source: 'admin-api' },
        { name: 'health', category: 'system', method: 'GET', path: '/health', description: '健康检查', source: 'admin-api' },
        { name: 'root', category: 'system', method: 'GET', path: '/', description: '服务说明与入口信息', source: 'admin-api' },
        { name: 'admin_health', category: 'admin', method: 'GET', path: `${adminPath}/api/health`, description: '管理接口健康检查', source: 'admin-api' },
        { name: 'admin_endpoints', category: 'admin', method: 'GET', path: `${adminPath}/api/endpoints`, description: '接口清单', source: 'admin-api' },
        { name: 'admin_requests', category: 'admin', method: 'GET', path: `${adminPath}/api/requests`, description: '最近请求记录', source: 'admin-api' },
        { name: 'admin_stats', category: 'admin', method: 'GET', path: `${adminPath}/api/stats`, description: '请求聚合统计', source: 'admin-api' },
    ];
}
