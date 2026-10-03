'use client';

import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useVendas, Card, SectionTitle, CopyField, ErrorBox, API_BASE, META_UTM_TEMPLATE } from '@/components/vendas/shared';

export default function PixelPage() {
    const { sourceId, source } = useVendas();
    const [settings, setSettings] = useState<any>(null);
    const [products, setProducts] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!sourceId) return;
        setSettings(null);
        api.getSalesSettings(sourceId).then((r) => {
            setSettings(r.settings);
            setProducts(Array.from(new Set([...(r.products || []).map(p => p.product_name), ...(r.settings.purchase_products || [])])));
        }).catch((e) => setError(e.message || 'Erro ao carregar'));
    }, [sourceId]);

    async function save() {
        setSaving(true); setError(''); setSaved(false);
        try {
            const r = await api.updateSalesSettings(sourceId, { purchase_value: settings.purchase_value, purchase_products: settings.purchase_products });
            setSettings(r);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e: any) {
            setError(e.message || 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    }

    if (!source) return null;
    const pixelSnippet = `<script>(function(){if(!window.fbq){window.fbq=function(){window.fbq.callMethod?window.fbq.callMethod.apply(window.fbq,arguments):window.fbq.queue.push(arguments)};window.fbq.push=window.fbq;window.fbq.loaded=!0;window.fbq.version='2.0';window.fbq.queue=[];window._fbq=window.fbq}var s=document.createElement('script');s.src='${API_BASE}/track/pixel/${source.public_token}.js';s.async=true;s.defer=true;(document.head||document.documentElement).appendChild(s)})();</script>`;
    const selected: string[] = settings?.purchase_products || [];
    const toggleProduct = (name: string) => setSettings((s: any) => ({
        ...s, purchase_products: selected.includes(name) ? selected.filter(p => p !== name) : [...selected, name],
    }));
    const radio: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, cursor: 'pointer', marginBottom: 8 };

    return (
        <>
            {error && <ErrorBox>{error}</ErrorBox>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 12, alignItems: 'start' }}>
                <Card flat style={{ padding: '16px 18px' }}>
                    <SectionTitle>Instalação</SectionTitle>
                    <CopyField
                        label="1. Script na página de vendas (antes do </head>)"
                        value={pixelSnippet}
                        hint={<>
                            Registra PageView, clique, UTMs, fbclid/fbp/fbc e envia pra Meta via API de Conversões com o Pixel {source.pixel_id ? <code>{source.pixel_id}</code> : 'da fonte'}.
                            Links de checkout (Kiwify, Hotmart, Eduzz, Monetizze, Cakto, Hub.la, PerfectPay, Braip, Ticto, Greenn, Payt) recebem as UTMs + <code>sck</code> automaticamente
                            e o clique dispara InitiateCheckout. Checkout em domínio próprio: adicione o atributo <code>data-tai-checkout</code> no botão.
                        </>}
                    />
                    <CopyField
                        label="2. Parâmetros de URL nos anúncios (Meta → Anúncio → Rastreamento → Parâmetros de URL)"
                        value={META_UTM_TEMPLATE}
                        hint="Aplique em todos os anúncios. O nome|id de campanha, conjunto e anúncio é o que liga cada venda ao gasto certo."
                    />
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                        3. Conecte a plataforma de checkout em Integrações. Eventos de WhatsApp (CTWA) e CRM ficam em Fontes e WhatsApp.
                    </div>
                </Card>

                <Card flat style={{ padding: '16px 18px' }}>
                    <SectionTitle>Evento Purchase</SectionTitle>
                    {!settings ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando…</div> : (
                        <>
                            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                                Enviado pra Meta só quando a venda é <b>aprovada</b> (Pix e boleto gerados não contam). Reenvio do mesmo pedido não duplica.
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Valor da conversão</div>
                            <label style={radio}>
                                <input type="radio" checked={settings.purchase_value === 'gross'} onChange={() => setSettings({ ...settings, purchase_value: 'gross' })} />
                                <span>Valor pago pelo cliente <span style={{ color: 'var(--text-muted)' }}>— bruto, igual ao ticket</span></span>
                            </label>
                            <label style={radio}>
                                <input type="radio" checked={settings.purchase_value === 'net'} onChange={() => setSettings({ ...settings, purchase_value: 'net' })} />
                                <span>Valor líquido <span style={{ color: 'var(--text-muted)' }}>— o que entra depois das taxas e comissões</span></span>
                            </label>

                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '14px 0 8px' }}>Produtos que geram Purchase</div>
                            {products.length === 0 ? (
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Todos. Os produtos aparecem aqui depois do primeiro pedido.</div>
                            ) : (
                                <>
                                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}>Nenhum marcado = todos. Use pra não otimizar a campanha com order bump ou upsell.</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                                        {products.map((p) => (
                                            <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                                                <input type="checkbox" checked={selected.includes(p)} onChange={() => toggleProduct(p)} /> {p}
                                            </label>
                                        ))}
                                    </div>
                                </>
                            )}
                            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <Save size={13} /> {saving ? 'Salvando…' : saved ? 'Salvo' : 'Salvar regras'}
                            </button>
                        </>
                    )}
                </Card>
            </div>
        </>
    );
}
