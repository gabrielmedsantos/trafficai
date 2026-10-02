'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { api } from '@/lib/api';
import { useVendas, Card, CopyField, API_BASE, brtToday, shiftDate } from '@/components/vendas/shared';
import { SalesNotifyCard } from '@/components/vendas/SalesNotifyCard';

// Os caminhos dentro de cada plataforma mudam de vez em quando — por isso os
// passos dizem onde procurar e quais eventos marcar, sem depender de print.
const PLATFORMS: { key: string; name: string; steps: string[] }[] = [
    {
        key: 'kiwify', name: 'Kiwify',
        steps: [
            'Na Kiwify, abra Apps → Webhooks → Criar webhook.',
            'Cole a URL acima e escolha o produto (ou todos).',
            'Marque: Compra aprovada, Pix gerado, Boleto gerado, Carrinho abandonado, Compra recusada, Reembolso, Chargeback e, se vender assinatura, os 3 de assinatura.',
            'Salve e clique em Testar — o teste confirma a conexão sem entrar no relatório.',
        ],
    },
    {
        key: 'hotmart', name: 'Hotmart',
        steps: [
            'Na Hotmart, abra Ferramentas → Webhook (API e notificações) → Cadastrar webhook.',
            'Cole a URL acima, escolha a versão 2.0.0 e o produto (ou todos).',
            'Marque: Compra aprovada, Compra completa, Boleto/Pix impresso, Compra cancelada, Compra expirada, Compra reembolsada, Chargeback e Abandono de carrinho.',
            'Salve e envie o teste. A Hotmart não repassa UTMs: a campanha vem do clique pelo sck que o nosso pixel coloca no link.',
        ],
    },
    {
        key: 'eduzz', name: 'Eduzz',
        steps: [
            'No painel da Eduzz (MyEduzz), abra a área de Webhooks / Integrações e crie um webhook.',
            'Cole a URL acima.',
            'Marque os eventos de fatura: paga, aguardando pagamento, cancelada, expirada, reembolsada e chargeback — e o de carrinho abandonado.',
            'Salve e envie o teste. A Eduzz repassa as UTMs do link; o nosso pixel também coloca o trk pra ligar ao clique.',
        ],
    },
    {
        key: 'cakto', name: 'Cakto',
        steps: [
            'Na Cakto, abra Integrações → Webhooks → Adicionar.',
            'Cole a URL acima e escolha o produto (ou todos).',
            'Marque: Compra aprovada, Compra recusada, Pix gerado, Boleto gerado, Abandono de checkout, Reembolso e Chargeback (e os de assinatura, se tiver).',
            'Salve e envie o teste.',
        ],
    },
];

const GENERIC_EXAMPLE = `{
  "event": "order",
  "platform": "nome-da-plataforma",
  "order_id": "12345",
  "status": "approved",
  "value": 197.00,
  "net_value": 170.00,
  "product": "Nome do produto",
  "payment_method": "pix",
  "customer": { "name": "Maria Silva", "email": "maria@email.com", "phone": "5511999999999" },
  "utm_source": "FB",
  "utm_campaign": "{{campaign.name}}|{{campaign.id}}",
  "utm_medium": "{{adset.name}}|{{adset.id}}",
  "utm_content": "{{ad.name}}|{{ad.id}}",
  "sck": "valor do parâmetro sck do link"
}`;

const KNOWN = new Set(PLATFORMS.map((p) => p.key));

function Status({ last }: { last?: { at: string; count: number } }) {
    return last ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent-green)', fontWeight: 600 }}>
            <CheckCircle2 size={14} /> Recebendo
        </span>
    ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
            <Circle size={14} /> Aguardando 1º pedido
        </span>
    );
}

export default function IntegracoesPage() {
    const { sourceId, source } = useVendas();
    const [detail, setDetail] = useState<any>(null);
    const [lastByPlatform, setLastByPlatform] = useState<Record<string, { at: string; count: number }>>({});

    useEffect(() => {
        if (!sourceId) return;
        setDetail(null);
        api.getTrackingSource(sourceId).then(setDetail).catch(() => setDetail(null));
        api.getSalesOrders(sourceId, { since: shiftDate(brtToday(), -29), until: brtToday(), limit: '500' }).then((orders) => {
            const m: Record<string, { at: string; count: number }> = {};
            for (const o of orders || []) {
                const key = KNOWN.has(o.platform) ? o.platform : 'other';
                const cur = m[key];
                m[key] = { at: !cur || o.order_date > cur.at ? o.order_date : cur.at, count: (cur?.count || 0) + 1 };
            }
            setLastByPlatform(m);
        }).catch(() => setLastByPlatform({}));
    }, [sourceId]);

    const webhookUrl = source && detail?.webhook_secret ? `${API_BASE}/track/webhook/${source.public_token}?key=${detail.webhook_secret}` : '';
    const lastLine = (last?: { at: string; count: number }) => last && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
            {last.count} pedido(s) nos últimos 30 dias · último em {new Date(last.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </div>
    );

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, alignItems: 'start' }}>
            {sourceId && <SalesNotifyCard sourceId={sourceId} />}
            {PLATFORMS.map((p) => (
                <Card key={p.key} style={{ padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</div>
                        <Status last={lastByPlatform[p.key]} />
                    </div>
                    {lastLine(lastByPlatform[p.key])}
                    {webhookUrl
                        ? <CopyField label="URL do webhook (a mesma pra todas)" value={webhookUrl} masked />
                        : <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Carregando URL…</div>}
                    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                        {p.steps.map((s) => <li key={s}>{s}</li>)}
                    </ol>
                </Card>
            ))}
            <Card style={{ padding: '16px 18px', gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>Outras plataformas</div>
                    <Status last={lastByPlatform.other} />
                </div>
                {lastLine(lastByPlatform.other)}
                <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Monetizze, PerfectPay, Braip, Ticto, checkout próprio ou uma automação (n8n, Make, Zapier): mande um POST pra mesma URL
                    com este formato. O pedido entra em Vendas, Pedidos, Recuperação e nas notificações, e a venda aprovada vira Purchase na Meta.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
                    <div>
                        {webhookUrl && <CopyField label="URL do webhook" value={webhookUrl} masked />}
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                            <li><b>status</b>: approved, pending, refused, refunded, chargeback, canceled ou abandoned (carrinho).</li>
                            <li>Mande o mesmo <b>order_id</b> quando o status mudar (ex.: pending → approved) — o Purchase só sai uma vez.</li>
                            <li><b>value</b> em reais (197.00). <b>net_value</b> é opcional (o que você recebe).</li>
                            <li>UTMs e <b>sck</b> são opcionais, mas são eles que ligam a venda à campanha.</li>
                        </ul>
                    </div>
                    <CopyField label="Modelo do corpo (JSON)" value={GENERIC_EXAMPLE} multiline />
                </div>
            </Card>
        </div>
    );
}
