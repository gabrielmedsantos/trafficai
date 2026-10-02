'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, SectionTitle } from './shared';

type Prefs = { approved: boolean; pix: boolean; boleto: boolean; abandoned: boolean; refused: boolean; push: boolean; whatsapp: boolean };

const EVENTS: { key: keyof Prefs; label: string; example: string }[] = [
    { key: 'approved', label: '💰 Venda aprovada', example: 'Valor: R$ 1.275,48' },
    { key: 'pix', label: '⏳ Pix gerado', example: 'aguardando pagamento' },
    { key: 'boleto', label: '📄 Boleto gerado', example: 'aguardando pagamento' },
    { key: 'abandoned', label: '🛒 Carrinho abandonado', example: 'cliente pra recuperar' },
    { key: 'refused', label: '❌ Pagamento recusado', example: 'cartão negado' },
];

/** Avisos de venda no celular/computador — separados dos alertas de conta. */
export function SalesNotifyCard({ sourceId }: { sourceId: string }) {
    const [prefs, setPrefs] = useState<Prefs | null>(null);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        if (!sourceId) return;
        setPrefs(null); setMsg(null);
        api.getSalesSettings(sourceId).then((r) => setPrefs(r.settings.notify)).catch(() => setPrefs(null));
    }, [sourceId]);

    async function update(next: Prefs) {
        setPrefs(next); setSaving(true); setMsg(null);
        try {
            const r = await api.updateSalesSettings(sourceId, { notify: next });
            setPrefs(r.notify);
        } catch (e: any) {
            setMsg({ ok: false, text: e.message || 'Não consegui salvar' });
        } finally {
            setSaving(false);
        }
    }

    async function test() {
        setTesting(true); setMsg(null);
        try {
            const r = await api.testSalesNotify(sourceId);
            const parts: string[] = [];
            if (prefs?.push) parts.push(r.push > 0 ? `push em ${r.push} dispositivo(s)` : 'push: nenhum dispositivo ativado');
            if (prefs?.whatsapp) parts.push(r.whatsapp ? 'WhatsApp enviado' : 'WhatsApp não enviado (confira o número em Configurações)');
            const ok = r.push > 0 || r.whatsapp;
            setMsg({ ok, text: parts.length ? parts.join(' · ') : 'Ligue o push ou o WhatsApp pra testar.' });
        } catch (e: any) {
            setMsg({ ok: false, text: e.message || 'Falha no teste' });
        } finally {
            setTesting(false);
        }
    }

    const check = (key: keyof Prefs) => (
        <input type="checkbox" checked={!!prefs?.[key]} disabled={!prefs || saving} onChange={(e) => prefs && update({ ...prefs, [key]: e.target.checked })} />
    );

    return (
        <Card style={{ padding: '16px 18px', gridColumn: '1 / -1' }}>
            <SectionTitle right={
                <button type="button" className="btn btn-secondary btn-sm" onClick={test} disabled={!prefs || testing} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Send size={13} /> {testing ? 'Enviando…' : 'Enviar teste'}
                </button>
            }>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Bell size={13} /> Notificações de venda</span>
            </SectionTitle>
            {!prefs ? <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Carregando…</div> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Avisar quando</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {EVENTS.map((ev) => (
                                <label key={ev.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                    {check(ev.key)} {ev.label}
                                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>· {ev.example}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Por onde</div>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>
                            {check('push')}
                            <span>Notificação no celular e computador
                                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>
                                    Ative em <Link href="/settings" style={{ color: 'var(--accent-blue)' }}>Configurações</Link> → Notificações push, em cada aparelho. No iPhone, abra o TrafficAI pelo ícone da Tela de Início.
                                </span>
                            </span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                            {check('whatsapp')}
                            <span>WhatsApp
                                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>Vai pro mesmo número dos alertas, configurado em Configurações.</span>
                            </span>
                        </label>
                    </div>
                </div>
            )}
            {msg && <div style={{ marginTop: 12, fontSize: 12.5, color: msg.ok ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>{msg.text}</div>}
            <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-muted)' }}>
                Os avisos de venda têm formato próprio e não se misturam com os alertas de conta. Ao tocar, abrem Pedidos ou Recuperação.
            </div>
        </Card>
    );
}
