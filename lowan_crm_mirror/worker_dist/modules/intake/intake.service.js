"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntakeService = void 0;

const database_1 = require("../../config/database");
const kanban_service_1 = require("../../modules/kanban/kanban.service");
const crypto = require("crypto");

const UTM_FIELDS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'fbclid', 'gclid', 'landing_url', 'referrer'
];

function rowToUtm(row) {
    if (!row) return null;
    return {
        utmSource: row.utm_source || null,
        utmMedium: row.utm_medium || null,
        utmCampaign: row.utm_campaign || null,
        utmContent: row.utm_content || null,
        utmTerm: row.utm_term || null,
        fbclid: row.fbclid || null,
        gclid: row.gclid || null,
        landingUrl: row.landing_url || null,
        referrer: row.referrer || null,
        utmCapturedAt: row.utm_captured_at || null,
        marketingMeta: row.marketing_meta || null,
    };
}

function normalizePhoneE164(raw) {
    if (!raw) return null;
    let digits = String(raw).replace(/\D/g, '');
    // BR: garante 55 + DDD + 9 + 8 dígitos
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
        if (digits.length === 12) digits = digits.slice(0,4) + '9' + digits.slice(4);
        return digits;
    }
    if (digits.length === 11) return '55' + digits;
    if (digits.length === 10) return '55' + digits.slice(0,2) + '9' + digits.slice(2);
    return digits || null;
}

function snakeToCamel(input) {
    // Aceita tanto snake_case quanto camelCase no payload
    return {
        utm_source:  input.utm_source  ?? input.utmSource  ?? null,
        utm_medium:  input.utm_medium  ?? input.utmMedium  ?? null,
        utm_campaign: input.utm_campaign ?? input.utmCampaign ?? null,
        utm_content: input.utm_content ?? input.utmContent ?? null,
        utm_term:    input.utm_term    ?? input.utmTerm    ?? null,
        fbclid:      input.fbclid      ?? null,
        gclid:       input.gclid       ?? null,
        landing_url: input.landing_url ?? input.landingUrl ?? null,
        referrer:    input.referrer    ?? null,
        marketing_meta: input.marketing_meta ?? input.marketingMeta ?? null,
    };
}


async function findContactByPhoneFlexible(workspaceId, phoneNorm) {
    if (!phoneNorm) return null;
    // 1) Match exato pelo phone_normalized
    let rows = await database_1.prisma.$queryRawUnsafe(
        `SELECT id, name, phone_normalized FROM contacts
         WHERE workspace_id = $1::uuid AND phone_normalized = $2 LIMIT 1`,
        workspaceId, phoneNorm);
    if (rows.length) return rows[0];

    // 2) Match por sufixo (últimos 8 dígitos) — resolve bug Meta com DDD 51, 21, 11 onde
    //    WhatsApp inbound vem sem o 9 inicial enquanto intake/LP envia com 9.
    if (phoneNorm.length >= 10) {
        const suffix8 = phoneNorm.slice(-8);
        const suffix9 = phoneNorm.length >= 11 ? phoneNorm.slice(-9) : null;
        if (suffix9) {
            rows = await database_1.prisma.$queryRawUnsafe(
                `SELECT id, name, phone_normalized FROM contacts
                 WHERE workspace_id = $1::uuid AND phone_normalized LIKE $2
                 ORDER BY length(phone_normalized) DESC LIMIT 1`,
                workspaceId, '%' + suffix9);
            if (rows.length) return rows[0];
        }
        rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT id, name, phone_normalized FROM contacts
             WHERE workspace_id = $1::uuid AND phone_normalized LIKE $2
             ORDER BY length(phone_normalized) DESC LIMIT 1`,
            workspaceId, '%' + suffix8);
        if (rows.length) return rows[0];
    }
    return null;
}

class IntakeService {

    // ── Workspace token ─────────────────────────────────────────────
    async getOrCreateToken(workspaceId) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT intake_token FROM workspaces WHERE id = $1::uuid LIMIT 1`,
            workspaceId);
        let tok = rows[0]?.intake_token;
        if (!tok) {
            tok = crypto.randomBytes(32).toString('hex');
            await database_1.prisma.$queryRawUnsafe(
                `UPDATE workspaces SET intake_token = $1, updated_at = now() WHERE id = $2::uuid`,
                tok, workspaceId);
        }
        return tok;
    }

    async regenerateToken(workspaceId) {
        const tok = crypto.randomBytes(32).toString('hex');
        await database_1.prisma.$queryRawUnsafe(
            `UPDATE workspaces SET intake_token = $1, updated_at = now() WHERE id = $2::uuid`,
            tok, workspaceId);
        return tok;
    }

    async resolveWorkspaceByToken(token) {
        if (!token) return null;
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT id, name FROM workspaces WHERE intake_token = $1 LIMIT 1`,
            token);
        return rows[0] || null;
    }

    // ── Get UTM dum lead ────────────────────────────────────────────
    async getLeadUtm(workspaceId, leadId) {
        const rows = await database_1.prisma.$queryRawUnsafe(
            `SELECT utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                    fbclid, gclid, landing_url, referrer, utm_captured_at, marketing_meta
             FROM leads WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
            leadId, workspaceId);
        return rowToUtm(rows[0]);
    }

    // ── Atualizar UTM de lead existente (admin) ─────────────────────
    async updateLeadUtm(workspaceId, leadId, input) {
        const data = snakeToCamel(input || {});
        const fields = [];
        const values = [];
        let p = 1;
        for (const [col, val] of Object.entries(data)) {
            if (col === 'marketing_meta') {
                if (val !== null && val !== undefined) {
                    fields.push(`${col} = $${p}::jsonb`);
                    values.push(JSON.stringify(val));
                    p++;
                }
            } else if (val !== undefined) {
                fields.push(`${col} = $${p}`);
                values.push(val || null);
                p++;
            }
        }
        if (!fields.length) {
            return await this.getLeadUtm(workspaceId, leadId);
        }
        // Sempre atualiza captured_at
        fields.push(`utm_captured_at = COALESCE(utm_captured_at, now())`);
        values.push(leadId);
        values.push(workspaceId);

        const sql = `UPDATE leads SET ${fields.join(', ')}, updated_at = now()
                     WHERE id = $${p}::uuid AND workspace_id = $${p+1}::uuid
                     RETURNING utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                               fbclid, gclid, landing_url, referrer, utm_captured_at, marketing_meta`;
        const rows = await database_1.prisma.$queryRawUnsafe(sql, ...values);
        return rowToUtm(rows[0]);
    }

    async clearLeadUtm(workspaceId, leadId) {
        await database_1.prisma.$queryRawUnsafe(
            `UPDATE leads SET
                utm_source = NULL, utm_medium = NULL, utm_campaign = NULL,
                utm_content = NULL, utm_term = NULL, fbclid = NULL, gclid = NULL,
                landing_url = NULL, referrer = NULL, marketing_meta = NULL,
                utm_captured_at = NULL, updated_at = now()
             WHERE id = $1::uuid AND workspace_id = $2::uuid`,
            leadId, workspaceId);
        return { ok: true };
    }

    // ── INTAKE: criar/atualizar lead via API pública ────────────────
    async intakeLead(workspaceId, payload) {
        if (!payload?.phone && !payload?.telephone) {
            throw new Error('phone obrigatório');
        }
        const phone = String(payload.phone || payload.telephone).trim();
        const phoneNorm = normalizePhoneE164(phone);
        if (!phoneNorm) throw new Error('phone inválido');

        const name = (payload.name || payload.full_name || phone).toString().trim().slice(0, 255);
        const utm = snakeToCamel(payload);

        // 1) Find or create contact (com matching flexível por sufixo)
        const existingContact = await findContactByPhoneFlexible(workspaceId, phoneNorm);
        let contactId;
        if (existingContact) {
            contactId = existingContact.id;
        } else {
            const contactRows = await database_1.prisma.$queryRawUnsafe(
                `INSERT INTO contacts (id, workspace_id, name, phone, phone_normalized, origin, opt_in, is_blacklisted, custom_variables, created_at, updated_at)
                 VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, 'intake', false, false, '{}'::jsonb, now(), now())
                 RETURNING id`,
                workspaceId, name, phone, phoneNorm);
            contactId = contactRows[0].id;
        }

        // 2) Find existing lead by contact in workspace
        const existing = await database_1.prisma.$queryRawUnsafe(
            `SELECT id, name FROM leads WHERE workspace_id = $1::uuid AND contact_id = $2::uuid LIMIT 1`,
            workspaceId, contactId);

        let leadId, isNew;
        if (existing.length) {
            leadId = existing[0].id;
            isNew = false;
            // Atualiza UTM apenas se vazio (não sobrescreve atribuição original)
            const existingUtm = await database_1.prisma.$queryRawUnsafe(
                `SELECT utm_source FROM leads WHERE id = $1::uuid LIMIT 1`, leadId);
            const hasUtm = !!existingUtm[0]?.utm_source;
            if (!hasUtm) {
                await this.updateLeadUtm(workspaceId, leadId, utm);
            }
        } else {
            // Cria lead novo com UTM
            const leadRows = await database_1.prisma.$queryRawUnsafe(
                `INSERT INTO leads (
                    id, workspace_id, name, phone, status, origin, contact_id,
                    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                    fbclid, gclid, landing_url, referrer, marketing_meta, utm_captured_at,
                    created_at, updated_at, unread_count
                ) VALUES (
                    gen_random_uuid(), $1::uuid, $2, $3, 'disponivel', $4, $5::uuid,
                    $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15::jsonb, now(),
                    now(), now(), 0
                ) RETURNING id`,
                workspaceId, name, phone,
                payload.origin || 'intake_api',
                contactId,
                utm.utm_source, utm.utm_medium, utm.utm_campaign, utm.utm_content, utm.utm_term,
                utm.fbclid, utm.gclid, utm.landing_url, utm.referrer,
                JSON.stringify(utm.marketing_meta || {}));
            leadId = leadRows[0].id;
            isNew = true;
            // Auto-assign: aplica regra de distribuição automática (igual webhook faz)
            try {
                kanban_service_1.KanbanService.applyAutoAssignRules(workspaceId, leadId, null)
                    .catch(() => {});
            } catch {}
        }

        return {
            ok: true,
            leadId,
            contactId,
            isNew,
            utm: await this.getLeadUtm(workspaceId, leadId),
        };
    }
}

exports.IntakeService = IntakeService;
