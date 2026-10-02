// ==============================
// TrafficAI — Identidade da requisição
// Quem está logado (actor) × de quem são os dados (userId):
//   - conta própria (dono da Alfamax ou cliente do SaaS): os dois são o mesmo;
//   - membro do time (users.owner_id): trabalha nos dados do dono;
//   - "Entrar como" (token com imp): o admin vê os dados do cliente.
// Papel e permissões sempre vêm de quem está logado, nunca do dono dos dados.
// ==============================

import { query } from '../database/connection';
import { logger } from '../shared/logger';

export interface Identity {
    ownerId: string | null;
    role: string;
    suspended: boolean;
}

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; value: Identity | null }>();
const seenAt = new Map<string, number>();

export function invalidateIdentity(userId: string): void {
    cache.delete(userId);
}

export async function loadIdentity(userId: string): Promise<Identity | null> {
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    let value: Identity | null;
    try {
        const [row] = await query<{ owner_id: string | null; role: string; suspended_at: string | null }>(
            `SELECT owner_id, role, suspended_at FROM users WHERE id = $1`, [userId]
        );
        value = row ? { ownerId: row.owner_id, role: row.role, suspended: !!row.suspended_at } : null;
    } catch {
        // Colunas novas ainda não migradas: comportamento antigo (conta própria).
        const [row] = await query<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [userId]).catch(() => []);
        value = row ? { ownerId: null, role: row.role, suspended: false } : null;
    }
    cache.set(userId, { at: Date.now(), value });
    touchLastSeen(userId);
    return value;
}

/** Último acesso — no máximo uma escrita a cada 5 min por usuário. */
function touchLastSeen(userId: string): void {
    const last = seenAt.get(userId) || 0;
    if (Date.now() - last < 5 * 60_000) return;
    seenAt.set(userId, Date.now());
    query(`UPDATE users SET last_seen_at = NOW() WHERE id = $1`, [userId])
        .catch((err: any) => logger.debug('last_seen_at não atualizado', { error: err.message }));
}
