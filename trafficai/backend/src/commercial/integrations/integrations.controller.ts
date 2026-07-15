// ==============================
// TrafficAI — Commercial Integrations Controller
// Conecta/desconecta integrações e dispara syncs.
// ==============================

import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../database/connection';
import { authMiddleware } from '../../auth/auth.middleware';
import { logger } from '../../shared/logger';
import crypto from 'crypto';
import { KommoClient } from './kommo/client';
import { syncKommoIntegration } from './kommo/sync';
import { EvolutionClient } from './evolution/client';

const router = Router();
router.use(authMiddleware);

function getUserId(req: Request): string {
    return (req as any).user.userId as string;
}

function fail(res: Response, message: string, status = 400): void {
    res.status(status).json({ success: false, error: { message } });
}

// ----- GET /commercial/integrations — lista integrações -----

router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = getUserId(req);
        const rows = await query(
            `SELECT id, type, name, status, client_id,
                    config - 'access_token' AS config,   -- nunca expõe credentials
                    last_event_at, last_error, connected_at, created_at
             FROM comm_integrations WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );
        res.json({ success: true, data: rows });
    } catch (err: any) {
        logger.error('Erro ao listar integrações', { error: err.message });
        fail(res, 'Erro ao listar integrações', 500);
    }
});

// ----- POST /commercial/integrations/kommo/connect -----
// Body: { subdomain, accessToken, name?, clientId? }
// Valida o token, cria o registro e dispara sync inicial em background.

router.post('/kommo/connect', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = getUserId(req);
        const { subdomain, accessToken, name, clientId } = req.body as {
            subdomain?: string; accessToken?: string; name?: string; clientId?: string;
        };

        if (!subdomain || !accessToken) {
            return fail(res, 'subdomain e accessToken são obrigatórios');
        }

        // Valida credencial chamando /account
        let accountInfo;
        try {
            const tester = new KommoClient(subdomain, accessToken);
            accountInfo = await tester.getAccount();
        } catch (err: any) {
            return fail(res, 'Credenciais inválidas: ' + KommoClient.formatError(err), 401);
        }

        // Verifica duplicata (mesmo subdomain pra mesmo user)
        const existing = await queryOne<{ id: string }>(
            `SELECT id FROM comm_integrations
             WHERE user_id = $1 AND type = 'kommo' AND config->>'subdomain' = $2`,
            [userId, subdomain]
        );

        let integrationId: string;
        if (existing) {
            // Atualiza credentials (refresh do token)
            await query(
                `UPDATE comm_integrations
                 SET credentials = $1, status = 'connecting', last_error = NULL, updated_at = NOW()
                 WHERE id = $2`,
                [{ access_token: accessToken }, existing.id]
            );
            integrationId = existing.id;
        } else {
            const ins = await query<{ id: string }>(
                `INSERT INTO comm_integrations
                 (user_id, client_id, type, name, status, config, credentials, connected_at)
                 VALUES ($1, $2, 'kommo', $3, 'connecting', $4, $5, NOW())
                 RETURNING id`,
                [
                    userId,
                    clientId ?? null,
                    name ?? `Kommo · ${accountInfo.name}`,
                    { subdomain, kommoAccountId: accountInfo.id, accountName: accountInfo.name },
                    { access_token: accessToken },
                ]
            );
            integrationId = ins[0]!.id;
        }

        // Dispara sync inicial em background (não bloqueia o response)
        syncKommoIntegration(integrationId, { incremental: false })
            .then(r => logger.info('Kommo initial sync ok', { integrationId, ...r }))
            .catch(e => logger.error('Kommo initial sync falhou', { integrationId, error: e.message }));

        res.json({
            success: true,
            data: {
                integrationId,
                accountInfo,
                message: 'Integração criada. Sync inicial rodando em background (1–3 minutos).',
            },
        });
    } catch (err: any) {
        logger.error('Erro ao conectar Kommo', { error: err.message });
        fail(res, 'Erro ao conectar: ' + err.message, 500);
    }
});

// ----- POST /commercial/integrations/:id/sync — re-sync manual -----

router.post('/:id/sync', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = getUserId(req);
        const intg = await queryOne<{ user_id: string; type: string }>(
            `SELECT user_id, type FROM comm_integrations WHERE id = $1`, [req.params.id]
        );
        if (!intg || intg.user_id !== userId) {
            return fail(res, 'Integração não encontrada', 404);
        }
        if (intg.type !== 'kommo') {
            return fail(res, 'Sync só disponível pra Kommo no momento', 400);
        }

        const incremental = req.query.full !== 'true';
        // Sincroniza e responde com resultado
        const result = await syncKommoIntegration(req.params.id, { incremental });
        res.json({ success: true, data: result });
    } catch (err: any) {
        logger.error('Erro no sync manual', { error: err.message });
        fail(res, 'Sync falhou: ' + err.message, 500);
    }
});

// ===========================================================================
// WHATSAPP — EVOLUTION
// ===========================================================================

interface EvolutionResolvedConfig {
    baseUrl: string;
    apiKey: string;
    webhookBase: string;
    /** false = config global do trafficai; true = config por-integração (override) */
    customServer: boolean;
}

function getEvolutionConfig(override?: { baseUrl?: string; apiKey?: string }): EvolutionResolvedConfig {
    const baseUrl = override?.baseUrl?.trim() || process.env.EVOLUTION_API_BASE_URL;
    const apiKey = override?.apiKey?.trim() || process.env.EVOLUTION_API_KEY;
    const webhookBase = process.env.PUBLIC_API_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
    if (!baseUrl || !apiKey) {
        throw new Error('Configure a Evolution API: defina EVOLUTION_API_BASE_URL e EVOLUTION_API_KEY no .env, OU forneça URL e API Key no formulário avançado.');
    }
    return {
        baseUrl,
        apiKey,
        webhookBase: webhookBase.replace(/\/$/, ''),
        customServer: !!(override?.baseUrl?.trim() || override?.apiKey?.trim()),
    };
}

// POST /commercial/integrations/whatsapp/connect
// Body: {
//   name?, clientId?,
//   evolutionBaseUrl?, evolutionApiKey?    -- override per-integration
//   webhookEvents?                         -- string[] opcional (default = todos relevantes)
// }
router.post('/whatsapp/connect', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = getUserId(req);
        const {
            name, clientId,
            evolutionBaseUrl, evolutionApiKey,
            webhookEvents,
        } = req.body as {
            name?: string; clientId?: string;
            evolutionBaseUrl?: string; evolutionApiKey?: string;
            webhookEvents?: string[];
        };

        const cfg = getEvolutionConfig({ baseUrl: evolutionBaseUrl, apiKey: evolutionApiKey });

        // Cria registro primeiro pra usar id como nome de instância
        const webhookSecret = crypto.randomBytes(24).toString('hex');
        const initialConfig: Record<string, unknown> = {
            baseUrl: cfg.baseUrl,
            instanceName: '',
            customServer: cfg.customServer,
        };
        if (Array.isArray(webhookEvents)) initialConfig.webhookEvents = webhookEvents;

        const credentials: Record<string, unknown> = { webhook_secret: webhookSecret };
        // Guarda as credenciais customizadas SEPARADAS de webhook_secret pra reuso em sync/QR/delete
        if (cfg.customServer) {
            credentials.evolution_base_url = cfg.baseUrl;
            credentials.evolution_api_key = cfg.apiKey;
        }

        const ins = await query<{ id: string }>(
            `INSERT INTO comm_integrations
             (user_id, client_id, type, name, status, config, credentials)
             VALUES ($1, $2, 'whatsapp_evolution', $3, 'connecting', $4, $5)
             RETURNING id`,
            [
                userId, clientId ?? null,
                name ?? 'WhatsApp Evolution',
                initialConfig,
                credentials,
            ]
        );
        const integrationId = ins[0]!.id;
        const instanceName = `comm-${integrationId}`;

        // Atualiza config com instanceName
        await query(
            `UPDATE comm_integrations SET config = config || $1::jsonb WHERE id = $2`,
            [JSON.stringify({ instanceName }), integrationId]
        );

        // Cria instância no Evolution
        const webhookUrl = `${cfg.webhookBase}/api/v1/commercial/webhooks/evolution/${integrationId}`;
        const evo = new EvolutionClient(cfg.baseUrl, cfg.apiKey);
        try {
            const created = await evo.createInstance({ instanceName, webhookUrl });
            res.json({
                success: true,
                data: {
                    integrationId,
                    instanceName: created.instanceName,
                    qrCode: created.qrCode,    // pode ser null — frontend faz polling em /qr
                    message: 'Instância criada. Abra o WhatsApp e escaneie o QR Code.',
                },
            });
        } catch (err: any) {
            // Rollback: remove o registro se falhou criar instância
            await query(`DELETE FROM comm_integrations WHERE id = $1`, [integrationId]);
            return fail(res, 'Falha ao criar instância: ' + EvolutionClient.formatError(err), 500);
        }
    } catch (err: any) {
        logger.error('Erro ao conectar WhatsApp', { error: err.message });
        fail(res, err.message, 500);
    }
});

// Helper pra resolver config Evolution de uma integração (custom ou global)
function resolveEvolutionForIntegration(credentials: any): { baseUrl: string; apiKey: string } {
    if (credentials?.evolution_base_url && credentials?.evolution_api_key) {
        return { baseUrl: credentials.evolution_base_url, apiKey: credentials.evolution_api_key };
    }
    const cfg = getEvolutionConfig();
    return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey };
}

// GET /commercial/integrations/:id/qr — busca QR atualizado (polling do frontend)
router.get('/:id/qr', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = getUserId(req);
        const intg = await queryOne<{
            user_id: string; type: string; status: string;
            config: { instanceName?: string };
            credentials: any;
        }>(
            `SELECT user_id, type, status, config, credentials FROM comm_integrations WHERE id = $1`,
            [req.params.id]
        );
        if (!intg || intg.user_id !== userId) return fail(res, 'Integração não encontrada', 404);
        if (intg.type !== 'whatsapp_evolution') return fail(res, 'Não é integração WhatsApp', 400);
        if (intg.status === 'connected') {
            return res.json({ success: true, data: { status: 'connected', qrCode: null } }) as unknown as void;
        }

        const ev = resolveEvolutionForIntegration(intg.credentials);
        const evo = new EvolutionClient(ev.baseUrl, ev.apiKey);
        const instanceName = intg.config?.instanceName;
        if (!instanceName) return fail(res, 'instanceName ausente', 500);

        const qr = await evo.getQrCode(instanceName);
        const status = await evo.getInstanceStatus(instanceName);
        res.json({
            success: true,
            data: {
                status: status.status === 'open' ? 'connected' : status.status === 'connecting' ? 'connecting' : 'disconnected',
                qrCode: qr?.code ?? null,
                pairingCode: qr?.pairingCode ?? null,
            },
        });
    } catch (err: any) {
        logger.error('Erro ao buscar QR', { error: err.message });
        fail(res, EvolutionClient.formatError(err), 500);
    }
});

// ----- DELETE /commercial/integrations/:id — desconecta -----

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = getUserId(req);
        const intg = await queryOne<{ id: string; type: string; config: any }>(
            `SELECT id, type, config FROM comm_integrations WHERE id = $1 AND user_id = $2`,
            [req.params.id, userId]
        );
        if (!intg) return fail(res, 'Integração não encontrada', 404);

        // Limpa instância no Evolution antes de remover do banco
        if (intg.type === 'whatsapp_evolution' && intg.config?.instanceName) {
            try {
                const fullIntg = await queryOne<{ credentials: any }>(
                    `SELECT credentials FROM comm_integrations WHERE id = $1`, [intg.id]
                );
                const ev = resolveEvolutionForIntegration(fullIntg?.credentials);
                const evo = new EvolutionClient(ev.baseUrl, ev.apiKey);
                await evo.deleteInstance(intg.config.instanceName);
            } catch (err: any) {
                logger.warn('Erro ao deletar instância Evolution (continuando)', { error: err.message });
            }
        }

        await query(`DELETE FROM comm_integrations WHERE id = $1`, [intg.id]);
        res.json({ success: true, data: { id: intg.id } });
    } catch (err: any) {
        logger.error('Erro ao desconectar', { error: err.message });
        fail(res, 'Erro ao desconectar', 500);
    }
});

export const integrationsController = router;
