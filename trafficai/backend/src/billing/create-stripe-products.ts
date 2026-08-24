// ==============================
// Script one-shot pra criar os 4 produtos + preços na Stripe.
// Rode com: node dist/billing/create-stripe-products.js
// Requer: STRIPE_SECRET_KEY no env
// Output: linhas STRIPE_PRICE_ID_XXX=... pra colar no .env
// ==============================

import Stripe from 'stripe';

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) { console.error('❌ STRIPE_SECRET_KEY não configurada'); process.exit(1); }
const stripe = new Stripe(KEY, { apiVersion: '2024-04-10' as any });

interface PlanDef {
    id: string;                    // slug interno
    name: string;                  // nome exibido
    description: string;
    priceBRL: number;              // valor em reais
    metadata: Record<string, string>;
}

const PLANS: PlanDef[] = [
    {
        id: 'starter',
        name: 'TrafficAI Starter',
        description: 'Até 5 clientes · 50 créditos IA/mês · 1 usuário · Relatórios WhatsApp · Alerta de saldo',
        priceBRL: 101,
        metadata: { plan: 'starter', max_clients: '5', max_seats: '1', ai_credits: '50' },
    },
    {
        id: 'pro',
        name: 'TrafficAI Pro',
        description: 'Até 20 clientes · 300 créditos IA/mês · 3 usuários · Automação SE/ENTÃO · CAPI + Kommo · Meta Actions no painel',
        priceBRL: 197,
        metadata: { plan: 'pro', max_clients: '20', max_seats: '3', ai_credits: '300' },
    },
    {
        id: 'agency',
        name: 'TrafficAI Agency',
        description: 'Até 50 clientes · 600 créditos IA/mês · 5 usuários · Google Ads MCC · Drive+Agenda · CRM Comercial · Aprovação de relatórios',
        priceBRL: 317,
        metadata: { plan: 'agency', max_clients: '50', max_seats: '5', ai_credits: '600' },
    },
    {
        id: 'elite',
        name: 'TrafficAI Elite',
        description: 'Até 100 clientes · 1.200 créditos IA/mês · 7 usuários · Templates library · Landing branded · API dedicada · Suporte VIP',
        priceBRL: 437,
        metadata: { plan: 'elite', max_clients: '100', max_seats: '7', ai_credits: '1200' },
    },
];

async function createOrGetProduct(plan: PlanDef): Promise<Stripe.Product> {
    // Busca produto existente por metadata.plan (idempotente)
    const existing = await stripe.products.list({ limit: 100, active: true });
    const found = existing.data.find(p => p.metadata?.plan === plan.id);
    if (found) {
        console.log(`  ✓ Produto ${plan.id} já existe: ${found.id}`);
        // Atualiza metadata + descrição caso tenha mudado
        return await stripe.products.update(found.id, {
            name: plan.name,
            description: plan.description,
            metadata: plan.metadata,
        });
    }
    const p = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: plan.metadata,
    });
    console.log(`  ✨ Produto ${plan.id} criado: ${p.id}`);
    return p;
}

async function createOrGetPrice(product: Stripe.Product, plan: PlanDef): Promise<Stripe.Price> {
    // Busca preço ativo pra esse produto em BRL + valor + mensal
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 20 });
    const found = prices.data.find(pr =>
        pr.currency === 'brl' &&
        pr.unit_amount === plan.priceBRL * 100 &&
        pr.recurring?.interval === 'month'
    );
    if (found) {
        console.log(`  ✓ Preço R$ ${plan.priceBRL}/mês já existe: ${found.id}`);
        return found;
    }
    const p = await stripe.prices.create({
        product: product.id,
        currency: 'brl',
        unit_amount: plan.priceBRL * 100,
        recurring: { interval: 'month' },
        metadata: { plan: plan.id },
    });
    console.log(`  ✨ Preço R$ ${plan.priceBRL}/mês criado: ${p.id}`);
    return p;
}

(async () => {
    console.log('🚀 Criando/atualizando produtos e preços TrafficAI na Stripe...\n');
    const envLines: string[] = [];

    for (const plan of PLANS) {
        console.log(`\n📦 ${plan.name} (R$ ${plan.priceBRL}/mês):`);
        const product = await createOrGetProduct(plan);
        const price = await createOrGetPrice(product, plan);
        envLines.push(`STRIPE_PRICE_ID_${plan.id.toUpperCase()}=${price.id}`);
    }

    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('✅ TUDO PRONTO! Cole essas linhas no seu .env.production:');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(envLines.join('\n'));
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('Depois:');
    console.log('  1. Reinicie o backend');
    console.log('  2. Configure webhook na Stripe Dashboard → Developers → Webhooks');
    console.log('     URL: https://api.alfamaxdigital.com.br/api/v1/billing/webhook');
    console.log('     Eventos: customer.subscription.*, invoice.payment_*');
    console.log('     Copie signing secret pro STRIPE_WEBHOOK_SECRET');
    console.log('═══════════════════════════════════════════════════════\n');
})().catch(err => {
    console.error('❌ Falhou:', err.message);
    process.exit(1);
});
