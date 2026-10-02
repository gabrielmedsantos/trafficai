// ==============================
// TrafficAI — O que cada conta pode usar além dos limites do plano.
// UazAPI: WhatsApp pago que roda na conta da Alfamax. Teste grátis usa só a
// Evolution (gratuita); assinatura paga ou cortesia libera. O admin do SaaS pode forçar
// liberar/bloquear por cliente (user_subscriptions.allow_uazapi).
// ==============================

import { loadIdentity } from '../auth/identity';
import { getUserSubscription } from './stripe.service';

export interface Entitlements {
    whatsapp_uazapi: boolean;
}

/** userId = dono dos dados (req.user.userId). */
export async function getEntitlements(userId: string): Promise<Entitlements> {
    const ident = await loadIdentity(userId);
    // Conta da Alfamax (admin) sempre pode tudo.
    if (ident?.role === 'admin' && !ident.ownerId) return { whatsapp_uazapi: true };
    const sub = await getUserSubscription(userId);
    if (sub?.allow_uazapi === true || sub?.allow_uazapi === false) return { whatsapp_uazapi: sub.allow_uazapi };
    // Pelo plano: só quem paga (ou ganhou cortesia). Teste grátis — de qualquer
    // plano, inclusive Elite em teste — fica só na Evolution.
    const courtesy = !!sub?.courtesy && (!sub.courtesy_until || new Date(sub.courtesy_until) > new Date());
    const paying = !!sub && sub.plan !== 'trial' && (sub.status === 'active' || sub.status === 'past_due');
    return { whatsapp_uazapi: paying || courtesy };
}

export const UAZAPI_BLOCKED_MESSAGE = 'A UazAPI está disponível nos planos pagos. No teste grátis, conecte o WhatsApp pela Evolution (gratuita).';
