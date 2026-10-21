'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Check, MessageCircle, X } from 'lucide-react';
import { orderMessage, orderWhatsappUrl } from '@/lib/order-whatsapp';
import styles from './order-whatsapp.module.css';

interface Order { customer_name?: string; customer_phone?: string; product_name?: string; status?: string }

export function OrderWhatsapp({ order, onClose, initialMessage }: { order: Order; onClose: () => void; initialMessage?: string }) {
    const [message, setMessage] = useState(() => initialMessage || orderMessage(order));
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    const panel = useRef<HTMLElement>(null);
    const url = orderWhatsappUrl(order.customer_phone, message);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
        function key(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose();
            if (event.key !== 'Tab') return;
            const elements = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, a[href]');
            if (!elements?.length) return;
            const first = elements[0], last = elements[elements.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
        document.addEventListener('keydown', key);
        return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; previous?.focus(); };
    }, [onClose]);
    async function copy() {
        try { await navigator.clipboard.writeText(message); setCopied(true); setError(''); }
        catch { setError('Não foi possível copiar. Selecione e copie o texto da mensagem.'); }
    }
    return <>
        <div className={styles.shade} onClick={onClose} aria-hidden="true" />
        <aside ref={panel} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="orderWhatsappTitle">
            <div className={styles.header}><div><h2 id="orderWhatsappTitle">Mensagem para {order.customer_name || 'cliente'}</h2><p>{order.customer_phone || 'Cliente sem telefone'}</p></div><button type="button" className="btn btn-secondary" aria-label="Fechar mensagem" onClick={onClose}><X size={18}/></button></div>
            <p>Produto: <strong>{order.product_name || '—'}</strong></p>
            <label className={styles.editor}>Mensagem<textarea value={message} onChange={e=>{setMessage(e.target.value);setCopied(false);}} rows={7}/></label>
            <p className={styles.note}>Revise o texto. O WhatsApp abrirá com a mensagem pronta para você enviar.</p>
            {error&&<p role="alert">{error}</p>}
            <div className={styles.actions}>{url?<a className={`btn ${styles.whatsapp}`} href={url} target="_blank" rel="noopener noreferrer"><MessageCircle size={18}/> Abrir no WhatsApp</a>:<button className="btn btn-secondary" disabled>{order.customer_phone?'Confira o telefone e a mensagem':'Cliente sem telefone'}</button>}<button className="btn btn-secondary" type="button" disabled={!message.trim()} onClick={copy}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?'Mensagem copiada':'Copiar mensagem'}</button></div>
        </aside>
    </>;
}
