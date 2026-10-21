import { Request, Response, NextFunction } from 'express';
import { query } from '../database/connection';
import { actorIdOf } from '../auth/auth.middleware';

// Sharing is tied to one advertising account; it never changes users.owner_id.
// Resolve the data owner only after validating the exact requested resource.
export function sharedAccountReadAccess(kind: 'tracking' | 'quiz' | 'meta') {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            let rows: { user_id: string }[] = [];
            if (kind !== 'meta') {
                const source = req.path.match(/^\/sources\/([a-f0-9-]{36})(?:\/|$)/i)?.[1];
                const event = kind === 'tracking' ? req.path.match(/^\/events\/([a-f0-9-]{36})(?:\/|$)/i)?.[1] : undefined;
                if (!source && !event) return next();
                rows = await query(`SELECT s.user_id FROM tracking_sources s
                    JOIN account_read_access g ON g.account_id=s.account_id
                    WHERE ${source ? 's.id=$1' : 'EXISTS(SELECT 1 FROM tracking_events e WHERE e.id=$1 AND e.source_id=s.id)'} AND g.user_id=$2`, [source || event, actorIdOf(req)]);
            } else {
                const account = typeof req.query.account_id === 'string' ? req.query.account_id : '';
                const campaign = typeof req.query.campaign_id === 'string' ? req.query.campaign_id : '';
                if (account) rows = await query(`SELECT a.user_id FROM ad_accounts a
                    LEFT JOIN account_read_access g ON g.account_id=a.id AND g.user_id=$2
                    WHERE (a.id::text=$1 OR a.meta_account_id=$1) AND (g.user_id IS NOT NULL OR a.user_id=$3)`, [account, actorIdOf(req), req.user!.userId]);
                else if (campaign) rows = await query(`SELECT a.user_id FROM campaigns c
                    JOIN ad_accounts a ON a.id=c.account_id LEFT JOIN account_read_access g ON g.account_id=a.id AND g.user_id=$2
                    WHERE (c.id::text=$1 OR c.meta_campaign_id=$1) AND (g.user_id IS NOT NULL OR a.user_id=$3)`, [campaign, actorIdOf(req), req.user!.userId]);
                if ((account || campaign) && !rows.length) return res.status(404).json({ success: false, error: { message: 'Conta não compartilhada.' } });
                if (rows[0]?.user_id === req.user!.userId) return next();
            }
            if (!rows.length) return next();
            // Entregas: quem recebeu o compartilhamento da conta também prepara, envia e conclui o entregável
            // do pedido. O resto continua só para visualização, e o histórico registra quem agiu.
            const deliveryAction = kind === 'tracking' && req.method === 'POST'
                && /^\/sources\/[a-f0-9-]{36}\/orders\/[a-f0-9-]{36}\/delivery\/(generate|send|complete|complete-manual)$/i.test(req.path);
            if (req.method !== 'GET' && !deliveryAction) return res.status(403).json({ success: false, error: { message: 'Esta operação foi compartilhada para visualização.' } });
            if (deliveryAction) req.user!.actorId = actorIdOf(req);
            // External integrations/credentials are not part of a viewing grant.
            if (/\/crm\//.test(req.path)) return res.status(403).json({ success: false, error: { message: 'Integração não compartilhada.' } });
            req.user!.userId = rows[0].user_id;
            if (kind === 'tracking' && /^\/sources\/[a-f0-9-]{36}$/i.test(req.path)) {
                const json = res.json.bind(res);
                res.json = (body: any) => {
                    if (body?.data) {
                        body = { ...body, data: { ...body.data } };
                        for (const key of Object.keys(body.data)) {
                            if (/token|secret|password/i.test(key) && key !== 'public_token') delete body.data[key];
                        }
                    }
                    return json(body);
                };
            }
            next();
        } catch (error) { next(error); }
    };
}

export async function visibleAccounts(userId: string, activeOnly = false) {
    return query(`SELECT selected.* FROM (SELECT DISTINCT ON(a.meta_account_id) a.* FROM ad_accounts a
        LEFT JOIN account_read_access g ON g.account_id=a.id AND g.user_id=$1
        WHERE (a.user_id=$1 OR g.user_id IS NOT NULL)
        ${activeOnly ? 'AND a.is_client_active=true' : ''}
        ORDER BY a.meta_account_id,(g.user_id IS NOT NULL) DESC) selected ORDER BY selected.account_name`, [userId]);
}
