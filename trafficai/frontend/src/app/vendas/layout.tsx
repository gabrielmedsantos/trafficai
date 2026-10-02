'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { RefreshCw, Plus } from 'lucide-react';
import { NovaFonteModal } from '@/components/vendas/NovaFonteModal';
import Sidebar from '@/components/Sidebar';
import { VendasProvider, useVendas, PERIODS, selectStyle, EmptyBox } from '@/components/vendas/shared';

const PAGES: Record<string, { title: string; subtitle: string; period: boolean }> = {
    '/vendas': { title: 'Resumo', subtitle: 'Faturamento, gastos e lucro das vendas atribuídas aos anúncios.', period: true },
    '/vendas/campanhas': { title: 'Campanhas', subtitle: 'Vendas, CPA e lucro por campanha, conjunto e anúncio — com status e orçamento da Meta ao vivo.', period: true },
    '/vendas/utms': { title: 'UTMs', subtitle: 'Vendas agrupadas por qualquer parâmetro UTM.', period: true },
    '/vendas/diario': { title: 'Relatório diário', subtitle: 'Resultado dia a dia no fuso de Brasília.', period: true },
    '/vendas/recuperacao': { title: 'Recuperação de vendas', subtitle: 'Carrinhos abandonados, Pix/boleto não pagos e pagamentos recusados — chame o cliente no WhatsApp.', period: true },
    '/vendas/pedidos': { title: 'Pedidos', subtitle: 'Todos os pedidos recebidos das plataformas de checkout.', period: true },
    '/vendas/custos': { title: 'Custos e impostos', subtitle: 'Imposto, custo de produto e despesas adicionais — entram no cálculo do lucro.', period: true },
    '/vendas/integracoes': { title: 'Integrações', subtitle: 'Conecte as plataformas de checkout pra receber as vendas.', period: false },
    '/vendas/pixel': { title: 'Pixel e UTMs', subtitle: 'Instalação do script, parâmetros dos anúncios e regras do evento de compra.', period: false },
    '/vendas/auditoria': { title: 'Auditoria', subtitle: 'Mapa de regiões, volume de eventos e perfil completo do usuário com payload enviado à Meta.', period: false },
};

const QUICK = ['today', 'yesterday', '7d', '30d', 'month'];
const QUICK_LABEL: Record<string, string> = { today: 'Hoje', yesterday: 'Ontem', '7d': '7 dias', '30d': '30 dias', month: 'Mês' };

function Header() {
    const pathname = usePathname() || '/vendas';
    const page = PAGES[pathname] || PAGES['/vendas'];
    const { sources, sourceId, setSourceId, periodKey, setPeriodKey, since, until, setCustomRange, reload, reloadSources } = useVendas();
    const router = useRouter();
    const [creating, setCreating] = useState(false);
    const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 };

    return (
        <div className="tai-rise" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>{page.title}</h1>
                    {pathname === '/vendas' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: 'var(--accent-green)', background: 'rgba(0,210,122,0.1)', border: '1px solid rgba(0,210,122,0.25)', padding: '3px 10px 3px 8px', borderRadius: 999 }}>
                            <span className="tai-live" style={{ width: 7, height: 7, borderRadius: 4, background: 'var(--accent-green)' }} />Ao vivo
                        </span>
                    )}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{page.subtitle}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label style={label}>
                    Fonte de tracking
                    <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={{ ...selectStyle, minWidth: 180 }}>
                        {sources.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                </label>
                <button type="button" className="btn btn-secondary" onClick={() => setCreating(true)} style={{ padding: '8px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={14} /> Nova fonte
                </button>
                {creating && (
                    <NovaFonteModal
                        sources={sources}
                        onClose={() => setCreating(false)}
                        onCreated={async (id) => {
                            setCreating(false);
                            await reloadSources(id);
                            router.push('/vendas/pixel');
                        }}
                    />
                )}
                {page.period && (
                    <>
                        <div role="radiogroup" aria-label="Período" style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                            {QUICK.map((k) => {
                                const on = periodKey === k;
                                return (
                                    <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setPeriodKey(k)} style={{
                                        border: 'none', cursor: 'pointer', padding: '7px 12px', borderRadius: 8, font: '600 12.5px var(--font-sans)',
                                        background: on ? 'var(--primary)' : 'transparent', color: on ? 'var(--bg-sidebar)' : 'var(--text-muted)',
                                        transition: 'background .15s, color .15s',
                                    }}>{QUICK_LABEL[k]}</button>
                                );
                            })}
                            <select aria-label="Outro período" value={QUICK.includes(periodKey) ? '' : periodKey} onChange={(e) => e.target.value && setPeriodKey(e.target.value)}
                                style={{ border: 'none', cursor: 'pointer', padding: '0 8px', borderRadius: 8, font: '600 12.5px var(--font-sans)', background: QUICK.includes(periodKey) ? 'transparent' : 'var(--primary)', color: QUICK.includes(periodKey) ? 'var(--text-muted)' : 'var(--bg-sidebar)' }}>
                                <option value="">Outro…</option>
                                {PERIODS.filter((p) => !QUICK.includes(p.key)).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                            </select>
                        </div>
                        {periodKey === 'custom' && (
                            <>
                                <label style={label}>
                                    De
                                    <input type="date" value={since} onChange={(e) => e.target.value && setCustomRange(e.target.value, until)} style={selectStyle} />
                                </label>
                                <label style={label}>
                                    Até
                                    <input type="date" value={until} onChange={(e) => e.target.value && setCustomRange(since, e.target.value)} style={selectStyle} />
                                </label>
                            </>
                        )}
                        <button type="button" className="btn btn-primary" onClick={reload} style={{ padding: '8px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <RefreshCw size={14} /> Atualizar
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

function Body({ children }: { children: React.ReactNode }) {
    const { sources, sourcesLoaded } = useVendas();
    if (sourcesLoaded && !sources.length) {
        return (
            <EmptyBox>
                Nenhuma fonte de tracking ainda. Clique em <b>Nova fonte</b> no topo e escolha a conta do cliente — ou crie em{' '}
                <Link href="/tracking" style={{ color: 'var(--accent-blue)' }}>Fontes e WhatsApp</Link> para configurar CRM e WhatsApp.
            </EmptyBox>
        );
    }
    return <>{children}</>;
}

export default function VendasLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content" style={{ minWidth: 0 }}>
                <VendasProvider>
                    <Header />
                    <Body>{children}</Body>
                </VendasProvider>
            </main>
        </div>
    );
}
