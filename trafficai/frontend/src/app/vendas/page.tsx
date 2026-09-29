'use client';

import React from 'react';
import Link from 'next/link';
import {
    DollarSign, TrendingUp, TrendingDown, ShoppingCart, Clock, RotateCcw, AlertTriangle,
    Target, Receipt, Package, Landmark, Percent, Wallet, CreditCard,
} from 'lucide-react';
import {
    useSalesReport, useVendas, Card, Kpi, SectionTitle, ShareList, ErrorBox,
    brl, num2, pct, signColor, PAYMENT_LABEL, PAYMENT_COLOR, Row,
} from '@/components/vendas/shared';

export default function ResumoPage() {
    const { source } = useVendas();
    const { data, loading, error } = useSalesReport('day');
    const s = data?.summary;
    const days: Row[] = data?.rows || [];

    if (error) return <ErrorBox>{error}</ErrorBox>;
    if (!s) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{loading ? 'Carregando…' : ''}</div>;

    const funnelSteps = [
        { label: 'Cliques', value: s.funnel.clicks },
        { label: 'Vis. página', value: s.funnel.page_views },
        { label: 'Checkouts', value: s.funnel.initiate_checkout },
        { label: 'Vendas inic.', value: s.funnel.orders },
        { label: 'Vendas apr.', value: s.funnel.approved },
    ];
    const funnelMax = Math.max(1, ...funnelSteps.map((f) => f.value));
    const hourMax = Math.max(1, ...s.by_hour.map((h: any) => h.count));
    const dayMax = Math.max(1, ...days.map((d) => Math.max(d.revenue, d.spend)));
    const noOrders = s.total_orders === 0;

    return (
        <div style={{ opacity: loading ? 0.65 : 1, transition: 'opacity .15s' }}>
            {source && !source.account_id && (
                <Card style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--accent-yellow)' }}>
                    Essa fonte não tem conta de anúncio vinculada — gastos, ROAS e CPA ficam zerados. Vincule em Fontes e WhatsApp → Editar credenciais.
                </Card>
            )}
            {noOrders && (
                <Card style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    Nenhum pedido recebido nesse período. Se ainda não configurou, conecte a plataforma de checkout em{' '}
                    <Link href="/vendas/integracoes" style={{ color: 'var(--accent-blue)' }}>Integrações</Link> e instale o{' '}
                    <Link href="/vendas/pixel" style={{ color: 'var(--accent-blue)' }}>pixel</Link> na página de vendas.
                </Card>
            )}

            {/* Linha 1 — o que importa */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginBottom: 10 }}>
                <Kpi icon={<DollarSign size={14} />} label="Faturamento líquido" value={brl(s.revenue_net)} hint={`Bruto ${brl(s.revenue_gross)}`} />
                <Kpi icon={<Target size={14} />} label="Gastos com anúncios" value={brl(s.spend)} hint={s.spend_live ? 'Meta ao vivo' : 'Última sincronização'} />
                <Kpi icon={s.roas != null && s.roas >= 1 ? <TrendingUp size={14} /> : <TrendingDown size={14} />} label="ROAS" value={num2(s.roas)}
                    color={s.roas == null ? undefined : s.roas >= 1 ? 'var(--accent-green)' : 'var(--accent-red)'} />
                <Kpi icon={<Wallet size={14} />} label="Lucro" value={brl(s.profit)} color={signColor(s.profit)} hint={`Custos totais ${brl(s.total_costs)}`} />
            </div>

            {/* Linha 2 — volume e qualidade */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 10 }}>
                <Kpi icon={<ShoppingCart size={14} />} label="Vendas aprovadas" value={String(s.approved_count)} hint={`Ticket ${brl(s.ticket)}`} color="var(--accent-green)" />
                <Kpi icon={<Receipt size={14} />} label="CPA" value={brl(s.cpa)} />
                <Kpi icon={<Clock size={14} />} label="Vendas pendentes" value={brl(s.pending_value)} hint={`${s.pending_count} pedido(s)`} color="var(--accent-yellow)" />
                <Kpi icon={<Percent size={14} />} label="ROI" value={num2(s.roi)} color={signColor(s.roi)} />
                <Kpi icon={<Percent size={14} />} label="Margem" value={pct(s.margin)} color={signColor(s.margin)} />
            </div>

            {/* Linha 3 — custos e perdas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
                <Kpi icon={<Package size={14} />} label="Custos de produto" value={brl(s.product_cost)} />
                <Kpi icon={<Receipt size={14} />} label="Despesas adicionais" value={brl(s.expenses)} />
                <Kpi icon={<Landmark size={14} />} label="Imposto" value={brl(s.tax)} hint={`${pct(s.tax_rate)} do líquido`} />
                <Kpi icon={<CreditCard size={14} />} label="Taxas da plataforma" value={brl(s.fees)} hint="Bruto − líquido" />
                <Kpi icon={<RotateCcw size={14} />} label="Reembolsadas" value={brl(s.refunded_value)} hint={`${s.refunded_count} pedido(s)`} color={s.refunded_count ? 'var(--accent-red)' : undefined} />
                <Kpi icon={<AlertTriangle size={14} />} label="Chargeback" value={pct(s.chargeback_rate)} hint={`${s.chargeback_count} · ${brl(s.chargeback_value)}`} color={s.chargeback_count ? 'var(--accent-red)' : undefined} />
            </div>

            {/* Faturamento × gastos por dia */}
            {days.length > 1 && (
                <Card style={{ marginBottom: 14 }}>
                    <SectionTitle right={
                        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--accent-green)', marginRight: 4 }} />Faturamento</span>
                            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--accent-blue)', marginRight: 4 }} />Gastos</span>
                        </div>
                    }>Faturamento × gastos por dia</SectionTitle>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: days.length > 20 ? 2 : 6, height: 150 }}>
                        {days.map((d) => (
                            <div key={d.key} title={`${new Date(`${d.key}T12:00:00Z`).toLocaleDateString('pt-BR')}\nFaturamento ${brl(d.revenue)}\nGastos ${brl(d.spend)}\nLucro ${brl(d.profit)}`}
                                style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 1, height: '100%' }}>
                                <div style={{ flex: 1, height: `${d.revenue ? Math.max(2, (d.revenue / dayMax) * 100) : 0}%`, background: 'var(--accent-green)', borderRadius: '2px 2px 0 0' }} />
                                <div style={{ flex: 1, height: `${d.spend ? Math.max(2, (d.spend / dayMax) * 100) : 0}%`, background: 'var(--accent-blue)', borderRadius: '2px 2px 0 0' }} />
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                        <span>{new Date(`${days[0].key}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                        <span>{new Date(`${days[days.length - 1].key}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                    </div>
                </Card>
            )}

            {/* Distribuições */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 10, marginBottom: 14 }}>
                <Card>
                    <SectionTitle>Vendas por pagamento</SectionTitle>
                    <ShareList empty="Sem vendas aprovadas no período."
                        items={s.by_payment.filter((p: any) => p.approved_count > 0).map((p: any) => ({
                            label: PAYMENT_LABEL[p.method] || p.method, count: p.approved_count, pct: p.share, color: PAYMENT_COLOR[p.method], extra: brl(p.approved_value),
                        }))} />
                </Card>
                <Card>
                    <SectionTitle right={s.approval_rate != null && <span className="num" style={{ fontSize: 12, fontWeight: 700 }}>{pct(s.approval_rate)} geral</span>}>Taxa de aprovação</SectionTitle>
                    <ShareList empty="Sem pedidos no período."
                        items={s.by_payment.filter((p: any) => p.approval_rate != null).map((p: any) => ({
                            label: PAYMENT_LABEL[p.method] || p.method, count: p.approved_count, pct: p.approval_rate, color: PAYMENT_COLOR[p.method],
                        }))} />
                </Card>
                <Card>
                    <SectionTitle>Vendas por produto</SectionTitle>
                    <ShareList empty="Sem vendas aprovadas no período." items={s.by_product.map((p: any) => ({ label: p.product, count: p.count, pct: p.pct, color: 'var(--accent-green)', extra: brl(p.value) }))} />
                </Card>
                <Card>
                    <SectionTitle>Vendas por fonte</SectionTitle>
                    <ShareList empty="Sem vendas aprovadas no período." items={s.by_source.map((p: any) => ({ label: p.source, count: p.count, pct: p.pct, color: 'var(--accent-blue)' }))} />
                </Card>
            </div>

            {/* Funil + horário */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 10 }}>
                <Card>
                    <SectionTitle>Funil de conversão</SectionTitle>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${funnelSteps.length}, 1fr)`, gap: 8, alignItems: 'end' }}>
                        {funnelSteps.map((f, i) => {
                            const prev = i > 0 ? funnelSteps[i - 1].value : null;
                            return (
                                <div key={f.label} style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', minHeight: 14 }}>{prev ? pct((f.value / prev) * 100) : ''}</div>
                                    <div style={{ height: 90, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                                        <div style={{ width: '70%', height: `${Math.max(3, (f.value / funnelMax) * 100)}%`, background: 'var(--accent-blue)', opacity: 0.35 + (0.65 * (i + 1)) / funnelSteps.length, borderRadius: '4px 4px 0 0' }} />
                                    </div>
                                    <div className="num" style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{f.value.toLocaleString('pt-BR')}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.label}</div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
                <Card>
                    <SectionTitle>Vendas por horário</SectionTitle>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 130 }}>
                        {s.by_hour.map((h: any) => (
                            <div key={h.hour} title={`${String(h.hour).padStart(2, '0')}h — ${h.count} venda(s) · ${h.pct.toFixed(1)}%`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                                <div style={{ height: `${h.count ? Math.max(4, (h.count / hourMax) * 100) : 1}%`, background: h.count ? 'var(--accent-blue)' : 'var(--border)', borderRadius: '3px 3px 0 0' }} />
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                        <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span>
                    </div>
                </Card>
            </div>
        </div>
    );
}
