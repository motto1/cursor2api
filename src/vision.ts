import { getConfig } from './config.js';
import type { AnthropicMessage, AnthropicContentBlock, VisionProvider } from './types.js';
import { getProxyFetchOptions } from './proxy-agent.js';
import { createWorker } from 'tesseract.js';
import crypto from 'crypto';

// Global cache for image parsing results
// Key: SHA-256 hash of the image data string, Value: Extracted text
const imageParsingCache = new Map<string, string>();
const MAX_CACHE_SIZE = 100;

function setCache(hash: string, text: string) {
    if (imageParsingCache.size >= MAX_CACHE_SIZE) {
        // Evict oldest entry (Map preserves insertion order)
        const firstKey = imageParsingCache.keys().next().value;
        if (firstKey) {
            imageParsingCache.delete(firstKey);
        }
    }
    imageParsingCache.set(hash, text);
}

function getImageHash(imageSource: string): string {
    return crypto.createHash('sha256').update(imageSource).digest('hex');
}

export async function applyVisionInterceptor(messages: AnthropicMessage[]): Promise<void> {
    const config = getConfig();
    if (!config.vision?.enabled) return;

    for (const msg of messages) {
        if (!Array.isArray(msg.content)) continue;

        let hasImages = false;
        const newContent: AnthropicContentBlock[] = [];
        const imagesToAnalyze: AnthropicContentBlock[] = [];

        for (const block of msg.content) {
            if (block.type === 'image') {
                hasImages = true;
                imagesToAnalyze.push(block);
            } else {
                newContent.push(block);
            }
        }

        if (hasImages && imagesToAnalyze.length > 0) {
            try {
                let descriptions = '';
                if (config.vision.mode === 'ocr') {
                    console.log(`[Vision] 启用纯本地 OCR 模式，正在处理 ${imagesToAnalyze.length} 张图片... (无需 API Key)`);
                    descriptions = await processWithLocalOCR(imagesToAnalyze);
                } else {
                    // API mode: try providers in order with fallback
                    descriptions = await processWithAPIFallback(imagesToAnalyze);
                }

                // Add descriptions as a simulated system text block
                newContent.push({
                    type: 'text',
                    text: `\n\n[System: The user attached ${imagesToAnalyze.length} image(s). Visual analysis/OCR extracted the following context:\n${descriptions}]\n\n`
                });

                msg.content = newContent;
            } catch (e) {
                console.error("[Vision API Error]", e);
                newContent.push({
                    type: 'text',
                    text: `\n\n[System: The user attached image(s), but the Vision interceptor failed to process them. Error: ${(e as Error).message}]\n\n`
                });
                msg.content = newContent;
            }
        }
    }
}

/**
 * Try each API provider in order. If all fail and fallbackToOcr is enabled,
 * fall back to local OCR as the last resort.
 */
async function processWithAPIFallback(imagesToAnalyze: AnthropicContentBlock[]): Promise<string> {
    const visionConfig = getConfig().vision!;
    const providers = visionConfig.providers;
    const errors: string[] = [];

    // If we have providers, try them in order
    if (providers.length > 0) {
        for (let i = 0; i < providers.length; i++) {
            const provider = providers[i];
            const providerLabel = provider.name || `Provider #${i + 1} (${provider.model})`;
            try {
                console.log(`[Vision] 尝试 API ${providerLabel}，正在处理 ${imagesToAnalyze.length} 张图片...`);
                const result = await callVisionAPIWithProvider(imagesToAnalyze, provider);
                console.log(`[Vision] ✅ ${providerLabel} 处理成功`);
                return result;
            } catch (err) {
                const errMsg = (err as Error).message;
                console.warn(`[Vision] ❌ ${providerLabel} 失败: ${errMsg}`);
                errors.push(`${providerLabel}: ${errMsg}`);
                // Continue to next provider
            }
        }
    } else if (visionConfig.baseUrl && visionConfig.apiKey) {
        // Legacy fallback: single provider from top-level fields
        const legacyProvider: VisionProvider = {
            name: 'default',
            baseUrl: visionConfig.baseUrl,
            apiKey: visionConfig.apiKey,
            model: visionConfig.model,
        };
        try {
            console.log(`[Vision] 启用外部 API 模式，正在处理 ${imagesToAnalyze.length} 张图片...`);
            const result = await callVisionAPIWithProvider(imagesToAnalyze, legacyProvider);
            return result;
        } catch (err) {
            const errMsg = (err as Error).message;
            console.warn(`[Vision] ❌ API 调用失败: ${errMsg}`);
            errors.push(`default: ${errMsg}`);
        }
    }

    // All API providers failed — try OCR fallback
    if (visionConfig.fallbackToOcr) {
        console.log(`[Vision] 所有 API 均失败 (${errors.length} 个错误)，兜底使用本地 OCR...`);
        try {
            return await processWithLocalOCR(imagesToAnalyze);
        } catch (ocrErr) {
            throw new Error(
                `All ${errors.length} API provider(s) failed AND local OCR fallback also failed. ` +
                `API errors: [${errors.join(' | ')}]. OCR error: ${(ocrErr as Error).message}`
            );
        }
    }

    // fallbackToOcr is disabled and all providers failed
    throw new Error(
        `All ${errors.length} API provider(s) failed and fallback_to_ocr is disabled. ` +
        `Errors: [${errors.join(' | ')}]`
    );
}

async function processWithLocalOCR(imageBlocks: AnthropicContentBlock[]): Promise<string> {
    let combinedText = '';
    const imagesToProcess: { index: number, source: string, hash: string }[] = [];

    // Check cache first
    for (let i = 0; i < imageBlocks.length; i++) {
        const img = imageBlocks[i];
        let imageSource: string = '';

        if (img.type === 'image' && img.source?.data) {
            if (img.source.type === 'base64') {
                const mime = img.source.media_type || 'image/jpeg';
                imageSource = `data:${mime};base64,${img.source.data}`;
            } else if (img.source.type === 'url') {
                imageSource = img.source.data;
            }
        }

        if (imageSource) {
            const hash = getImageHash(imageSource);
            if (imageParsingCache.has(hash)) {
                console.log(`[Vision] Image ${i + 1} found in cache, skipping OCR.`);
                combinedText += `--- Image ${i + 1} OCR Text ---\n${imageParsingCache.get(hash)}\n\n`;
            } else {
                imagesToProcess.push({ index: i, source: imageSource, hash });
            }
        }
    }

    if (imagesToProcess.length > 0) {
        const worker = await createWorker('eng+chi_sim');
        
        for (const { index, source, hash } of imagesToProcess) {
            try {
                const { data: { text } } = await worker.recognize(source);
                const extractedText = text.trim() || '(No text detected in this image)';
                setCache(hash, extractedText);
                combinedText += `--- Image ${index + 1} OCR Text ---\n${extractedText}\n\n`;
            } catch (err) {
                console.error(`[Vision OCR] Failed to parse image ${index + 1}:`, err);
                combinedText += `--- Image ${index + 1} ---\n(Failed to parse image with local OCR)\n\n`;
            }
        }
        await worker.terminate();
    }

    return combinedText;
}

/**
 * Call a specific Vision API provider for image analysis.
 * Processes images individually for per-image caching.
 * Throws on failure so the caller can try the next provider.
 */
async function callVisionAPIWithProvider(imageBlocks: AnthropicContentBlock[], provider: VisionProvider): Promise<string> {
    let combinedText = '';
    let hasAnyFailure = false;
    
    for (let i = 0; i < imageBlocks.length; i++) {
        const img = imageBlocks[i];
        let url = '';
        
        if (img.type === 'image' && img.source?.data) {
            if (img.source.type === 'base64') {
                const mime = img.source.media_type || 'image/jpeg';
                url = `data:${mime};base64,${img.source.data}`;
            } else if (img.source.type === 'url') {
                url = img.source.data;
            }
        }

        if (url) {
            const hash = getImageHash(url);
            if (imageParsingCache.has(hash)) {
                console.log(`[Vision] Image ${i + 1} found in cache, skipping API call.`);
                combinedText += `--- Image ${i + 1} Description ---\n${imageParsingCache.get(hash)}\n\n`;
                continue;
            }

            const parts = [
                { type: 'text', text: 'Please describe this image in detail. If it contains code, UI elements, or error messages, explicitly write them out.' },
                { type: 'image_url', image_url: { url } }
            ];

            const payload = {
                model: provider.model,
                messages: [{ role: 'user', content: parts }],
                max_tokens: 1500
            };

            const res = await fetch(provider.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${provider.apiKey}`
                },
                body: JSON.stringify(payload),
                ...getProxyFetchOptions(),
            } as any);

            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`API returned status ${res.status}: ${errBody}`);
            }

            const data = await res.json() as any;
            const description = data.choices?.[0]?.message?.content || 'No description returned.';
            
            setCache(hash, description);
            combinedText += `--- Image ${i + 1} Description ---\n${description}\n\n`;
        }
    }

    return combinedText;
}
