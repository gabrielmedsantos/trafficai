'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    MessageCircle, Phone, Clock, CheckCircle2, AlertCircle, X,
    RefreshCw, Send, RotateCcw, Sparkles, Copy, Check, ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';

interface WhatsAppAccount {
    account_id: string;
    account_name: string;
    meta_account_id: string;
    is_client_active: boolean;
    client_name: string;
    client_phone: string | null;
    daily_whatsapp_enabled: boolean | null;
    daily_whatsapp_time: string;
    daily_whatsapp_last_sent_date: string | null;
    has_custom_template: boolean;
}

interface Settings {
    account_id: string;
    client_name: string | null;
    client_phone: string | null;
    daily_whatsapp_enabled: boolean;
    daily_whatsapp_time: string;
    daily_whatsapp_last_sent_date: string | null;
    daily_whatsapp_template: string | null;
    effective_template: string;
    default_template: string;
}

interface Variable {
    key: string;
    label: string;
    example: string;
}

function utcToBrtLabel(utcHHMM: string): string {
    // 11:15 UTC = 08:15 BRT (UTC-3). Fallback simples sem TZDB.
    const [hh, mm] = utcHHMM.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return utcHHMM;
    let brtH = hh - 3;
    if (brtH < 0) brtH += 24;
    return `${String(brtH).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function fmtRelative(iso?: string | null) {
    if (!iso) return null;
    const d = new Date(iso).getTime();
    const diff = Date.now() - d;
    if (diff < 60_000) return 'agora';
    if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)}min`;
    if (diff < 86_400_000) return `há ${Math.floor(diff / 3_600_000)}h`;
    return `há ${Math.floor(diff / 86_400_000)}d`;
}

export default function WhatsappReportsPage() {
    const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [openAccount, setOpenAccount] = useState<WhatsAppAccount | null>(null);
    const [variables, setVariables] = useState<Variable[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [list, vars] = await Promise.all([
                api.getWhatsappReportAccounts().catch(() => []),
                api.getWhatsappReportVariables().catch(() => null),
            ]);
            setAccounts(list);
            if (vars) setVariables([...vars.variables]);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return accounts;
        return accounts.filter(a =>
            a.client_name.toLowerCase().includes(term) ||
            a.account_name.toLowerCase().includes(term) ||
            (a.client_phone || '').toLowerCase().includes(term)
        );
    }, [accounts, search]);

    const totalEnabled = accounts.filter(a => a.daily_whatsapp_enabled).length;
    const totalNoPhone = accounts.filter(a => a.daily_whatsapp_enabled && !a.client_phone).length;

    return (
        <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Relatórios diários WhatsApp</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
                        {accounts.length} conta{accounts.length !== 1 ? 's' : ''} · {totalEnabled} ativo{totalEnabled !== 1 ? 's' : ''}
                        {totalNoPhone > 0 && <> · <span style={{ color: 'var(--accent-yellow)' }}>{totalNoPhone} sem telefone</span></>}
                    </p>
                </div>
                <button
                    onClick={load}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
                >
                    <RefreshCw size={14} /> Atualizar
                </button>
            </div>

            {/* Search */}
            <div style={{ marginBottom: 20, position: 'relative', maxWidth: 480 }}>
                <input
                    type="search"
                    placeholder="Buscar por cliente, conta ou telefone…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        width: '100%', padding: '10px 14px',
                        background: 'var(--bg-input)', border: '1px solid var(--border)',
                        borderRadius: 10, color: 'var(--text)', fontSize: 13.5, outline: 'none',
                        boxSizing: 'border-box',
                    }}
                />
            </div>

            {/* Lista de contas */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Carregando…</div>
            ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, color: 'var(--text-muted)' }}>
                    <MessageCircle size={36} style={{ opacity: .3, marginBottom: 10 }} />
                    <p style={{ margin: 0, fontSize: 14.5 }}>Nenhuma conta encontrada</p>
                </div>
            ) : (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(220px, 2fr) 110px 200px 110px 130px 40px',
                        gap: 16, padding: '12px 20px',
                        background: 'var(--bg-surface-2)',
                        borderBottom: '1px solid var(--border)',
                        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
                        color: 'var(--text-muted)',
                    }}>
                        <div>Cliente</div>
                        <div>Status</div>
                        <div>Telefone / Grupo</div>
                        <div>Horário</div>
                        <div>Último envio</div>
                        <div></div>
                    </div>

                    {filtered.map((a, i) => (
                        <div key={a.account_id}
                            onClick={() => setOpenAccount(a)}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(220px, 2fr) 110px 200px 110px 130px 40px',
                                gap: 16, padding: '14px 20px', alignItems: 'center',
                                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                                cursor: 'pointer', transition: 'background .12s',
                            }}
                            onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                            onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                            {/* Cliente */}
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {a.client_name}
                                </div>
                                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {a.account_name}
                                </div>
                            </div>

                            {/* Status */}
                            <div>
                                {a.daily_whatsapp_enabled ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.25)' }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                                        Ativo
                                    </span>
                                ) : (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 500, color: 'var(--text-muted)', background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
                                        Desativado
                                    </span>
                                )}
                            </div>

                            {/* Telefone */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                {a.client_phone ? (
                                    <>
                                        <Phone size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                        <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {a.client_phone.length > 22 ? a.client_phone.slice(0, 20) + '…' : a.client_phone}
                                        </span>
                                    </>
                                ) : (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent-yellow)' }}>
                                        <AlertCircle size={11} /> Não configurado
                                    </span>
                                )}
                            </div>

                            {/* Horário */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)' }}>
                                <Clock size={11} color="var(--text-muted)" />
                                {utcToBrtLabel(a.daily_whatsapp_time)} BRT
                            </div>

                            {/* Último envio */}
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                {a.daily_whatsapp_last_sent_date ? fmtRelative(a.daily_whatsapp_last_sent_date) : '—'}
                                {a.has_custom_template && (
                                    <div style={{ fontSize: 10.5, color: 'var(--primary)', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                        <Sparkles size={10} /> Template custom
                                    </div>
                                )}
                            </div>

                            {/* Arrow */}
                            <div>
                                <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Drawer de edição */}
            {openAccount && (
                <SettingsDrawer
                    account={openAccount}
                    variables={variables}
                    onClose={() => setOpenAccount(null)}
                    onSaved={() => { setOpenAccount(null); load(); }}
                />
            )}
        </div>
    );
}

// ─── Drawer de edição ──────────────────────────────────────────────────────

function SettingsDrawer({ account, variables, onClose, onSaved }: {
    account: WhatsAppAccount;
    variables: Variable[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [sending, setSending] = useState(false);
    const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
    const [tab, setTab] = useState<'config' | 'template' | 'preview'>('config');
    const [preview, setPreview] = useState<string>('');
    const [loadingPreview, setLoadingPreview] = useState(false);

    // Form local
    const [enabled, setEnabled] = useState(false);
    const [phone, setPhone] = useState('');
    const [time, setTime] = useState('11:15');
    const [template, setTemplate] = useState<string>('');
    const [usingDefault, setUsingDefault] = useState(true);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        api.getWhatsappReportSettings(account.account_id)
            .then(s => {
                if (cancelled) return;
                setSettings(s);
                setEnabled(s.daily_whatsapp_enabled);
                setPhone(s.client_phone || '');
                setTime(s.daily_whatsapp_time);
                setTemplate(s.effective_template);
                setUsingDefault(!s.daily_whatsapp_template);
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [account.account_id]);

    // Preview live ao mudar template (com debounce)
    useEffect(() => {
        if (tab !== 'preview' || !settings) return;
        const t = setTimeout(() => {
            setLoadingPreview(true);
            api.previewWhatsappReport(account.account_id, template)
                .then(r => setPreview(r.preview))
                .catch(() => setPreview('Erro ao gerar preview'))
                .finally(() => setLoadingPreview(false));
        }, 400);
        return () => clearTimeout(t);
    }, [tab, template, account.account_id, settings]);

    async function save() {
        setSaving(true); setFeedback(null);
        try {
            await api.updateWhatsappReportSettings(account.account_id, {
                daily_whatsapp_enabled: enabled,
                client_phone: phone.trim() || null,
                daily_whatsapp_time: time,
                // Se template é igual ao default, salva null (volta a usar default)
                daily_whatsapp_template: usingDefault ? null : template,
            });
            setFeedback({ ok: true, msg: 'Salvo' });
            setTimeout(() => onSaved(), 600);
        } catch (e: any) {
            setFeedback({ ok: false, msg: e.message || 'Erro ao salvar' });
        } finally { setSaving(false); }
    }

    async function sendNow() {
        if (!confirm(`Disparar AGORA pra ${phone}?`)) return;
        setSending(true); setFeedback(null);
        try {
            await api.sendWhatsappReportNow(account.account_id);
            setFeedback({ ok: true, msg: 'Enviado pra fila' });
        } catch (e: any) {
            setFeedback({ ok: false, msg: e.message || 'Erro ao enviar' });
        } finally { setSending(false); }
    }

    function resetToDefault() {
        if (!settings) return;
        setTemplate(settings.default_template);
        setUsingDefault(true);
    }

    function insertVar(key: string) {
        const ta = document.getElementById('tpl-textarea') as HTMLTextAreaElement | null;
        const insert = `{${key}}`;
        if (ta) {
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const next = template.slice(0, start) + insert + template.slice(end);
            setTemplate(next);
            setUsingDefault(false);
            setTimeout(() => {
                ta.focus();
                ta.setSelectionRange(start + insert.length, start + insert.length);
            }, 0);
        } else {
            setTemplate(template + insert);
            setUsingDefault(false);
        }
    }

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 200 }} />
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 620, background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', zIndex: 201, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-soft)', border: '1px solid var(--primary-ring)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                            <MessageCircle size={20} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {account.client_name}
                            </div>
                            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                                {account.account_name} · <span className="mono">{account.meta_account_id}</span>
                            </div>
                        </div>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 2, padding: '0 24px', borderBottom: '1px solid var(--border)' }}>
                    {[
                        { k: 'config' as const, label: 'Configuração' },
                        { k: 'template' as const, label: 'Template' },
                        { k: 'preview' as const, label: 'Preview' },
                    ].map(t => (
                        <button key={t.k} onClick={() => setTab(t.k)}
                            style={{
                                padding: '11px 16px', fontSize: 13.5,
                                fontWeight: tab === t.k ? 600 : 500,
                                color: tab === t.k ? 'var(--text)' : 'var(--text-muted)',
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                marginBottom: -1,
                                borderBottom: `2px solid ${tab === t.k ? 'var(--primary)' : 'transparent'}`,
                            }}>{t.label}</button>
                    ))}
                </div>

                {/* Body scrollable */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando…</div>
                    ) : (
                        <>
                            {tab === 'config' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                                    {/* Toggle ativo */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '14px 16px',
                                        background: 'var(--bg-surface-2)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 10,
                                    }}>
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Envio diário ativo</div>
                                            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                                                Dispara automaticamente no horário definido
                                            </div>
                                        </div>
                                        <Toggle checked={enabled} onChange={setEnabled} />
                                    </div>

                                    {/* Telefone/grupo */}
                                    <div>
                                        <label style={labelSt}>Telefone do cliente ou ID do grupo</label>
                                        <input
                                            type="text"
                                            value={phone}
                                            onChange={e => setPhone(e.target.value)}
                                            placeholder="+5511999999999 ou 1203...@g.us"
                                            style={inputSt}
                                        />
                                        <span style={hintSt}>
                                            Pra grupos: use o ID terminado em <span className="mono">@g.us</span>. Link convite (<span className="mono">chat.whatsapp.com/...</span>) NÃO funciona.
                                        </span>
                                    </div>

                                    {/* Horário */}
                                    <div>
                                        <label style={labelSt}>Horário do envio (UTC)</label>
                                        <input
                                            type="time"
                                            value={time}
                                            onChange={e => setTime(e.target.value)}
                                            step={900}
                                            style={{ ...inputSt, fontFamily: 'var(--font-mono)' }}
                                        />
                                        <span style={hintSt}>
                                            Equivalente: <strong>{utcToBrtLabel(time)} BRT</strong>. O worker checa a cada 15min — use múltiplos de 15.
                                        </span>
                                    </div>

                                    {/* Último envio */}
                                    {settings?.daily_whatsapp_last_sent_date && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                                            <CheckCircle2 size={13} color="#10b981" />
                                            Último envio em <strong>{new Date(settings.daily_whatsapp_last_sent_date).toLocaleDateString('pt-BR')}</strong>
                                        </div>
                                    )}
                                </div>
                            )}

                            {tab === 'template' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {/* Indicador */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '8px 12px', borderRadius: 8,
                                        background: usingDefault ? 'var(--bg-surface-2)' : 'rgba(255, 107, 53, .08)',
                                        border: `1px solid ${usingDefault ? 'var(--border)' : 'rgba(255, 107, 53, .25)'}`,
                                        fontSize: 12.5,
                                    }}>
                                        {usingDefault ? (
                                            <>
                                                <span style={{ color: 'var(--text-muted)' }}>Usando template padrão</span>
                                                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>·</span>
                                                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Edite abaixo pra personalizar</span>
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles size={12} color="var(--primary)" />
                                                <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Template personalizado</span>
                                                <button onClick={resetToDefault} type="button"
                                                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11.5, color: 'var(--text-muted)', cursor: 'pointer' }}>
                                                    <RotateCcw size={10} /> Restaurar padrão
                                                </button>
                                            </>
                                        )}
                                    </div>

                                    {/* Textarea */}
                                    <div>
                                        <label style={labelSt}>Template da mensagem</label>
                                        <textarea
                                            id="tpl-textarea"
                                            value={template}
                                            onChange={e => { setTemplate(e.target.value); setUsingDefault(false); }}
                                            rows={18}
                                            style={{
                                                width: '100%', padding: '12px 14px',
                                                background: 'var(--bg-input)',
                                                border: '1px solid var(--border)',
                                                borderRadius: 10,
                                                color: 'var(--text)',
                                                fontSize: 13,
                                                fontFamily: 'var(--font-mono)',
                                                lineHeight: 1.55,
                                                resize: 'vertical',
                                                outline: 'none',
                                                boxSizing: 'border-box',
                                            }}
                                        />
                                        <span style={hintSt}>
                                            Use <span className="mono">{'{nome_da_variavel}'}</span>. Veja a lista abaixo. Quebras de linha viram quebras na mensagem do WhatsApp.
                                        </span>
                                    </div>

                                    {/* Variáveis disponíveis */}
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 8 }}>
                                            Variáveis disponíveis · clique pra inserir
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                                            {variables.map(v => (
                                                <button key={v.key} type="button"
                                                    onClick={() => insertVar(v.key)}
                                                    title={`Exemplo: ${v.example}`}
                                                    style={{
                                                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                                                        padding: '8px 10px',
                                                        background: 'var(--bg-surface-2)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: 8,
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                        transition: 'border-color .12s',
                                                    }}
                                                    onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; }}
                                                    onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}>
                                                    <span className="mono" style={{ fontSize: 11.5, color: 'var(--primary)' }}>{'{' + v.key + '}'}</span>
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{v.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {tab === 'preview' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                                        Renderização com dados de exemplo. Edite no tab <strong>Template</strong>.
                                    </div>
                                    <div style={{
                                        position: 'relative',
                                        padding: '16px 18px',
                                        background: '#0a221c',
                                        border: '1px solid rgba(16,185,129,.2)',
                                        borderRadius: 12,
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 13,
                                        color: '#e3f2eb',
                                        lineHeight: 1.6,
                                        whiteSpace: 'pre-wrap',
                                        minHeight: 200,
                                    }}>
                                        {loadingPreview ? 'Renderizando…' : preview || '—'}
                                        <CopyButton text={preview} />
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{ borderTop: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {feedback && (
                        <span style={{ fontSize: 12.5, color: feedback.ok ? 'var(--accent-green)' : 'var(--accent-red)', flex: 1, minWidth: 0 }}>
                            {feedback.msg}
                        </span>
                    )}
                    <button onClick={sendNow} disabled={sending || !phone}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 14px', borderRadius: 8,
                            background: 'transparent', border: '1px solid var(--border)',
                            color: phone ? 'var(--text)' : 'var(--text-muted)',
                            fontSize: 13, fontWeight: 500, cursor: phone && !sending ? 'pointer' : 'not-allowed',
                            opacity: phone ? 1 : .6,
                            marginLeft: feedback ? 0 : 'auto',
                        }}>
                        <Send size={13} /> {sending ? 'Enviando…' : 'Enviar agora'}
                    </button>
                    <button onClick={save} disabled={saving}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 18px', borderRadius: 8,
                            background: 'var(--primary)', border: 'none',
                            color: '#fff', fontSize: 13.5, fontWeight: 600,
                            cursor: saving ? 'not-allowed' : 'pointer',
                            opacity: saving ? .7 : 1,
                        }}>
                        {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                </div>
            </div>
        </>
    );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (b: boolean) => void }) {
    return (
        <button type="button" onClick={() => onChange(!checked)}
            role="switch" aria-checked={checked}
            style={{
                width: 42, height: 24,
                borderRadius: 999,
                background: checked ? 'var(--primary)' : 'var(--bg-surface-2)',
                border: '1px solid ' + (checked ? 'var(--primary)' : 'var(--border)'),
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 150ms ease',
                padding: 0,
            }}>
            <span style={{
                position: 'absolute', top: 2, left: checked ? 20 : 2,
                width: 18, height: 18, borderRadius: '50%',
                background: '#fff',
                transition: 'left 150ms ease',
            }} />
        </button>
    );
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button type="button"
            onClick={async () => {
                try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
            }}
            title={copied ? 'Copiado' : 'Copiar'}
            style={{
                position: 'absolute', top: 8, right: 8,
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6,
                color: copied ? 'var(--accent-green)' : 'var(--text-muted)', cursor: 'pointer',
            }}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
    );
}

const labelSt: React.CSSProperties = {
    display: 'block', fontSize: 12.5, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 6,
};
const inputSt: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: 'var(--bg-input)', border: '1px solid var(--border)',
    borderRadius: 10, color: 'var(--text)', fontSize: 13.5, outline: 'none',
    boxSizing: 'border-box',
};
const hintSt: React.CSSProperties = {
    display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5,
};
