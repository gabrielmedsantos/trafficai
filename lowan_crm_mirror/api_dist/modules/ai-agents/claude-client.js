"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callClaude = callClaude;

/**
 * Cliente leve da API Anthropic Claude — usa fetch nativo, sem SDK.
 * Docs: https://docs.claude.com/en/api/messages
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const MODEL_MAP = {
    'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
    'claude-sonnet-4-6': 'claude-sonnet-4-6',
    'claude-opus-4-7': 'claude-opus-4-7',
};

function resolveModel(short) {
    return MODEL_MAP[short] || short;
}

/**
 * @param {Object} params
 * @param {string} params.apiKey       - Anthropic API key (decrypted)
 * @param {string} params.model        - claude-haiku-4-5 | claude-sonnet-4-6 | claude-opus-4-7
 * @param {string} params.systemPrompt - prompt do sistema (instruções do agente)
 * @param {Array<{role:'user'|'assistant', content:string}>} params.messages
 * @param {number} [params.maxTokens=1024]
 * @param {number} [params.temperature=0.7]
 * @returns {Promise<{text:string, usage:{input_tokens:number,output_tokens:number}, latencyMs:number, model:string}>}
 */
async function callClaude({ apiKey, model, systemPrompt, messages, maxTokens = 1024, temperature = 0.7 }) {
    if (!apiKey) throw new Error('Anthropic API key não configurada para este workspace');
    if (!Array.isArray(messages) || messages.length === 0) throw new Error('Mensagens vazias');

    const startedAt = Date.now();
    const resolvedModel = resolveModel(model || 'claude-haiku-4-5');

    const body = {
        model: resolvedModel,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt || 'Você é um assistente útil.',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
    };

    let response;
    try {
        response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': ANTHROPIC_VERSION,
            },
            body: JSON.stringify(body),
        });
    } catch (e) {
        throw new Error(`Falha ao conectar com Anthropic: ${e.message}`);
    }

    const latencyMs = Date.now() - startedAt;
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
        const errMsg = json?.error?.message || `HTTP ${response.status}`;
        throw new Error(`Anthropic API erro: ${errMsg}`);
    }

    const text = (json.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim();

    return {
        text,
        usage: json.usage || { input_tokens: 0, output_tokens: 0 },
        latencyMs,
        model: resolvedModel,
        stopReason: json.stop_reason || null,
    };
}
