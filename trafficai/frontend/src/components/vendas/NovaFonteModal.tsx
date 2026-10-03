'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Cria uma fonte de tracking a partir de uma conta já ativada em Contas:
 * escolhe a conta → lista os pixels dela direto da Meta → cria a fonte usando
 * o token da conta conectada (sem colar token do pixel).
 */
export function NovaFonteModal({ sources, onClose, onCreated }: {
    sources: any[];
    onClose: () => void;
    onCreated: (id: string) => void;
}) {
    const [accounts, setAccounts] = useState<any[]>([]);
    const [accountId, setAccountId] = useState('');
    const [name, setName] = useState('');
    const [domain, setDomain] = useState('');
    const [pixels, setPixels] = useState<{ pixel_id: string; pixel_name: string; last_fired_time: string | null }[]>([]);
    const [pixelId, setPixelId] = useState('');
    const [loadingPixels, setLoadingPixels] = useState(false);
    const [pixelError, setPixelError] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        api.getActiveAccounts().then((a) => setAccounts(a || [])).catch(() => setAccounts([]));
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Contas sem fonte primeiro — é o caso de "ativei a conta e quero rastrear".
    const withSource = useMemo(() => new Set(sources.map((s) => s.account_id).filter(Boolean)), [sources]);
    const sorted = useMemo(() => [...accounts].sort((a, b) =>
        Number(withSource.has(a.id)) - Number(withSource.has(b.id)) || String(a.account_name).localeCompare(String(b.account_name))
    ), [accounts, withSource]);

    useEffect(() => {
        setPixels([]); setPixelId(''); setPixelError('');
        if (!accountId) return;
        const acc = accounts.find((a) => a.id === accountId);
        if (acc && !name.trim()) setName(acc.account_name);
        setLoadingPixels(true);
        api.getAccountPixels(accountId).then((list) => {
            setPixels(list);
            if (list.length === 1) setPixelId(list[0].pixel_id);
            if (!list.length) setPixelError('Essa conta ainda não tem pixel. Crie um no Gerenciador de Eventos da Meta e volte aqui.');
        }).catch((e) => setPixelError(e.message || 'Não consegui listar os pixels.')).finally(() => setLoadingPixels(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountId]);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        if (!accountId) { setError('Escolha a conta de anúncio.'); return; }
        if (!pixelId) { setError('Escolha o pixel.'); return; }
        if (!name.trim()) { setError('Dê um nome para a fonte.'); return; }
        setSaving(true);
        try {
            const created = await api.createTrackingSource({
                name: name.trim(),
                account_id: accountId,
                pixel_id: pixelId,
                use_ads_token: true,
                domain: domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || undefined,
            });
            onCreated(created.id);
        } catch (err: any) {
            setError(err.message || 'Erro ao criar a fonte');
            setSaving(false);
        }
    }

    const fired = (iso: string | null) => {
        if (!iso) return 'nunca disparou';
        const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
        return days <= 0 ? 'ativo hoje' : `último evento há ${days} dia${days > 1 ? 's' : ''}`;
    };

    return createPortal(
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="nova-fonte-title">
                <div className="modal-header">
                    <div>
                        <div id="nova-fonte-title" className="modal-title">Nova fonte de tracking</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>Escolha uma conta já ativada em Contas e o pixel dela.</div>
                    </div>
                    <button className="modal-close" onClick={onClose} type="button" aria-label="Fechar"><X size={16} /></button>
                </div>

                <form onSubmit={submit}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="nf-account">Conta de anúncio</label>
                        <select id="nf-account" className="form-select" value={accountId} onChange={(e) => setAccountId(e.target.value)} autoFocus>
                            <option value="">Escolha a conta…</option>
                            {sorted.map((a) => (
                                <option key={a.id} value={a.id}>{a.account_name}{withSource.has(a.id) ? ' (já tem fonte)' : ''}</option>
                            ))}
                        </select>
                        {accounts.length === 0 && (
                            <span className="form-hint">Nenhuma conta ativa. Ative a conta do cliente em Tráfego → Contas.</span>
                        )}
                    </div>

                    {accountId && (
                        <div className="form-group">
                            <label className="form-label">Pixel</label>
                            {loadingPixels && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Buscando pixels na Meta…</div>}
                            {pixelError && <div style={{ fontSize: 12.5, color: 'var(--accent-yellow)' }}>{pixelError}</div>}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {pixels.map((p) => (
                                    <label key={p.pixel_id} style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, cursor: 'pointer',
                                        border: `1px solid ${pixelId === p.pixel_id ? 'var(--accent-blue)' : 'var(--border)'}`,
                                        background: pixelId === p.pixel_id ? 'rgba(56,189,248,.08)' : 'var(--bg-input)',
                                    }}>
                                        <input type="radio" name="nf-pixel" checked={pixelId === p.pixel_id} onChange={() => setPixelId(p.pixel_id)} />
                                        <span style={{ minWidth: 0 }}>
                                            <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{p.pixel_name}</span>
                                            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>{p.pixel_id} · {fired(p.last_fired_time)}</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label" htmlFor="nf-name">Nome da fonte</label>
                        <input id="nf-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Dr. Ailton — Consultório" />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="nf-domain">Domínio do site <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span></label>
                        <input id="nf-domain" className="form-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="meusite.com.br" />
                    </div>

                    {error && (
                        <div style={{ padding: '9px 12px', marginBottom: 12, fontSize: 13, borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', color: 'var(--accent-red)' }}>{error}</div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn btn-primary" disabled={saving || !pixelId}>{saving ? 'Criando…' : 'Criar fonte'}</button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
