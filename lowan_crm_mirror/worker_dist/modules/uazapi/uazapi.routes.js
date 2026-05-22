"use strict";
// uazapi.routes.js — CRUD de instâncias uazapi pelo CRM.
// Montado em /api/v1/leads/uazapi-instances (via app.js → leads prefix).
//
// Rotas:
//   GET    /          → lista instâncias do workspace
//   POST   /          → cria nova (chama uazapi.createInstance + configura webhook)
//   POST   /:id/connect    → gera QR (ou pairing code se phone informado)
//   GET    /:id/qr         → poll do QR atual + status
//   POST   /:id/disconnect → desconecta (mantém auth)
//   POST   /:id/reset      → logout total (exige novo QR pra reconectar)
//   PATCH  /:id/antiban    → toggle anti-ban
//   DELETE /:id            → soft delete (e reset na uazapi)

Object.defineProperty(exports, "__esModule", { value: true });
exports.default = uazapiRoutes;

const database_1 = require("../../config/database");
const leads_middleware_1 = require("../leads/leads.middleware");
const common_types_1 = require("../../types/common.types");
const { uazapiClient } = require("../../services/uazapi/uazapi.client");

// Gate: admin OU collaborator com manageConnections
async function requireConnMgrOrAdmin(req, reply) {
    if (req.leadUser?.role === 'ADMIN') return;
    await (0, leads_middleware_1.requirePermission)('manageConnections')(req, reply);
}

async function uazapiRoutes(app) {
    app.addHook('preHandler', leads_middleware_1.authenticateLeadUser);

    // ─── GET / — lista instâncias do workspace ──────────────────────────────
    app.get('/', { preHandler: requireConnMgrOrAdmin }, async (req, reply) => {
        const { workspaceId } = req.leadUser;
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT id, uazapi_id AS "uazapiId", uazapi_token AS "uazapiToken",
                    name, status, phone_number AS "phoneNumber", jid,
                    profile_name AS "profileName", is_business AS "isBusiness",
                    antiban_enabled AS "antibanEnabled",
                    qr_data_url AS "qrDataUrl", qr_expires_at AS "qrExpiresAt",
                    paired_at AS "pairedAt", last_disconnect_at AS "lastDisconnectAt",
                    last_disconnect_reason AS "lastDisconnectReason",
                    created_at AS "createdAt"
             FROM uazapi_instances
             WHERE workspace_id = $1::uuid AND deleted_at IS NULL
             ORDER BY created_at DESC`,
            workspaceId
        );
        return reply.send({ instances: rows });
    });

    // ─── POST / — cria nova instância ───────────────────────────────────────
    app.post('/', { preHandler: requireConnMgrOrAdmin }, async (req, reply) => {
        const { workspaceId } = req.leadUser;
        const { name } = req.body || {};
        if (!name?.trim()) throw common_types_1.HttpError.badRequest('Nome obrigatório');
        const cleanName = name.trim().slice(0, 120);

        // 1. Cria instância na uazapi (admin)
        let upstream;
        try {
            upstream = await uazapiClient.createInstance({
                name: cleanName,
                adminField01: `workspace=${workspaceId}`,
                adminField02: `lowan-crm`,
            });
        } catch (e) {
            throw common_types_1.HttpError.badRequest(`uazapi createInstance falhou: ${e.message}`, 'UAZAPI_CREATE_FAILED');
        }

        const uazapiId = upstream?.instance?.id;
        const uazapiToken = upstream?.token || upstream?.instance?.token;
        if (!uazapiId || !uazapiToken) {
            throw common_types_1.HttpError.badRequest('uazapi não retornou id/token', 'UAZAPI_INVALID_RESPONSE');
        }

        // 2. Salva no DB local
        const rows = await database_1.prisma.$queryRawUnsafe(
            `INSERT INTO uazapi_instances (workspace_id, uazapi_id, uazapi_token, name, status, antiban_enabled)
             VALUES ($1::uuid, $2, $3, $4, 'disconnected', true)
             RETURNING id, uazapi_id AS "uazapiId", name, status, antiban_enabled AS "antibanEnabled", created_at AS "createdAt"`,
            workspaceId, uazapiId, uazapiToken, cleanName
        );

        // 3. Configura webhook da instância (fire-and-forget — sem bloquear)
        uazapiClient.setWebhook(uazapiToken, {
            events: ['connection', 'messages', 'messages_update'],
            excludeMessages: ['isGroupYes', 'wasSentByApi'],
            enabled: true,
            action: 'add',
        }).catch(err => console.error('[uazapi] setWebhook failed:', err.message));

        return reply.status(201).send({ instance: rows[0] });
    });

    // ─── POST /:id/connect — gera QR ou pairing code ────────────────────────
    app.post('/:id/connect', { preHandler: requireConnMgrOrAdmin }, async (req, reply) => {
        const { workspaceId } = req.leadUser;
        const { id } = req.params;
        const { phone } = req.body || {};
        const inst = await _findInstance(id, workspaceId);

        const result = await uazapiClient.connect(inst.uazapiToken, {
            ...(phone ? { phone } : {}),
            systemName: 'Lowan CRM',
        });

        // Atualiza QR no DB pra polling rápido (sem chamar uazapi de novo)
        const qrcode = result?.instance?.qrcode || null;
        const paircode = result?.instance?.paircode || null;
        const status = result?.instance?.status || 'connecting';

        if (qrcode) {
            await database_1.prisma.$queryRawUnsafe(
                `UPDATE uazapi_instances SET qr_data_url = $1, qr_expires_at = now() + interval '60 seconds',
                    status = $2, updated_at = now() WHERE id = $3::uuid`,
                qrcode, status, inst.id
            );
        }

        return reply.send({
            qrcode: qrcode || null,
            paircode: paircode || null,
            status,
            connected: !!result?.connected,
            loggedIn: !!result?.loggedIn,
        });
    });

    // ─── GET /:id/qr — poll do QR + status (chama uazapi pra refresh) ───────
    app.get('/:id/qr', { preHandler: requireConnMgrOrAdmin }, async (req, reply) => {
        const { workspaceId } = req.leadUser;
        const { id } = req.params;
        const inst = await _findInstance(id, workspaceId);

        // Puxa status fresco da uazapi
        let upstream;
        try {
            upstream = await uazapiClient.getStatus(inst.uazapiToken);
        } catch (e) {
            return reply.send({ status: inst.status, qrcode: null, error: e.message });
        }
        const ups = upstream?.instance || {};
        const stat = upstream?.status || {};

        const status = ups.status || 'unknown';
        const qrcode = ups.qrcode || null;
        const profileName = ups.profileName || null;
        const phoneNumber = stat.jid ? String(stat.jid).split('@')[0].split(':')[0] : (inst.phoneNumber || null);
        const jid = stat.jid || inst.jid || null;
        const isBusiness = !!ups.isBusiness;
        const pairedAt = (status === 'connected' && !inst.pairedAt) ? new Date() : null;

        // Sync no DB
        await database_1.prisma.$queryRawUnsafe(
            `UPDATE uazapi_instances SET
                status = $1,
                qr_data_url = $2,
                phone_number = COALESCE($3, phone_number),
                jid = COALESCE($4, jid),
                profile_name = COALESCE($5, profile_name),
                is_business = $6,
                paired_at = COALESCE($7, paired_at),
                updated_at = now()
             WHERE id = $8::uuid`,
            status, qrcode, phoneNumber, jid, profileName, isBusiness, pairedAt, inst.id
        );

        return reply.send({
            status,
            connected: !!stat.connected,
            loggedIn: !!stat.loggedIn,
            qrcode,
            phoneNumber,
            profileName,
            isBusiness,
        });
    });

    // ─── POST /:id/disconnect ───────────────────────────────────────────────
    app.post('/:id/disconnect', { preHandler: requireConnMgrOrAdmin }, async (req, reply) => {
        const { workspaceId } = req.leadUser;
        const { id } = req.params;
        const inst = await _findInstance(id, workspaceId);
        await uazapiClient.disconnect(inst.uazapiToken).catch(() => {});
        await database_1.prisma.$queryRawUnsafe(
            `UPDATE uazapi_instances SET status = 'disconnected', qr_data_url = NULL, updated_at = now()
             WHERE id = $1::uuid`,
            inst.id
        );
        return reply.send({ ok: true });
    });

    // ─── PATCH /:id/antiban ─────────────────────────────────────────────────
    app.patch('/:id/antiban', { preHandler: requireConnMgrOrAdmin }, async (req, reply) => {
        const { workspaceId } = req.leadUser;
        const { id } = req.params;
        const { enabled } = req.body || {};
        if (typeof enabled !== 'boolean') throw common_types_1.HttpError.badRequest('enabled (bool) obrigatório');
        const inst = await _findInstance(id, workspaceId);
        await database_1.prisma.$queryRawUnsafe(
            `UPDATE uazapi_instances SET antiban_enabled = $1, updated_at = now() WHERE id = $2::uuid`,
            enabled, inst.id
        );
        return reply.send({ ok: true, antibanEnabled: enabled });
    });

    // ─── DELETE /:id — soft delete (e reset na uazapi pra liberar slot) ─────
    app.delete('/:id', { preHandler: leads_middleware_1.requireLeadAdmin }, async (req, reply) => {
        const { workspaceId } = req.leadUser;
        const { id } = req.params;
        const inst = await _findInstance(id, workspaceId);
        // Reset na uazapi (logout + apaga auth — libera o "slot" pra outro número)
        await uazapiClient.reset(inst.uazapiToken).catch(() => {});
        await database_1.prisma.$queryRawUnsafe(
            `UPDATE uazapi_instances SET deleted_at = now(), status = 'deleted', updated_at = now()
             WHERE id = $1::uuid`,
            inst.id
        );
        return reply.status(204).send();
    });
}

// Helper — busca instância pelo id local, valida workspace
async function _findInstance(id, workspaceId) {
    const rows = await database_1.prisma.$queryRawUnsafe(
        `SELECT id, uazapi_id AS "uazapiId", uazapi_token AS "uazapiToken",
                name, status, phone_number AS "phoneNumber", jid, paired_at AS "pairedAt",
                antiban_enabled AS "antibanEnabled"
         FROM uazapi_instances
         WHERE id = $1::uuid AND workspace_id = $2::uuid AND deleted_at IS NULL
         LIMIT 1`,
        id, workspaceId
    );
    if (!rows?.length) throw common_types_1.HttpError.notFound('Instância uazapi não encontrada');
    return rows[0];
}
