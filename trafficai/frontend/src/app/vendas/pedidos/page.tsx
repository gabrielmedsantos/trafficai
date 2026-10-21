'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, Search } from 'lucide-react';
import { OrderWhatsapp } from '@/components/vendas/order-whatsapp';
import { QuizAnswers } from '@/components/vendas/quiz-answers';
import { OrderDelivery } from '@/components/vendas/order-delivery';
import { whatsappPhone } from '@/lib/order-whatsapp';
import { api } from '@/lib/api';
import { useVendas, Card, ErrorBox, brl, thStyle, selectStyle, STATUS_LABEL, PAYMENT_LABEL } from '@/components/vendas/shared';

const FILTERS = [
    { key: '', label: 'Todos' },
    { key: 'approved', label: 'Aprovados' },
    { key: 'pending', label: 'Pendentes' },
    { key: 'refused', label: 'Recusados' },
    { key: 'refunded', label: 'Reembolsados' },
    { key: 'chargeback', label: 'Chargeback' },
];

export default function PedidosPage() {
    const { sourceId, since, until, reloadToken } = useVendas();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [searchTerm,setSearchTerm]=useState('');
    const [answerSession,setAnswerSession]=useState<string|null>(null);
    const closeAnswers=useCallback(()=>setAnswerSession(null),[]);
    useEffect(()=>{const timer=setTimeout(()=>setSearchTerm(search.trim()),300);return()=>clearTimeout(timer);},[search]);
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const closeWhatsapp = useCallback(() => setSelectedOrder(null), []);
    const [deliveryOrder,setDeliveryOrder]=useState<any|null>(null);
    const closeDelivery=useCallback(()=>setDeliveryOrder(null),[]);
    const [deliveryReload,setDeliveryReload]=useState(0);
    const reloadDelivery=useCallback(()=>setDeliveryReload(n=>n+1),[]);
    useEffect(()=>{setDeliveryOrder(null);},[sourceId,since,until]);
    useEffect(() => { setSelectedOrder(null);setAnswerSession(null); }, [sourceId, since, until]);

    useEffect(() => {
        if (!sourceId) return;
        setLoading(true); setError('');
        let active=true;
        api.getSalesOrders(sourceId, { since, until, limit: '500',search:searchTerm })
            .then((r) => {if(active)setOrders(r || []);})
            .catch((e) => {if(active)setError(e.message || 'Erro ao carregar pedidos');})
            .finally(() => {if(active)setLoading(false);});
        return()=>{active=false;};
    }, [sourceId, since, until, reloadToken,searchTerm,deliveryReload]);

    const counts = useMemo(() => {
        const c: Record<string, number> = { '': orders.length };
        for (const o of orders) c[o.status] = (c[o.status] || 0) + 1;
        return c;
    }, [orders]);

    const list = useMemo(() => {
        return orders
            .filter(o => !status || o.status === status);
    }, [orders, status]);

    return (
        <>
            {error && <ErrorBox>{error}</ErrorBox>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                {FILTERS.map(f => (
                    <button key={f.key} type="button" onClick={() => setStatus(f.key)} className={`btn btn-sm ${status === f.key ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: 12, padding: '5px 11px' }}>
                        {f.label} <span className="num" style={{ opacity: 0.7, marginLeft: 3 }}>{counts[f.key] || 0}</span>
                    </button>
                ))}
                <div style={{ position: 'relative', marginLeft: 'auto' }}>
                    <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="input" type="search" aria-label="Buscar pedidos por criança, comprador, telefone ou e-mail" maxLength={120} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Criança, comprador, telefone, e-mail"
                        style={{ ...selectStyle, padding: '6px 8px 6px 26px', fontSize: 12, width: 'min(320px,85vw)' }} />
                </div>
            </div>
            <p style={{fontSize:12,color:'var(--text-muted)'}}>Busca no período selecionado. As respostas continuam vinculadas ao pedido.</p>
            <Card flat style={{ padding: 0 }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-input)' }}>
                                {['Data', 'Plataforma', 'Produto', 'Cliente', 'Pagamento', 'Bruto', 'Líquido', 'Status', 'Campanha', 'Anúncio', 'Meta'].map((h) => (
                                    <th key={h} style={thStyle(h === 'Bruto' || h === 'Líquido' ? 'right' : 'left', false)}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {list.length === 0 && (
                                <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {loading ? 'Carregando…' : 'Nenhum pedido nesse filtro.'}
                                </td></tr>
                            )}
                            {list.map((o) => {
                                const st = STATUS_LABEL[o.status] || { label: o.status, color: 'var(--text-muted)' };
                                const camp = o.utm_campaign ? String(o.utm_campaign).split('|')[0] : null;
                                const ad = o.utm_content ? String(o.utm_content).split('|')[0] : null;
                                const cell: React.CSSProperties = { padding: '8px 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
                                return (
                                    <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                                        <td style={cell}>{new Date(o.order_date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                                        <td style={{ ...cell, textTransform: 'capitalize' }}>{o.platform}</td>
                                        <td style={{ ...cell, maxWidth: 240 }} title={o.product_name || ''}><div>{o.product_name || '—'}</div>{Array.isArray(o.order_bumps)&&o.order_bumps.map((b:any)=><small key={b.order_id} style={{display:'block',marginTop:5,color:'var(--text-muted)',whiteSpace:'normal'}}>+ {b.product_name}{b.gross_value!=null?' · '+brl(Number(b.gross_value)):''}</small>)}</td>
                                        <td style={{ ...cell, maxWidth: 260,whiteSpace:'normal' }}><div title={o.customer_name || ''}>{o.customer_name || '—'}{o.shared_journey&&<small style={{display:'block'}}>Jornada Historinha compartilhada · pedido único</small>}</div>{o.child_name&&<small style={{display:'block',marginTop:4}}>Criança: <strong>{o.child_name}</strong></small>}{o.customer_email&&<small style={{display:'block',marginTop:4,overflowWrap:'anywhere'}}>{o.customer_email}</small>}{o.customer_phone&&<small style={{display:'block',marginTop:4}}>{o.customer_phone}</small>}<button type="button" className="btn btn-sm btn-secondary" disabled={!whatsappPhone(o.customer_phone)} title={whatsappPhone(o.customer_phone)?'Preparar mensagem para este cliente':'Cliente sem telefone válido'} onClick={()=>setSelectedOrder(o)} style={{fontSize:11,marginTop:5,gap:5}}><MessageCircle size={13}/> WhatsApp</button>{o.quiz_sessions?.map((s:any)=><button key={s.id} type="button" className="btn btn-sm btn-secondary" onClick={()=>setAnswerSession(s.id)} style={{display:'block',fontSize:11,marginTop:5}}>Ver respostas{s.child_name?' · '+s.child_name:''}</button>)}</td>
                                        <td style={cell}>{PAYMENT_LABEL[o.payment_method] || '—'}{o.delivery_enabled&&o.status==='approved'&&<button type="button" className="btn btn-sm btn-secondary" style={{display:'block',marginTop:7,fontSize:11}} onClick={()=>setDeliveryOrder(o)}>{o.delivery_status==='delivered'?'Entregue · Ver histórico':'Entregável'}</button>}</td>
                                        <td className="num" style={{ ...cell, textAlign: 'right' }}>{o.gross_value != null ? brl(Number(o.gross_value)) : '—'}</td>
                                        <td className="num" style={{ ...cell, textAlign: 'right' }}>{o.net_value != null ? brl(Number(o.net_value)) : '—'}</td>
                                        <td style={cell}>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: st.color, border: `1px solid ${st.color}`, borderRadius: 999, padding: '1px 8px' }}>{st.label}</span>
                                        </td>
                                        <td style={{ ...cell, maxWidth: 220, color: camp ? 'var(--text-primary)' : 'var(--text-muted)' }} title={o.utm_campaign || ''}>{camp || 'sem UTM'}</td>
                                        <td style={{ ...cell, maxWidth: 180, color: ad ? 'var(--text-primary)' : 'var(--text-muted)' }} title={o.utm_content || ''}>{ad || '—'}</td>
                                        <td style={{ ...cell, fontSize: 11, color: o.purchase_event_id ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                                            {o.status === 'approved' ? (o.purchase_event_id ? 'Purchase enviado' : 'Não enviado') : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
            {orders.length >= 500 && <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>Mostrando os 500 pedidos mais recentes — reduza o período pra ver todos.</p>}
            {selectedOrder && <OrderWhatsapp key={selectedOrder.id} order={selectedOrder} onClose={closeWhatsapp}/>}
            {answerSession&&<QuizAnswers key={`${sourceId}:${answerSession}`} sourceId={sourceId} sessionId={answerSession} onClose={closeAnswers}/>}
            {deliveryOrder&&<OrderDelivery key={`${sourceId}:${deliveryOrder.id}`} sourceId={deliveryOrder.source_id||sourceId} order={deliveryOrder} onClose={closeDelivery} onChange={reloadDelivery}/>}
        </>
    );
}
