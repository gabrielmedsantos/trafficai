'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { VendasProvider, useVendas, PERIODS, selectStyle, EmptyBox } from '@/components/vendas/shared';

const PAGES: Record<string, { title: string; subtitle: string; period: boolean }> = {
    '/vendas': { title: 'Resumo', subtitle: 'Faturamento, gastos e lucro das vendas atribuídas aos anúncios.', period: true },
    '/vendas/campanhas': { title: 'Campanhas', subtitle: 'Vendas, CPA e lucro por campanha, conjunto e anúncio — com status e orçamento da Meta ao vivo.', period: true },
    '/vendas/utms': { title: 'UTMs', subtitle: 'Vendas agrupadas por qualquer parâmetro UTM.', period: true },
    '/vendas/diario': { title: 'Relatório diário', subtitle: 'Resultado dia a dia no fuso de Brasília.', period: true },
    '/vendas/pedidos': { title: 'Pedidos', subtitle: 'Todos os pedidos recebidos das plataformas de checkout.', period: true },
    '/vendas/custos': { title: 'Custos e impostos', subtitle: 'Imposto, custo de produto e despesas adicionais — entram no cálculo do lucro.', period: true },
    '/vendas/integracoes': { title: 'Integrações', subtitle: 'Conecte as plataformas de checkout pra receber as vendas.', period: false },
    '/vendas/pixel': { title: 'Pixel e UTMs', subtitle: 'Instalação do script, parâmetros dos anúncios e regras do evento de compra.', period: false },
};

function Header() {
    const pathname = usePathname() || '/vendas';
    const page = PAGES[pathname] || PAGES['/vendas'];
    const { sources, sourceId, setSourceId, periodKey, setPeriodKey, since, until, setCustomRange, reload } = useVendas();
    const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 };

    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{page.title}</h1>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{page.subtitle}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label style={label}>
                    Fonte de tracking
                    <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={{ ...selectStyle, minWidth: 180 }}>
                        {sources.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                </label>
                {page.period && (
                    <>
                        <label style={label}>
                            Período
                            <select value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} style={{ ...selectStyle, minWidth: 160 }}>
                                {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                            </select>
                        </label>
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
                Nenhuma fonte de tracking ainda. Crie uma em <Link href="/tracking" style={{ color: 'var(--accent-blue)' }}>Fontes e WhatsApp</Link> e
                vincule a conta de anúncio do cliente.
            </EmptyBox>
        );
    }
    return <>{children}</>;
}

export default function VendasLayout({ children }: { children: React.ReactNode }) {
    return (
        <VendasProvider>
            <div style={{ padding: '24px 28px', maxWidth: 1480, margin: '0 auto' }}>
                <Header />
                <Body>{children}</Body>
            </div>
        </VendasProvider>
    );
}
