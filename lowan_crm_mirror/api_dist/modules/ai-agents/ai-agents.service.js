"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiAgentsService = void 0;

const database_1 = require("../../config/database");
const redis_1 = require("../../config/redis");
const token_encryption_1 = require("../../services/crypto/token.encryption");
const claude_client_1 = require("./claude-client");

const VALID_MODES = ['auto', 'suggested'];
const VALID_STATUS = ['active', 'inactive'];
const VALID_ATTENDANCE = ['client', 'internal', 'both'];
const VALID_TONES = ['formal', 'friendly', 'technical', 'custom'];
const VALID_MODELS = ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'];

// Map de timers do debounce inteligente — uma entrada por leadId em fila.
// In-process (não persiste em restart). Single-worker é suficiente; pra escalar
// horizontalmente, trocar por BullMQ delayed jobs com Redis.
const _debounceTimers = new Map();

function rowToAgent(row) {
    if (!row) return null;
    return {
        id: row.id,
        workspaceId: row.workspace_id,
        name: row.name,
        description: row.description,
        status: row.status,
        attendanceType: row.attendance_type,
        channels: row.channels || ['whatsapp'],
        systemPrompt: row.system_prompt,
        tone: row.tone,
        maxWords: row.max_words,
        guidelines: row.guidelines,
        model: row.model,
        temperature: row.temperature ? parseFloat(row.temperature) : 0.7,
        mode: row.mode,
        triggerConfig: row.trigger_config || {},
        fallbackAction: row.fallback_action,
        fallbackMessage: row.fallback_message,
        stageFilterIds: row.stage_filter_ids || [],
        tagFilter: row.tag_filter || [],
        contextMessagesLimit: row.context_messages_limit || 30,
        totalRuns: Number(row.total_runs || 0),
        totalTokens: Number(row.total_tokens || 0),
        createdById: row.created_by_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

class AiAgentsService {

    async list(workspaceId) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT * FROM ai_agents WHERE workspace_id = $1::uuid ORDER BY created_at DESC`,
            workspaceId);
        return rows.map(rowToAgent);
    }

    async get(workspaceId, id) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT * FROM ai_agents WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
            id, workspaceId);
        return rowToAgent(rows[0]);
    }

    async create(workspaceId, userId, input) {
        if (!input?.name?.trim()) throw new Error('Nome obrigatório');
        if (!input?.systemPrompt?.trim()) throw new Error('System prompt obrigatório');

        const status = VALID_STATUS.includes(input.status) ? input.status : 'inactive';
        const attendance = VALID_ATTENDANCE.includes(input.attendanceType) ? input.attendanceType : 'client';
        const tone = VALID_TONES.includes(input.tone) ? input.tone : 'friendly';
        const model = VALID_MODELS.includes(input.model) ? input.model : 'claude-haiku-4-5';
        const mode = VALID_MODES.includes(input.mode) ? input.mode : 'suggested';
        const channels = Array.isArray(input.channels) && input.channels.length ? input.channels : ['whatsapp'];

        const rows = await database_1.prisma.$queryRawUnsafe(
            `INSERT INTO ai_agents (
                workspace_id, name, description, status, attendance_type, channels,
                system_prompt, tone, max_words, guidelines, model, temperature, mode,
                trigger_config, fallback_action, fallback_message,
                stage_filter_ids, tag_filter, context_messages_limit, created_by_id
            ) VALUES (
                $1::uuid, $2, $3, $4, $5, $6::jsonb,
                $7, $8, $9, $10, $11, $12::numeric, $13,
                $14::jsonb, $15, $16, $17::jsonb, $18::jsonb, $19, $20::uuid
            ) RETURNING *`,
            workspaceId,
            input.name.trim(),
            input.description || null,
            status,
            attendance,
            JSON.stringify(channels),
            input.systemPrompt.trim(),
            tone,
            Number.isInteger(input.maxWords) ? input.maxWords : 150,
            input.guidelines || null,
            model,
            typeof input.temperature === 'number' ? Math.max(0, Math.min(1, input.temperature)) : 0.7,
            mode,
            JSON.stringify(input.triggerConfig || {}),
            input.fallbackAction || 'forward_human',
            input.fallbackMessage || null,
            JSON.stringify(input.stageFilterIds || []),
            JSON.stringify(input.tagFilter || []),
            Number.isInteger(input.contextMessagesLimit) ? input.contextMessagesLimit : 30,
            userId || null
        );
        return rowToAgent(rows[0]);
    }

    async update(workspaceId, id, input) {
        const existing = await this.get(workspaceId, id);
        if (!existing) throw new Error('Agente não encontrado');

        const fields = [];
        const values = [];
        let p = 1;
        const set = (col, val, cast = '') => { fields.push(`${col} = $${p}${cast}`); values.push(val); p++; };

        if (typeof input.name === 'string') set('name', input.name.trim());
        if (typeof input.description === 'string') set('description', input.description);
        if (VALID_STATUS.includes(input.status)) set('status', input.status);
        if (VALID_ATTENDANCE.includes(input.attendanceType)) set('attendance_type', input.attendanceType);
        if (Array.isArray(input.channels)) set('channels', JSON.stringify(input.channels), '::jsonb');
        if (typeof input.systemPrompt === 'string') set('system_prompt', input.systemPrompt);
        if (VALID_TONES.includes(input.tone)) set('tone', input.tone);
        if (Number.isInteger(input.maxWords)) set('max_words', input.maxWords);
        if (typeof input.guidelines === 'string') set('guidelines', input.guidelines);
        if (VALID_MODELS.includes(input.model)) set('model', input.model);
        if (typeof input.temperature === 'number') set('temperature', Math.max(0, Math.min(1, input.temperature)), '::numeric');
        if (VALID_MODES.includes(input.mode)) set('mode', input.mode);
        if (input.triggerConfig && typeof input.triggerConfig === 'object') set('trigger_config', JSON.stringify(input.triggerConfig), '::jsonb');
        if (typeof input.fallbackAction === 'string') set('fallback_action', input.fallbackAction);
        if (typeof input.fallbackMessage === 'string') set('fallback_message', input.fallbackMessage);
        if (Array.isArray(input.stageFilterIds)) set('stage_filter_ids', JSON.stringify(input.stageFilterIds), '::jsonb');
        if (Array.isArray(input.tagFilter)) set('tag_filter', JSON.stringify(input.tagFilter), '::jsonb');
        if (Number.isInteger(input.contextMessagesLimit)) set('context_messages_limit', input.contextMessagesLimit);

        if (!fields.length) return existing;

        // Detecta mudança de config followups pra reagendar pendings
        const oldFollowups = JSON.stringify(existing.triggerConfig?.followups || null);
        const newFollowups = input.triggerConfig?.followups
            ? JSON.stringify(input.triggerConfig.followups) : null;
        const followupsChanged = newFollowups && oldFollowups !== newFollowups;

        fields.push(`updated_at = now()`);
        values.push(id);
        values.push(workspaceId);

        const sql = `UPDATE ai_agents SET ${fields.join(', ')}
                     WHERE id = $${p}::uuid AND workspace_id = $${p+1}::uuid
                     RETURNING *`;
        const rows = await database_1.prisma.$queryRawUnsafe(sql, ...values);

        // Se mudou config followups, reagenda todos os pendings
        if (followupsChanged) {
            this._rescheduleFollowupsForAllLeads(workspaceId, id).catch(() => {});
        }

        return rowToAgent(rows[0]);
    }

    async delete(workspaceId, id) {
        await database_1.prisma.$queryRawUnsafe(
            `DELETE FROM ai_agents WHERE id = $1::uuid AND workspace_id = $2::uuid`,
            id, workspaceId);
        return { ok: true };
    }

    async toggle(workspaceId, id) {
        const existing = await this.get(workspaceId, id);
        if (!existing) throw new Error('Agente não encontrado');
        const newStatus = existing.status === 'active' ? 'inactive' : 'active';
        return await this.update(workspaceId, id, { status: newStatus });
    }

    // ── Anthropic API key (per workspace) ────────────────────────────────────
    async getApiKey(workspaceId) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT anthropic_api_key_enc FROM workspaces WHERE id = $1::uuid LIMIT 1`,
            workspaceId);
        const enc = rows[0]?.anthropic_api_key_enc;
        if (!enc) return null;
        try { return token_encryption_1.decrypt(enc); }
        catch { return null; }
    }

    async setApiKey(workspaceId, plainKey) {
        if (plainKey && !plainKey.startsWith('sk-ant-')) {
            throw new Error('Formato inválido — chave Anthropic deve começar com "sk-ant-"');
        }
        const enc = plainKey ? token_encryption_1.encrypt(plainKey) : null;
        await database_1.prisma.$queryRawUnsafe(
            `UPDATE workspaces SET anthropic_api_key_enc = $1, updated_at = now() WHERE id = $2::uuid`,
            enc, workspaceId);
        return { ok: true, configured: !!enc };
    }

    async hasApiKey(workspaceId) {
        const k = await this.getApiKey(workspaceId);
        return { configured: !!k };
    }

    // ── Execução do agente ───────────────────────────────────────────────────

    /**
     * Monta o system prompt completo (instruções do agente + tom + diretrizes + limite).
     */
    buildSystemPrompt(agent) {
        const parts = [agent.systemPrompt];

        const toneMap = {
            formal: 'Mantenha um tom formal e profissional.',
            friendly: 'Seja cordial, amigável e próximo, mas sempre profissional.',
            technical: 'Use linguagem técnica e precisa quando apropriado.',
        };
        if (toneMap[agent.tone]) parts.push(toneMap[agent.tone]);

        if (agent.maxWords) {
            parts.push(`Limite suas respostas a aproximadamente ${agent.maxWords} palavras.`);
        }

        if (agent.guidelines) {
            parts.push('Diretrizes de atendimento:\n' + agent.guidelines);
        }

        // Regras universais de continuidade — aplicadas a todos os agentes
        // pra evitar repetir perguntas e refazer etapas de qualificação.
        parts.push(
`REGRAS DE CONTINUIDADE (CRÍTICO — não viole):
- Antes de responder, releia TODO o histórico da conversa e identifique:
  • Perguntas que VOCÊ já fez (objetivo, experiência, capital, motivo, etc.)
  • Informações que o lead JÁ FORNECEU (mesmo em mensagens antigas)
- NUNCA repita uma pergunta que já foi feita. Se a resposta está no histórico, AVANCE para a próxima etapa do funil.
- Se já sabe o objetivo / experiência / capital do lead, NÃO pergunte de novo — apenas confirme e siga.
- Se o lead enviou múltiplas mensagens em sequência, responda às DUAS/TRÊS em UMA única resposta integrada (use --- entre os blocos se for usar quebra). NÃO mande respostas separadas perguntando a mesma coisa.
- Se você está em dúvida sobre o que perguntar a seguir, releia o histórico antes de improvisar.`);

        return parts.filter(Boolean).join('\n\n');
    }

    /**
     * Carrega histórico recente de mensagens do lead pra dar contexto ao agente.
     */
    async loadConversationContext(contactId, limit = 10) {
        if (!contactId) return [];
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT direction, message_content, created_at
             FROM messages
             WHERE contact_id = $1::uuid AND message_content IS NOT NULL AND length(trim(message_content)) > 0
             ORDER BY created_at DESC LIMIT $2`,
            contactId, Math.max(1, Math.min(50, limit)));
        return rows
            .reverse()
            .map(m => ({
                role: m.direction === 'INBOUND' ? 'user' : 'assistant',
                content: String(m.message_content).slice(0, 2000),
            }))
            .filter(m => m.content.trim().length > 0);
    }

    /**
     * Roda o agente: gera resposta e registra em ai_agent_runs.
     * NÃO envia mensagem — quem chama decide enviar/sugerir.
     */

    /**
     * Interpola variáveis do lead no prompt: {{nome}}, {{etapa}}, {{tags}}, {{telefone}}.
     */
    async loadLeadVars(leadId, workspaceId) {
        if (!leadId) return {};
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT l.id, l.name, l.phone, l.tags, s.name AS stage_name
             FROM leads l LEFT JOIN stages s ON s.id = l.stage_id
             WHERE l.id = $1::uuid AND l.workspace_id = $2::uuid LIMIT 1`,
            leadId, workspaceId);
        if (!rows.length) return {};
        const r = rows[0];
        return {
            nome: r.name || '',
            name: r.name || '',
            telefone: r.phone || '',
            phone: r.phone || '',
            etapa: r.stage_name || '',
            stage: r.stage_name || '',
            tags: Array.isArray(r.tags) ? r.tags.join(', ') : '',
        };
    }

    /**
     * Verifica se está dentro do horário configurado no agente.
     */
    isWithinWorkingHours(agent) {
        const wh = agent.triggerConfig?.workingHours;
        if (!wh || !wh.enabled) return true;
        const tz = wh.timezone || 'America/Sao_Paulo';
        const now = new Date();
        // Para simplicidade, calcula em UTC offset BRT (-180 min). Suportar TZ completa requer Intl
        const tzOffsetMin = -180; // BRT
        const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
        let localMin = utcMin + tzOffsetMin;
        while (localMin < 0) localMin += 1440;
        while (localMin >= 1440) localMin -= 1440;

        const days = Array.isArray(wh.days) && wh.days.length ? wh.days : [0,1,2,3,4,5,6];
        const utcDay = now.getUTCDay();
        // Ajusta dia se atravessa meia-noite
        let localDay = utcDay;
        const utcMinTotal = utcMin + tzOffsetMin;
        if (utcMinTotal < 0) localDay = (utcDay + 6) % 7;
        else if (utcMinTotal >= 1440) localDay = (utcDay + 1) % 7;
        if (!days.includes(localDay)) return false;

        const [sH, sM] = (wh.start || '00:00').split(':').map(Number);
        const [eH, eM] = (wh.end || '23:59').split(':').map(Number);
        return localMin >= (sH*60 + sM) && localMin <= (eH*60 + eM);
    }

    /**
     * Verifica se a mensagem do usuário contém palavra-chave de handoff.
     */
    hasHandoffKeyword(agent, userText) {
        const kws = agent.triggerConfig?.handoffKeywords;
        if (!Array.isArray(kws) || !kws.length || !userText) return false;
        const lower = String(userText).toLowerCase();
        return kws.some(k => lower.includes(String(k).toLowerCase()));
    }

    /**
     * Conta quantas vezes o agente já respondeu ao lead.
     */
    async countRunsForLead(agentId, leadId) {
        if (!leadId) return 0;
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT COUNT(*)::int AS cnt FROM ai_agent_runs
             WHERE agent_id = $1::uuid AND lead_id = $2::uuid AND status IN ('success','sent')`,
            agentId, leadId);
        return rows[0]?.cnt || 0;
    }

    _isUuidLike(v) {
        return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    }

    /**
     * Emite o indicador "digitando..." pro lead pelo canal correto.
     * Best-effort: erros silenciam pra não quebrar o fluxo de envio.
     */
    async _emitTypingIndicator(leadId) {
        try {
            const rows = await database_1.prisma.$queryRawUnsafe(
                `SELECT l.phone,
                        (SELECT m.connection_id FROM messages m
                         WHERE m.contact_id = l.contact_id AND m.direction = 'INBOUND'
                         ORDER BY m.created_at DESC LIMIT 1) AS conn_id,
                        (SELECT m.wamid FROM messages m
                         WHERE m.contact_id = l.contact_id AND m.direction = 'INBOUND' AND m.wamid IS NOT NULL
                         ORDER BY m.created_at DESC LIMIT 1) AS last_wamid
                 FROM leads l WHERE l.id = $1::uuid LIMIT 1`,
                leadId);
            if (!rows.length) return;
            const r = rows[0];
            const phone = String(r.phone || '');

            // ── Telegram ──
            if (phone.startsWith('tg_')) {
                const chatId = phone.slice(3);
                if (!chatId) return;
                // Pega bot ativo do workspace (pega o primeiro — TG não tem connection_id por mensagem)
                const botRows = await database_1.prisma.$queryRawUnsafe(
                    `SELECT bot_token_enc FROM telegram_connections tc
                     JOIN leads l ON l.workspace_id = tc.workspace_id
                     WHERE l.id = $1::uuid AND tc.status = 'ACTIVE'
                     LIMIT 1`,
                    leadId);
                if (!botRows.length) return;
                const { decrypt } = require('../../services/crypto/token.encryption');
                const token = decrypt(botRows[0].bot_token_enc);
                const { telegramApiService } = require('../../services/telegram/telegram-api.service');
                await telegramApiService.sendChatAction(token, chatId, 'typing');
                return;
            }

            // ── WhatsApp Cloud API ──
            if (!r.conn_id || !r.last_wamid) return;
            const connRows = await database_1.prisma.$queryRawUnsafe(
                `SELECT phone_number_id, access_token_enc FROM whatsapp_connections
                 WHERE id = $1::uuid LIMIT 1`,
                r.conn_id);
            if (!connRows.length) return;
            const { decrypt } = require('../../services/crypto/token.encryption');
            const accessToken = decrypt(connRows[0].access_token_enc);
            const { cloudApiService } = require('../../services/whatsapp/cloud-api.service');
            await cloudApiService.sendTypingIndicator(connRows[0].phone_number_id, accessToken, r.last_wamid);
        } catch (e) {
            // Best-effort — não quebra envio se typing falhar
            try { console.warn('[AI typing indicator error]', e?.message); } catch {}
        }
    }

    async _aiAutoSend(workspaceId, agentId, leadId, replyText, agent = null) {
        // Envia a resposta da IA pro lead via leads.service.sendReply (skip takeover/perm)
        // Quebra por --- em mensagens separadas, com delay configurável entre elas.
        const _sendLockKey = leadId ? `ai:lock:${leadId}` : null;
        const _releaseLock = async () => {
            if (!_sendLockKey) return;
            try { await redis_1.redis.del(_sendLockKey); } catch {}
        };
        if (!replyText || !leadId || !agentId) { await _releaseLock(); return { sent: 0 }; }
        const parts = String(replyText).split(/\n?\s*---\s*\n?/g)
            .map(p => p.trim()).filter(p => p.length > 0);
        if (!parts.length) { await _releaseLock(); return { sent: 0 }; }

        // Humanização: lê config do agente (delay + typing)
        // Defaults preservam comportamento legado (delay aleatório 800-1500ms)
        const hu = agent?.triggerConfig?.humanization || {};
        const computeDelay = () => {
            if (hu.delayEnabled) {
                const sec = Math.max(1, Math.min(30, Number(hu.delaySeconds) || 3));
                return sec * 1000;
            }
            // Comportamento legado quando humanização não configurada
            if (hu.delayEnabled === false) return 0; // explicitamente desligado
            return 800 + Math.random() * 700;
        };

        const { LeadsService } = require('../leads/leads.service');
        const leadsSvc = new LeadsService();

        let sent = 0;
        try {
            for (let i = 0; i < parts.length; i++) {
                try {
                    // Typing + delay ANTES de enviar a mensagem.
                    // Ordem importa: emitir typing → esperar delay → enviar.
                    // Senão o typing aparece e some instantâneo (msg dispensa o indicador).
                    // - i==0: só emite typing se config ligado, com delay curto (1.5s) pra ver os dots
                    // - i>0: usa delay configurado (ou legado 800-1500ms) com typing antes
                    if (hu.typingEnabled) {
                        await this._emitTypingIndicator(leadId);
                    }
                    let preDelay = 0;
                    if (i > 0) preDelay = computeDelay();
                    else if (hu.typingEnabled) preDelay = 1500; // visibilidade do typing na 1ª msg
                    if (preDelay > 0) await new Promise(r => setTimeout(r, preDelay));

                    const msg = await leadsSvc.sendReply(
                        leadId, parts[i],
                        null, 'AI', workspaceId,
                        { viewAllLeads: true, manageLeads: true },
                        null,
                        { aiAgentId: agentId }
                    );
                    // Stamp ai_agent_id na mensagem criada
                    if (msg?.id) {
                        try {
                            await database_1.prisma.$queryRawUnsafe(
                                `UPDATE messages SET ai_agent_id = $1::uuid WHERE id = $2::uuid`,
                                agentId, msg.id);
                        } catch {}
                    }
                    sent++;
                } catch (e) {
                    // Log e continua próximas
                    try { console.warn('[AI auto-send chunk error]', e?.message); } catch {}
                }
            }
            return { sent, total: parts.length };
        } finally {
            // Libera o lock longo (ai:lock:<leadId>) — auto-send terminou.
            await _releaseLock();
        }
    }

    async runAgent(workspaceId, agentId, { userText, leadId = null, contactId = null, triggerMessageId = null, bypassStatusCheck = false, historyOverride = null }) {
        const agent = await this.get(workspaceId, agentId);
        if (!agent) throw new Error('Agente não encontrado');
        if (!bypassStatusCheck && agent.status !== 'active') throw new Error('Agente está inativo');

        const apiKey = await this.getApiKey(workspaceId);
        if (!apiKey) throw new Error('API key Anthropic não configurada — vá em Agentes IA → Configurar API Key');

        // Carrega vars do lead pra interpolar no prompt
        const leadVars = await this.loadLeadVars(leadId, workspaceId);
        const interp = (txt) => String(txt || '').replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g,
            (m, k) => leadVars[k] != null ? String(leadVars[k]) : m);

        // Histórico + mensagem nova
        const history = Array.isArray(historyOverride)
            ? historyOverride.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }))
            : await this.loadConversationContext(contactId, agent.contextMessagesLimit);
        const messages = [...history];

        // ── Anti-repetição de URLs ──────────────────────────────────────────────
        // Extrai URLs já enviadas em mensagens OUTBOUND do histórico e injeta no
        // system prompt pra que o LLM saiba o que NÃO deve reenviar (salvo se o
        // lead pedir explicitamente). Solução para o bug de re-envio do mesmo
        // grupo quando lead manda confirmação ambígua tipo "Sim".
        const URL_REGEX = /https?:\/\/[^\s<>"'\)\]]+/gi;
        const sentUrls = new Set();
        for (const m of history) {
            if (m.role !== 'assistant' || !m.content) continue;
            const matches = m.content.match(URL_REGEX);
            if (!matches) continue;
            for (const u of matches) {
                // Strip pontuação final que regex pode ter pego (.,;)
                const clean = u.replace(/[.,;:!?]+$/, '');
                if (clean.length > 8) sentUrls.add(clean);
            }
        }
        const sentUrlsList = [...sentUrls];

        let antiRepeatBlock = '';
        if (sentUrlsList.length > 0) {
            antiRepeatBlock = `\n\n[CONTEXTO: LINKS JÁ ENVIADOS NESTE ATENDIMENTO]
Você JÁ enviou os seguintes URLs/links pra este lead:
${sentUrlsList.map(u => `- ${u}`).join('\n')}

REGRA CRÍTICA: NÃO reenvie esses links salvo se o lead pedir EXPLICITAMENTE (ex: "perdi o link", "manda de novo", "não chegou", "qual era o link", "não consegui abrir"). Confirmações genéricas como "sim", "ok", "beleza", "obrigado", "show", "👍" NÃO autorizam reenvio — apenas siga pra próxima etapa do funil sem repetir os links nem as frases de transição que já enviou ("Vou te mandar os 2 grupos agora", etc).`;
        }

        const systemPrompt = interp(this.buildSystemPrompt(agent)) + antiRepeatBlock;

        // Garante que termina com user (a mensagem que disparou)
        if (userText && userText.trim()) {
            const last = messages[messages.length - 1];
            if (!last || last.role !== 'user' || last.content !== userText) {
                messages.push({ role: 'user', content: userText });
            }
        }

        // Edge case: se userText vazio (ex: lead enviou mídia sem texto) e o histórico
        // terminou em assistant, Claude rejeita com "assistant message prefill" error.
        // Descarta trailing assistants e injeta placeholder se necessário.
        while (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
            messages.pop();
        }
        if (!messages.length || messages[messages.length - 1].role !== 'user') {
            messages.push({ role: 'user', content: '[mensagem com mídia recebida]' });
        }

        if (!messages.length) throw new Error('Sem mensagens pra processar');

        const maxTokens = Math.max(64, Math.min(2048, (agent.maxWords || 150) * 4));

        let result, error = null;
        try {
            result = await claude_client_1.callClaude({
                apiKey,
                model: agent.model,
                systemPrompt,
                messages,
                maxTokens,
                temperature: agent.temperature,
            });
        } catch (e) {
            error = e;
        }

        const totalTokens = result ? (result.usage.input_tokens + result.usage.output_tokens) : 0;

        // Sanitiza triggerMessageId — só aceita UUID (não wamid do WhatsApp)
        const safeTriggerMsgId = this._isUuidLike(triggerMessageId) ? triggerMessageId : null;

        // Registra a execução
        const runRows = await database_1.prisma.$queryRawUnsafe(
            `INSERT INTO ai_agent_runs (
                agent_id, workspace_id, lead_id, contact_id, trigger_message_id,
                user_text, reply_text, status, mode,
                prompt_tokens, completion_tokens, total_tokens, latency_ms, model, error_message
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
                $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15
            ) RETURNING id`,
            agentId, workspaceId,
            leadId || null,
            contactId || null,
            safeTriggerMsgId,
            userText || null,
            result?.text || null,
            error ? 'failed' : (agent.mode === 'auto' ? 'success' : 'suggested'),
            agent.mode,
            result?.usage.input_tokens || null,
            result?.usage.output_tokens || null,
            totalTokens || null,
            result?.latencyMs || null,
            result?.model || agent.model,
            error?.message || null
        );

        // Atualiza contador no agente
        if (result) {
            await database_1.prisma.$queryRawUnsafe(
                `UPDATE ai_agents SET total_runs = total_runs + 1, total_tokens = total_tokens + $1, updated_at = now()
                 WHERE id = $2::uuid`,
                totalTokens, agentId);
        }

        // ── Auto-send (modo auto): envia resposta pro lead via WhatsApp/Telegram ──
        if (result && !error && agent.mode === 'auto' && leadId && result.text) {
            this._aiAutoSend(workspaceId, agentId, leadId, result.text, agent)
                .then(r => {
                    if (r.sent > 0) {
                        // Atualiza run com reply_message_id se possível (skip por simplicidade)
                    }
                })
                .catch(e => { try { console.warn('[AI auto-send error]', e?.message); } catch {} });
        }

        if (error) throw error;

        return {
            runId: runRows[0]?.id,
            agentId: agent.id,
            agentName: agent.name,
            mode: agent.mode,
            replyText: result.text,
            usage: result.usage,
            latencyMs: result.latencyMs,
            model: result.model,
        };
    }

    /**
     * Endpoint de teste (não envia ao cliente — só roda o agente com texto manual).
     */
    async test(workspaceId, agentId, userText, history = null) {
        if (!userText || !userText.trim()) throw new Error('Texto de teste obrigatório');
        return await this.runAgent(workspaceId, agentId, {
            userText: userText.trim(),
            bypassStatusCheck: true,
            historyOverride: Array.isArray(history) ? history : null,
        });
    }

    // ── Histórico de execuções ───────────────────────────────────────────────
    async listRuns(workspaceId, agentId, limit = 50) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT r.*, l.name AS lead_name
             FROM ai_agent_runs r
             LEFT JOIN leads l ON l.id = r.lead_id
             WHERE r.workspace_id = $1::uuid AND r.agent_id = $2::uuid
             ORDER BY r.created_at DESC LIMIT $3`,
            workspaceId, agentId, Math.min(200, Math.max(1, limit)));
        return rows.map(r => ({
            id: r.id,
            agentId: r.agent_id,
            leadId: r.lead_id,
            leadName: r.lead_name,
            userText: r.user_text,
            replyText: r.reply_text,
            status: r.status,
            mode: r.mode,
            promptTokens: r.prompt_tokens,
            completionTokens: r.completion_tokens,
            totalTokens: r.total_tokens,
            latencyMs: r.latency_ms,
            model: r.model,
            errorMessage: r.error_message,
            approvedByUserId: r.approved_by_user_id,
            approvedAt: r.approved_at,
            createdAt: r.created_at,
        }));
    }


    async duplicate(workspaceId, userId, id) {
        const orig = await this.get(workspaceId, id);
        if (!orig) throw new Error('Agente não encontrado');
        const copy = await this.create(workspaceId, userId, {
            ...orig,
            id: undefined,
            name: orig.name + ' (cópia)',
            status: 'inactive',
            totalRuns: 0,
            totalTokens: 0,
        });
        return copy;
    }

    // ── Estado da IA por lead ───────────────────────────────────────────────
    async getLeadAiState(leadId, workspaceId) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT ai_agent_state, ai_agent_paused_at, ai_agent_paused_by,
                    ai_last_replied_at, ai_replies_count
             FROM leads WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
            leadId, workspaceId);
        const r = rows[0];
        if (!r) return null;
        return {
            state: r.ai_agent_state || 'auto',
            pausedAt: r.ai_agent_paused_at,
            pausedBy: r.ai_agent_paused_by,
            lastRepliedAt: r.ai_last_replied_at,
            repliesCount: r.ai_replies_count || 0,
        };
    }

    async _logStateChange(leadId, workspaceId, agentId, prev, next, reason, actorId) {
        try {
            await database_1.prisma.$queryRawUnsafe(
                `INSERT INTO ai_lead_state_log (lead_id, workspace_id, agent_id, prev_state, new_state, reason, actor_id)
                 VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::uuid)`,
                leadId, workspaceId,
                agentId || null,
                prev || null, next, reason || null,
                actorId || null);
        } catch {}
    }

    async _catchUpAfterReactivation(leadId, workspaceId) {
        // Roda quando IA volta a 'auto' de um estado pausado.
        // Se há inbounds desde a última saída (qualquer outbound), dispara IA pra continuar.
        try {
            const lead = await database_1.prisma.lead.findUnique({
                where: { id: leadId },
                select: { id: true, contactId: true, workspaceId: true },
            });
            if (!lead || !lead.contactId) return;

            const rows = await database_1.prisma.$queryRawUnsafe(
                `WITH last_out AS (
                    SELECT MAX(sent_at) AS at FROM messages
                    WHERE contact_id = $1::uuid AND direction = 'OUTBOUND'
                 )
                 SELECT m.id, m.message_content, m.sent_at
                 FROM messages m, last_out
                 WHERE m.contact_id = $1::uuid
                   AND m.direction = 'INBOUND'
                   AND (last_out.at IS NULL OR m.sent_at > last_out.at)
                 ORDER BY m.sent_at DESC
                 LIMIT 1`,
                lead.contactId);
            if (!rows.length) return;

            const last = rows[0];
            // Dispara fire-and-forget — runAgentForInbound vai avaliar triggers e continuidade
            this.runAgentForInbound(
                workspaceId, leadId, lead.contactId,
                last.message_content || '',
                {}
            ).catch(() => {});
        } catch {}
    }

    async setLeadAiState(leadId, workspaceId, newState, actorId, reason = null) {
        const valid = ['auto', 'paused_by_operator', 'paused_by_takeover', 'handed_off', 'force_active'];
        if (!valid.includes(newState)) throw new Error('Estado inválido');
        const cur = await this.getLeadAiState(leadId, workspaceId);
        if (!cur) throw new Error('Lead não encontrado');

        await database_1.prisma.$queryRawUnsafe(
            `UPDATE leads SET
                ai_agent_state = $1,
                ai_agent_paused_at = CASE WHEN $1 IN ('paused_by_operator','paused_by_takeover','handed_off') THEN now() ELSE NULL END,
                ai_agent_paused_by = $2::uuid,
                updated_at = now()
             WHERE id = $3::uuid AND workspace_id = $4::uuid`,
            newState, actorId || null, leadId, workspaceId);

        await this._logStateChange(leadId, workspaceId, null, cur.state, newState, reason, actorId);

        // Catch-up: se voltou pra auto de um estado pausado, dispara IA pra mensagens pendentes
        const pausedStates = ['paused_by_operator', 'paused_by_takeover', 'handed_off'];
        if (newState === 'auto' && pausedStates.includes(cur.state)) {
            this._catchUpAfterReactivation(leadId, workspaceId).catch(() => {});
        }

        return { state: newState };
    }

    // ── Override global ──────────────────────────────────────────────────────
    async getGlobalOverride(workspaceId) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT ai_global_override, ai_global_override_until, ai_global_override_reason,
                    ai_global_override_by, ai_global_override_set_at
             FROM workspaces WHERE id = $1::uuid LIMIT 1`,
            workspaceId);
        const r = rows[0] || {};
        const stillActive = r.ai_global_override && (
            !r.ai_global_override_until || new Date(r.ai_global_override_until) > new Date()
        );
        return {
            active: !!stillActive,
            until: r.ai_global_override_until,
            reason: r.ai_global_override_reason,
            setBy: r.ai_global_override_by,
            setAt: r.ai_global_override_set_at,
        };
    }

    async setGlobalOverride(workspaceId, active, opts = {}) {
        const userId = opts.userId || null;
        await database_1.prisma.$queryRawUnsafe(
            `UPDATE workspaces SET
                ai_global_override = $1,
                ai_global_override_until = $2::timestamptz,
                ai_global_override_reason = $3,
                ai_global_override_by = $4::uuid,
                ai_global_override_set_at = now(),
                updated_at = now()
             WHERE id = $5::uuid`,
            !!active,
            active && opts.until ? new Date(opts.until).toISOString() : null,
            active ? (opts.reason || null) : null,
            userId, workspaceId);
        return await this.getGlobalOverride(workspaceId);
    }

    // ── Decisão se agente roda pra esta inbound ─────────────────────────────
    /**
     * Avalia se o agente deve rodar pra uma mensagem inbound.
     * Retorna { run, reason } — reason explica por que rodou ou não rodou.
     */
    async shouldAgentRun(agent, leadCtx, opts = {}) {
        const tc = agent.triggerConfig || {};
        const isFirstInbound = !!opts.isFirstInbound;
        const messageText = (opts.messageText || '').toLowerCase();
        const now = new Date();

        // 0. Override global ativo? Atende sempre (ignora outros filtros)
        if (opts.globalOverrideActive) {
            return { run: true, reason: 'global_override' };
        }

        // 1. Estado do lead
        const stLead = await this.getLeadAiState(leadCtx.id, leadCtx.workspaceId);
        if (stLead) {
            if (stLead.state === 'handed_off') return { run: false, reason: 'lead_handed_off' };
            if (stLead.state === 'paused_by_operator') return { run: false, reason: 'paused_by_operator' };
            if (stLead.state === 'paused_by_takeover') return { run: false, reason: 'paused_by_takeover' };
            if (stLead.state === 'force_active') {
                // operador forçou ativação manual deste lead → atende
                return { run: true, reason: 'lead_force_active' };
            }
        }

        // 1.5 Continuidade: se IA já respondeu antes neste lead e estado=auto → continua
        if ((leadCtx.aiRepliesCount || 0) > 0) {
            return { run: true, reason: 'continuing_ai_conversation' };
        }

        // 2. Filtros
        const filters = tc.filters || {};
        // 2a. tags excluídas
        if (Array.isArray(filters.excludeTags) && filters.excludeTags.length > 0) {
            const leadTags = (leadCtx.tags || []).map(String);
            const hit = filters.excludeTags.find(t => leadTags.includes(t));
            if (hit) return { run: false, reason: `excluded_tag:${hit}` };
        }
        // 2b. lead já atribuído
        if (filters.excludeAssigned && leadCtx.assignedToId) {
            return { run: false, reason: 'lead_assigned' };
        }
        // 2c. apenas certas etapas
        if (Array.isArray(filters.onlyStages) && filters.onlyStages.length > 0) {
            if (!leadCtx.stageId || !filters.onlyStages.includes(leadCtx.stageId)) {
                return { run: false, reason: 'stage_not_allowed' };
            }
        }

        // 3. Working hours — fora do horário humano, IA assume (se config permitir)
        const wh = tc.workingHours || {};
        if (wh.enabled) {
            const tzOffsetMin = -180; // BRT (TODO suportar timezone customizado)
            const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
            let localMin = utcMin + tzOffsetMin;
            while (localMin < 0) localMin += 1440;
            while (localMin >= 1440) localMin -= 1440;
            const utcDay = now.getUTCDay();
            let localDay = utcDay;
            if (utcMin + tzOffsetMin < 0) localDay = (utcDay + 6) % 7;
            else if (utcMin + tzOffsetMin >= 1440) localDay = (utcDay + 1) % 7;

            const days = Array.isArray(wh.days) && wh.days.length ? wh.days : [1,2,3,4,5];
            const [sH, sM] = (wh.start || '09:00').split(':').map(Number);
            const [eH, eM] = (wh.end || '18:00').split(':').map(Number);
            const inHumanHours = days.includes(localDay) && localMin >= (sH*60+sM) && localMin <= (eH*60+eM);

            const behavior = wh.behaviorOutside || 'ai_assumes';
            if (behavior === 'ai_assumes' && !inHumanHours) {
                return { run: true, reason: 'outside_human_hours' };
            }
            if (behavior === 'no_ai' && !inHumanHours) {
                return { run: false, reason: 'outside_window_no_ai' };
            }
            // dentro do horário humano + behavior 'ai_assumes' → continua avaliando outros triggers
        }

        // 4. Triggers (avalia em ordem)
        const triggers = tc.triggers || {};

        // 4a. Lead criado (primeira inbound) OU lead nunca atendido (zero outbound)
        if (triggers.leadCreated?.enabled) {
            const isUntouched = (leadCtx.outboundCount || 0) === 0;
            if (isFirstInbound || isUntouched) {
                return { run: true, reason: isFirstInbound ? 'trigger_lead_created' : 'trigger_lead_untouched' };
            }
        }

        // 4b. Palavra-chave inbound
        if (triggers.inboundKeyword?.enabled && Array.isArray(triggers.inboundKeyword.keywords)) {
            const kws = triggers.inboundKeyword.keywords.map(k => String(k).toLowerCase().trim()).filter(Boolean);
            const matched = kws.find(k => messageText.includes(k));
            if (matched) return { run: true, reason: `trigger_keyword:${matched}` };
        }

        // 4c. Inativo há X horas (último contato do operador)
        if (triggers.inactiveHours?.enabled && triggers.inactiveHours.hours > 0) {
            const lastOpReply = leadCtx.lastOperatorReplyAt ? new Date(leadCtx.lastOperatorReplyAt) : null;
            const lastInbound = leadCtx.lastInboundAt ? new Date(leadCtx.lastInboundAt) : null;
            // Se operador já respondeu E respondeu mais recente que o inbound, não atende
            // Se operador NUNCA respondeu OU faz X+ horas que não responde, atende
            const hoursSinceOpReply = lastOpReply
                ? (now.getTime() - lastOpReply.getTime()) / 3600000
                : Infinity;
            if (hoursSinceOpReply >= triggers.inactiveHours.hours) {
                return { run: true, reason: `trigger_inactive_${triggers.inactiveHours.hours}h` };
            }
        }

        // 4d. Operator silence (operador parou de responder por X min — útil em horário humano)
        if (triggers.operatorSilence?.enabled && triggers.operatorSilence.minutes > 0) {
            const lastOpReply = leadCtx.lastOperatorReplyAt ? new Date(leadCtx.lastOperatorReplyAt) : null;
            if (lastOpReply) {
                const minSinceOp = (now.getTime() - lastOpReply.getTime()) / 60000;
                if (minSinceOp >= triggers.operatorSilence.minutes) {
                    return { run: true, reason: `trigger_op_silence_${triggers.operatorSilence.minutes}m` };
                }
            }
        }

        return { run: false, reason: 'no_matching_trigger' };
    }

    /**
     * Entry point chamado pelo webhook.processor quando nova mensagem inbound chega.
     * Carrega contexto, avalia triggers, roda agente se procedente.
     */
    /**
     * Calcula o debounce ms baseado no gap desde a inbound anterior do lead.
     * - Gap > 15s ou primeiro inbound da vida → 2s (rápido, msg isolada)
     * - Gap <= 15s → fullSeconds * 1000 (lead em rajada, espera ele terminar)
     */
    async _computeDebounceMs(leadId, fullSeconds) {
        const fullMs = Math.max(2000, Math.min(30000, (Number(fullSeconds) || 6) * 1000));
        try {
            // Busca a inbound IMEDIATAMENTE anterior à atual (OFFSET 1 pula a recém-chegada)
            const rows = await database_1.prisma.$queryRawUnsafe(
                `SELECT m.created_at FROM messages m
                 WHERE m.contact_id = (SELECT contact_id FROM leads WHERE id = $1::uuid)
                   AND m.direction = 'INBOUND'
                 ORDER BY m.created_at DESC
                 LIMIT 1 OFFSET 1`, leadId);
            if (!rows.length) return 2000; // primeiro inbound histórico → fast
            const prevMs = new Date(rows[0].created_at).getTime();
            const gap = Date.now() - prevMs;
            return gap > 15000 ? 2000 : fullMs;
        } catch {
            return fullMs; // erro de query → cai no longo (mais seguro)
        }
    }

    /**
     * Agenda execução do agente com debounce. Cancela timer pendente do mesmo lead.
     * Quando o timer dispara, chama runAgentForInbound com _bypassDebounce=true.
     */
    _scheduleDebouncedRun(workspaceId, leadId, contactId, messageText, opts, debounceMs) {
        if (!_debounceTimers) return; // safety
        const existing = _debounceTimers.get(leadId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
            _debounceTimers.delete(leadId);
            this.runAgentForInbound(workspaceId, leadId, contactId, messageText, { ...opts, _bypassDebounce: true })
                .catch(err => { try { console.warn('[AI debounced run error]', err?.message); } catch {} });
        }, debounceMs);
        _debounceTimers.set(leadId, timer);
    }

    async runAgentForInbound(workspaceId, leadId, contactId, messageText, opts = {}) {
        // Busca agentes ativos do workspace
        const activeAgents = await database_1.prisma.$queryRawUnsafe(
            `SELECT * FROM ai_agents WHERE workspace_id = $1::uuid AND status = 'active' LIMIT 5`,
            workspaceId);
        if (!activeAgents.length) return { run: false, reason: 'no_active_agents' };

        // ── Debounce inteligente ──────────────────────────────────────────────
        // Se algum agente ativo tem debounceEnabled, aguarda o lead "terminar de
        // digitar" antes de rodar. Curto (2s) pra msgs isoladas após pausa,
        // longo (config) pra rajadas de mensagens consecutivas.
        if (!opts._bypassDebounce) {
            const _firstAgentTC = activeAgents[0]?.trigger_config || {};
            const _hu = _firstAgentTC.humanization || {};
            if (_hu.debounceEnabled) {
                const debounceMs = await this._computeDebounceMs(leadId, _hu.debounceSeconds);
                this._scheduleDebouncedRun(workspaceId, leadId, contactId, messageText, opts, debounceMs);
                return { run: false, reason: 'debounced', delayMs: debounceMs };
            }
        }

        // Dedupe atômico via Redis SET NX — elimina race entre webhooks consecutivos.
        // Janela curta (5s): só protege contra duplicatas instantâneas de webhook.
        // A chave é liberada manualmente no final pra que follow-ups do lead em <30s
        // não fiquem bloqueados (problema reportado: lead manda mensagem 20s depois e
        // o agente não responde por dedup ainda ativo).
        const DEDUP_WINDOW_SECONDS = 5;
        const dedupKey = `ai:dedup:${leadId}`;
        let _dedupClaimed = false;
        try {
            const claimed = await redis_1.redis.set(dedupKey, '1', 'EX', DEDUP_WINDOW_SECONDS, 'NX');
            if (claimed !== 'OK') {
                // Outro processo já está atendendo este lead — skip silencioso
                return { run: false, reason: 'recent_run_dedup' };
            }
            _dedupClaimed = true;
        } catch {
            // Se Redis falhar, segue (não bloquear conversa por isso)
        }
        // Helper que garante release da chave ao retornar de qualquer caminho abaixo
        const _releaseDedup = async () => {
            if (!_dedupClaimed) return;
            try { await redis_1.redis.del(dedupKey); } catch {}
        };

        // Lock longo: cobre TODO o ciclo run + auto-send (que envia chunks com delays
        // humanos e pode levar 10-30s). Sem isso, _catchUpAfterReactivation ou outro
        // webhook entrante pode disparar segundo run enquanto chunks do primeiro
        // ainda estão sendo enviados, causando mensagens duplicadas (ex: lead recebeu
        // "Sou o Lucas..." duas vezes em conversa real).
        const SEND_LOCK_SECONDS = 60;
        const sendLockKey = `ai:lock:${leadId}`;
        let _sendLockClaimed = false;
        try {
            const claimedLock = await redis_1.redis.set(sendLockKey, '1', 'EX', SEND_LOCK_SECONDS, 'NX');
            if (claimedLock !== 'OK') {
                await _releaseDedup();
                return { run: false, reason: 'send_lock_busy' };
            }
            _sendLockClaimed = true;
        } catch {
            // Redis falhou — segue sem lock (não bloqueia conversa)
        }
        const _releaseSendLock = async () => {
            if (!_sendLockClaimed) return;
            _sendLockClaimed = false;
            try { await redis_1.redis.del(sendLockKey); } catch {}
        };

        // Override global do workspace
        const override = await this.getGlobalOverride(workspaceId);

        // Contexto do lead
        const leadRows = await database_1.prisma.$queryRawUnsafe(
            `SELECT l.id, l.name, l.phone, l.workspace_id, l.assigned_to_id, l.stage_id, l.tags,
                    l.ai_replies_count,
                    (SELECT MAX(m.sent_at) FROM messages m WHERE m.contact_id = l.contact_id AND m.direction = 'OUTBOUND' AND m.ai_agent_id IS NULL) AS last_op_reply,
                    (SELECT MAX(m.sent_at) FROM messages m WHERE m.contact_id = l.contact_id AND m.direction = 'INBOUND') AS last_inbound,
                    (SELECT COUNT(*) FROM messages m WHERE m.contact_id = l.contact_id AND m.direction = 'INBOUND') AS inbound_count,
                    (SELECT COUNT(*) FROM messages m WHERE m.contact_id = l.contact_id AND m.direction = 'OUTBOUND') AS outbound_count
             FROM leads l WHERE l.id = $1::uuid AND l.workspace_id = $2::uuid LIMIT 1`,
            leadId, workspaceId);
        if (!leadRows.length) { await _releaseSendLock(); await _releaseDedup(); return { run: false, reason: 'lead_not_found' }; }

        const lead = leadRows[0];
        const isFirstInbound = parseInt(lead.inbound_count, 10) <= 1; // <=1 porque inclui a atual
        // Canal do lead derivado do phone — Telegram tem prefixo 'tg_', restante é WhatsApp
        const leadChannel = String(lead.phone || '').startsWith('tg_') ? 'telegram' : 'whatsapp';

        const leadCtx = {
            id: lead.id,
            workspaceId: lead.workspace_id,
            assignedToId: lead.assigned_to_id,
            stageId: lead.stage_id,
            tags: lead.tags || [],
            lastOperatorReplyAt: lead.last_op_reply,
            lastInboundAt: lead.last_inbound,
            outboundCount: parseInt(lead.outbound_count, 10) || 0,
            aiRepliesCount: parseInt(lead.ai_replies_count, 10) || 0,
        };

        // Tenta cada agente ativo, primeiro que aceitar roda
        for (const agentRow of activeAgents) {
            const agent = rowToAgent(agentRow);
            // Filtro de canal — agente só atende leads dos canais marcados na config
            if (Array.isArray(agent.channels) && agent.channels.length > 0 && !agent.channels.includes(leadChannel)) {
                continue; // skip silencioso — canal do lead não está habilitado neste agente
            }
            const decision = await this.shouldAgentRun(agent, leadCtx, {
                isFirstInbound,
                messageText,
                globalOverrideActive: override.active,
            });

            if (!decision.run) {
                // só registra log se for skip explícito (não no_active_agents)
                continue;
            }

            // Verifica handoff keyword na mensagem (já temos hasHandoffKeyword)
            if (this.hasHandoffKeyword(agent, messageText)) {
                await this.setLeadAiState(leadId, workspaceId, 'handed_off', null, 'handoff_keyword_detected');
                await _releaseSendLock();
                await _releaseDedup();
                return { run: false, reason: 'handoff_keyword', agentId: agent.id };
            }

            // Verifica max replies
            const replyCount = await this.countRunsForLead(agent.id, leadId);
            if (agent.triggerConfig?.maxRepliesPerConversation > 0 && replyCount >= agent.triggerConfig.maxRepliesPerConversation) {
                await this.setLeadAiState(leadId, workspaceId, 'handed_off', null, 'max_replies_reached');
                await _releaseSendLock();
                await _releaseDedup();
                return { run: false, reason: 'max_replies_reached', agentId: agent.id };
            }

            // Roda o agente
            try {
                const result = await this.runAgent(workspaceId, agent.id, {
                    userText: messageText,
                    leadId,
                    contactId,
                    triggerMessageId: opts.messageId || null,
                });
                // Atualiza contadores no lead
                await database_1.prisma.$queryRawUnsafe(
                    `UPDATE leads SET ai_last_replied_at = now(), ai_replies_count = COALESCE(ai_replies_count,0) + 1, updated_at = now()
                     WHERE id = $1::uuid`, leadId);
                // Agenda follow-ups (se config ligado)
                this.scheduleFollowups(workspaceId, leadId, contactId, agent.id).catch(() => {});
                // Lock longo: se modo auto E houve reply, _aiAutoSend está rodando em
                // background e ele vai liberar o lock no finally. Senão, libera agora.
                if (agent.mode !== 'auto' || !result?.replyText) {
                    await _releaseSendLock();
                }
                await _releaseDedup();
                return { run: true, reason: decision.reason, agentId: agent.id, result };
            } catch (e) {
                const errorMsg = e?.message || String(e);
                try { console.warn('[AI run failed]', { leadId, agentId: agent.id, error: errorMsg }); } catch {}
                // Fallback: ao invés de só logar, executa fallback_action configurado no agente.
                // Default 'forward_human': avisa o lead, pausa IA (handed_off) e cancela follow-ups.
                // Sem isso, falha de saldo/rate-limit/erro deixa lead órfão.
                let fallbackApplied = false;
                const fallbackAction = agent.fallbackAction || 'forward_human';
                if (fallbackAction === 'forward_human') {
                    const fbMsg = (agent.fallbackMessage || '').trim();
                    if (fbMsg) {
                        try {
                            const { LeadsService } = require('../leads/leads.service');
                            const leadsSvc = new LeadsService();
                            const sent = await leadsSvc.sendReply(
                                leadId, fbMsg,
                                null, 'AI', workspaceId,
                                { viewAllLeads: true, manageLeads: true },
                                null,
                                { aiAgentId: agent.id }
                            );
                            if (sent?.id) {
                                try {
                                    await database_1.prisma.$queryRawUnsafe(
                                        `UPDATE messages SET ai_agent_id = $1::uuid WHERE id = $2::uuid`,
                                        agent.id, sent.id);
                                } catch {}
                            }
                        } catch (sendErr) {
                            try { console.warn('[AI fallback send error]', sendErr?.message); } catch {}
                        }
                    }
                    try {
                        await this.setLeadAiState(leadId, workspaceId, 'handed_off', null,
                            `ai_run_failed: ${String(errorMsg).slice(0, 200)}`);
                    } catch (stErr) {
                        try { console.warn('[AI fallback setState error]', stErr?.message); } catch {}
                    }
                    await this.cancelFollowups(leadId, 'ai_run_failed').catch(() => {});
                    fallbackApplied = true;
                }
                await _releaseSendLock();
                await _releaseDedup();
                return { run: false, reason: 'run_error', error: errorMsg, agentId: agent.id, fallbackApplied };
            }
        }

        await _releaseSendLock();
        await _releaseDedup();
        return { run: false, reason: 'no_agent_matched' };
    }

    /**
     * Marca lead como takeover quando operador responde manualmente.
     * Chamado em sendReply / sendTemplateReply / sendDocumentReply do LeadsService.
     */
    async markLeadTakeover(leadId, workspaceId, userId) {
        const cur = await this.getLeadAiState(leadId, workspaceId);
        if (!cur) return;
        if (cur.state === 'auto') {
            await this.setLeadAiState(leadId, workspaceId, 'paused_by_takeover', userId, 'operator_replied_manually');
        }
        // Cancela follow-ups pendentes deste lead — operador assumiu
        await this.cancelFollowups(leadId, 'operator_takeover').catch(() => {});
    }

    async _rescheduleFollowupsForAllLeads(workspaceId, agentId) {
        // Pega todos os leads que têm followup pending deste agente
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT DISTINCT lead_id, contact_id FROM ai_followup_queue
             WHERE workspace_id=$1::uuid AND agent_id=$2::uuid AND status='pending'`,
            workspaceId, agentId);
        let rescheduled = 0;
        for (const r of rows) {
            try {
                // scheduleFollowups cancela antigos + insere com nova config (timestamp = now+delay)
                await this.scheduleFollowups(workspaceId, r.lead_id, r.contact_id, agentId);
                rescheduled++;
            } catch {}
        }
        return { rescheduled };
    }

    // ── Follow-up automático ─────────────────────────────────────────────────
    async scheduleFollowups(workspaceId, leadId, contactId, agentId) {
        const agent = await this.get(workspaceId, agentId);
        if (!agent) return { scheduled: 0, reason: 'agent_not_found' };
        const fc = agent.triggerConfig?.followups;
        if (!fc?.enabled || !Array.isArray(fc.steps) || fc.steps.length === 0) {
            return { scheduled: 0, reason: 'followups_disabled' };
        }

        // Cancela pendentes anteriores deste lead+agent (substitui)
        await database_1.prisma.$queryRawUnsafe(
            `UPDATE ai_followup_queue SET status = 'cancelled', cancelled_reason = 'superseded', processed_at = now()
             WHERE lead_id = $1::uuid AND agent_id = $2::uuid AND status = 'pending'`,
            leadId, agentId);

        const now = Date.now();
        let scheduled = 0;
        for (let i = 0; i < fc.steps.length; i++) {
            const step = fc.steps[i] || {};
            const minutes = Math.max(5, Math.min(43200, parseInt(step.delayMinutes, 10) || 60));
            const tone = String(step.tone || 'gentle').slice(0, 40);
            const at = new Date(now + minutes * 60000);
            try {
                await database_1.prisma.$queryRawUnsafe(
                    `INSERT INTO ai_followup_queue (lead_id, workspace_id, agent_id, contact_id, step_index, step_tone, scheduled_at)
                     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::timestamptz)`,
                    leadId, workspaceId, agentId,
                    contactId || null,
                    i, tone, at.toISOString());
                scheduled++;
            } catch {}
        }
        return { scheduled };
    }

    async cancelFollowups(leadId, reason = 'cancelled') {
        const r = await database_1.prisma.$queryRawUnsafe(
            `UPDATE ai_followup_queue SET status = 'cancelled', cancelled_reason = $1, processed_at = now()
             WHERE lead_id = $2::uuid AND status = 'pending'
             RETURNING id`,
            String(reason).slice(0, 100), leadId);
        return { cancelled: r.length };
    }

    async listFollowupsForLead(leadId, limit = 20) {
        return await database_1.prisma.$queryRawUnsafe(
            `SELECT id, agent_id, step_index, step_tone, scheduled_at, status, cancelled_reason,
                    processed_at, error_message
             FROM ai_followup_queue
             WHERE lead_id = $1::uuid
             ORDER BY scheduled_at DESC LIMIT $2::int`,
            leadId, Math.max(1, Math.min(100, limit)));
    }

    async processFollowupTick(maxBatch = 20) {
        // Pega batch de pending vencidos
        const due = await database_1.prisma.$queryRawUnsafe(
            `SELECT id, lead_id, workspace_id, agent_id, contact_id, step_index, step_tone, scheduled_at, created_at
             FROM ai_followup_queue
             WHERE status = 'pending' AND scheduled_at <= now()
             ORDER BY scheduled_at ASC
             LIMIT $1::int`,
            Math.max(1, Math.min(50, maxBatch)));

        let processed = 0, sent = 0, cancelled = 0, errors = 0;
        for (const f of due) {
            // Tenta claim atômico (UPDATE WHERE status='pending')
            const claim = await database_1.prisma.$queryRawUnsafe(
                `UPDATE ai_followup_queue SET status = 'processing'
                 WHERE id = $1::uuid AND status = 'pending'
                 RETURNING id`,
                f.id);
            if (!claim.length) continue;
            processed++;

            try {
                // Verifica estado do lead
                const stLead = await this.getLeadAiState(f.lead_id, f.workspace_id);
                if (stLead && ['handed_off','paused_by_operator','paused_by_takeover'].includes(stLead.state)) {
                    await database_1.prisma.$queryRawUnsafe(
                        `UPDATE ai_followup_queue SET status='cancelled', cancelled_reason=$1, processed_at=now() WHERE id=$2::uuid`,
                        'lead_state:' + stLead.state, f.id);
                    cancelled++; continue;
                }

                // Verifica agente ativo
                const agent = await this.get(f.workspace_id, f.agent_id);
                if (!agent || agent.status !== 'active') {
                    await database_1.prisma.$queryRawUnsafe(
                        `UPDATE ai_followup_queue SET status='cancelled', cancelled_reason='agent_inactive', processed_at=now() WHERE id=$1::uuid`,
                        f.id);
                    cancelled++; continue;
                }

                // Defesa em depth: o lead respondeu depois do agendamento? cancela
                if (f.contact_id) {
                    const lastReply = await database_1.prisma.$queryRawUnsafe(
                        `SELECT MAX(sent_at) AS last FROM messages WHERE contact_id = $1::uuid AND direction = 'INBOUND'`,
                        f.contact_id);
                    if (lastReply[0]?.last && new Date(lastReply[0].last) > new Date(f.created_at)) {
                        await database_1.prisma.$queryRawUnsafe(
                            `UPDATE ai_followup_queue SET status='cancelled', cancelled_reason='lead_replied_after_schedule', processed_at=now() WHERE id=$1::uuid`,
                            f.id);
                        cancelled++; continue;
                    }
                }

                // Roda follow-up
                const result = await this.runFollowupAgent(
                    f.workspace_id, f.agent_id, f.lead_id, f.contact_id, f.step_tone, f.step_index);

                await database_1.prisma.$queryRawUnsafe(
                    `UPDATE ai_followup_queue SET status='sent', run_id=$1::uuid, processed_at=now() WHERE id=$2::uuid`,
                    result?.runId || null, f.id);
                sent++;
            } catch (e) {
                errors++;
                try {
                    await database_1.prisma.$queryRawUnsafe(
                        `UPDATE ai_followup_queue SET status='error', error_message=$1, processed_at=now() WHERE id=$2::uuid`,
                        String(e?.message || 'unknown').slice(0, 500), f.id);
                } catch {}
            }
        }
        return { processed, sent, cancelled, errors };
    }

    async runFollowupAgent(workspaceId, agentId, leadId, contactId, tone, stepIndex) {
        const TONE_HINTS = {
            gentle:      'Reabertura LEVE, mensagem curta, zero pressão. Tom: "Eai, tudo certo por aí?". Não cobra, não pergunta de novo o que já perguntou.',
            check_in:    'Check-in caloroso. Pergunta se ele travou em algum passo, se posso ajudar com algo. Sem pressionar nada.',
            value_drop:  'Lembra de UM benefício específico do que ele estava prestes a fazer (live, conhecer Ferrari, plano X). Mensagem curta, valor claro, sem listar tudo de novo.',
            last_chance: 'Última tentativa. Dá saída digna ("se mudar de ideia, tô por aqui"). Pode oferecer falar com humano. Sem qualquer cobrança.',
        };
        const hint = TONE_HINTS[tone] || TONE_HINTS.gentle;

        const history = await this.loadConversationContext(contactId, 25);

        const followupNudge = `[INSTRUÇÃO INTERNA — não copie isso na resposta]
O lead silenciou após sua última mensagem. Esse é o follow-up #${stepIndex + 1} (tom: ${tone}).
${hint}
Use --- pra quebrar em 1 ou 2 mensagens curtas. NÃO repita o que você já disse antes. NÃO comece com "Oi"/"Olá" — você JÁ está na conversa, é nudge natural.
[/INSTRUÇÃO]`;

        return await this.runAgent(workspaceId, agentId, {
            userText: followupNudge,
            leadId,
            contactId,
            historyOverride: history,
            // followup respeita status do agente (se foi inativado, processFollowupTick já cancelou)
        });
    }


    async stats(workspaceId, agentId) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'success' OR status = 'sent')::int AS success,
                COUNT(*) FILTER (WHERE status = 'suggested')::int AS suggested,
                COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
                COALESCE(SUM(total_tokens),0)::bigint AS tokens,
                COALESCE(AVG(latency_ms),0)::int AS avg_latency_ms
             FROM ai_agent_runs
             WHERE workspace_id = $1::uuid AND agent_id = $2::uuid`,
            workspaceId, agentId);
        return rows[0] || { total: 0, success: 0, suggested: 0, failed: 0, tokens: 0, avg_latency_ms: 0 };
    }
}

exports.AiAgentsService = AiAgentsService;

// ── Dispatcher de follow-ups (chamado pelo app.js) ──────────────────────────
function startFollowupDispatcher(logger) {
    const tick = async () => {
        try {
            const svc = new AiAgentsService();
            const r = await svc.processFollowupTick(20);
            if (r.processed > 0) {
                logger?.info?.(r, 'AI followup tick');
            }
        } catch (e) {
            logger?.warn?.({ err: e?.message }, 'AI followup tick error');
        }
    };
    // Primeira execução em 10s, depois a cada 60s
    setTimeout(tick, 10000);
    setInterval(tick, 60000);
    logger?.info?.({}, 'AI followup dispatcher started (tick=60s)');
}

exports.startFollowupDispatcher = startFollowupDispatcher;
