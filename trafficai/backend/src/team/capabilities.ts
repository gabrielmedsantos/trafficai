// ==============================
// TrafficAI — Permissão de equipe por funcionalidade
// ==============================

import { Request, Response, NextFunction } from 'express';
import { query } from '../database/connection';

export const CAPABILITIES = [
    { key: 'meta_campaigns', label: 'Gerenciar Campanhas Meta' },
    { key: 'google_campaigns', label: 'Gerenciar Campanhas Google' },
    { key: 'ai_agent', label: 'Acesso ao Agente IA' },
    { key: 'compiled_data', label: 'Dados Compilados' },
    { key: 'creatives', label: 'Criativos' },
    { key: 'metrics', label: 'Métricas' },
    { key: 'balance_alerts', label: 'Alerta de Saldo' },
    { key: 'dashboard_share', label: 'Compartilhar Dashboard' },
    { key: 'whatsapp_connections', label: 'Conexões WhatsApp' },
] as const;

export type CapabilityKey = typeof CAPABILITIES[number]['key'];

interface CapableUser {
    role?: string;
    capabilities?: string[] | null;
}

/**
 * capabilities === null/undefined => sem restrição (default, preserva comportamento
 * pré-existente pra quem nunca foi configurado). Array define uma allow-list explícita
 * — inclusive vazia, que bloqueia todas as capacidades gateadas.
 */
export function hasCapability(user: CapableUser, cap: CapabilityKey): boolean {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.capabilities == null) return true;
    return user.capabilities.includes(cap);
}

export function requireCapability(cap: CapabilityKey) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = (req as any).user?.userId;
            const rows = await query<CapableUser>(`SELECT role, capabilities FROM users WHERE id = $1`, [userId]);
            const user = rows[0];
            if (!user || !hasCapability(user, cap)) {
                res.status(403).json({ success: false, error: { message: 'Você não tem permissão para esta ação' } });
                return;
            }
            next();
        } catch (error: any) {
            res.status(500).json({ success: false, error: { message: 'Erro interno ao checar permissão' } });
        }
    };
}
