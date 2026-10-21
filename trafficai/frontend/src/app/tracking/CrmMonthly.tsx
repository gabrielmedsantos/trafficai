'use client';

import { useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

// Mês a mês direto do Kommo: leads pelo mês de criação e vendas pelo mês de
// fechamento no CRM (não pela data em que o evento foi importado).

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function monthLabel(key: string) {
    const [y, m] = key.split('-');
    return `${MONTHS_PT[Number(m) - 1] || m}/${y.slice(2)}`;
}
function brl(v: number | null | undefined, digits = 0) {
    if (v == null) return '—';
    return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
function int(v: number | null | undefined) {
    return Number(v || 0).toLocaleString('pt-BR');
}

export function CrmMonthly({ sourceId }: { sourceId: string }) {
    const [months, setMonths] = useState(6);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async (n: number, refresh = false) => {
        setLoading(true);
        setError('');
        try {
            setData(await api.getCrmMonthly(sourceId, n, refresh));
        } catch (e: any) {
            setError(e?.message || 'Não foi possível consultar o Kommo.');
        } finally {
            setLoading(false);
        }
    }, [sourceId]);

    const pick = (n: number) => { setMonths(n); load(n); };
    const rows: any[] = data?.months || [];
    const t = data?.totals;

    return (
        <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Mês a mês (Kommo)</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Leads pelo mês de criação e vendas pelo mês de fechamento no Kommo.
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {[3, 6, 12].map(n => (
                        <button key={n} type="button" className={`btn btn-sm ${months === n && data ? 'btn-secondary' : 'btn-ghost'}`}
                            onClick={() => pick(n)} disabled={loading}>
                            {n} meses
                        </button>
                    ))}
                    {data && (
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => load(months, true)} disabled={loading}>
                            <RefreshCw size={12} /> Atualizar
                        </button>
                    )}
                </div>
            </div>

            {loading && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 0' }}>
                    Consultando o Kommo… pode levar até 1 minuto em contas com muitos leads.
                </div>
            )}
            {error && !loading && (
                <div style={{ fontSize: 12, color: 'var(--accent-red)', padding: '10px 0' }}>{error}</div>
            )}
            {!data && !loading && !error && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 0' }}>
                    Escolha o período para carregar os números direto do Kommo.
                </div>
            )}

            {data && !loading && (
                <>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Mês</th>
                                    <th>Investimento</th>
                                    <th>Conversas Meta</th>
                                    <th>Leads criados</th>
                                    <th>CPL</th>
                                    <th>Vendas</th>
                                    <th>Com valor</th>
                                    <th>Faturamento</th>
                                    <th>Ticket médio</th>
                                    <th>Conversão</th>
                                    <th>Custo por venda</th>
                                    <th>ROAS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r: any) => (
                                    <tr key={r.month}>
                                        <td>
                                            {monthLabel(r.month)}
                                            {r.partial && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> (parcial)</span>}
                                        </td>
                                        <td className="num">{r.spend > 0 ? brl(r.spend) : '—'}</td>
                                        <td className="num">{r.conversations_meta > 0 ? int(r.conversations_meta) : '—'}</td>
                                        <td className="num">{int(r.leads_created)}</td>
                                        <td className="num">{brl(r.cpl, 2)}</td>
                                        <td className="num">{int(r.sales_count)}</td>
                                        <td className="num">{int(r.sales_with_value)}</td>
                                        <td className="num">{brl(r.revenue)}</td>
                                        <td className="num">{brl(r.avg_ticket)}</td>
                                        <td className="num">{r.conversion_rate != null ? `${r.conversion_rate.toFixed(1)}%` : '—'}</td>
                                        <td className="num">{brl(r.cpa)}</td>
                                        <td className="num">{r.roas != null ? `${r.roas.toFixed(2)}x` : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {t && (
                                <tfoot>
                                    <tr style={{ fontWeight: 700 }}>
                                        <td>Total</td>
                                        <td className="num">{t.spend > 0 ? brl(t.spend) : '—'}</td>
                                        <td className="num">{t.conversations_meta > 0 ? int(t.conversations_meta) : '—'}</td>
                                        <td className="num">{int(t.leads_created)}</td>
                                        <td className="num">{brl(t.cpl, 2)}</td>
                                        <td className="num">{int(t.sales_count)}</td>
                                        <td className="num">{int(t.sales_with_value)}</td>
                                        <td className="num">{brl(t.revenue)}</td>
                                        <td className="num">{brl(t.avg_ticket)}</td>
                                        <td className="num">{t.conversion_rate != null ? `${t.conversion_rate.toFixed(1)}%` : '—'}</td>
                                        <td className="num">{brl(t.cpa)}</td>
                                        <td className="num">{t.roas != null ? `${t.roas.toFixed(2)}x` : '—'}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                        Vendas = leads fechados em: {(data.won_statuses || []).join(' · ') || '—'}.
                        Com valor = vendas com valor preenchido no Kommo; o ticket médio usa só essas.
                        ROAS = faturamento total do Kommo ÷ investimento Meta (não separa venda orgânica).
                        {!data.has_account_link && ' Vincule uma conta Meta para ver investimento, CPL e ROAS.'}
                        {data.cached && ' Dados em cache de até 30 min — use Atualizar para consultar de novo.'}
                    </div>
                </>
            )}
        </div>
    );
}
