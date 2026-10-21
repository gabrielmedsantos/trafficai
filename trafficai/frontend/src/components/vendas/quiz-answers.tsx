'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import styles from './quiz-answers.module.css';

const labels:Record<string,string>={name:'Nome da criança',age:'Idade',gender:'Gênero',skin:'Tom de pele',hairColor:'Cor do cabelo',hairType:'Tipo de cabelo',eyes:'Olhos',moral:'Ensinamento',setting:'Cenário',special:'Personalidade',email:'E-mail',phone:'WhatsApp',momName:'Nome para dedicatória',temperament:'Temperamento',preference:'Preferência',commitment:'Compromisso',discount:'Desconto',colorir:'Livro para colorir',expressa:'Entrega expressa',extra:'Historinhas extras'};
export function QuizAnswers({sourceId,sessionId,onClose}:{sourceId:string;sessionId:string;onClose:()=>void}) {
    const dialog=useRef<HTMLDialogElement>(null);
    const [detail,setDetail]=useState<{funnel_slug:string;combo4?:string|null;answers:Record<string,unknown>;payment_status:string|null}|null>(null);
    const [error,setError]=useState('');
    useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.showModal();return()=>{document.body.style.overflow=overflow;previous?.focus();};},[]);
    useEffect(()=>{let active=true;api.request<typeof detail>('GET',`/tracking/quiz/sources/${sourceId}/sessions/${sessionId}`).then(d=>{if(active)setDetail(d);}).catch(e=>{if(active)setError(e.message||'Não foi possível abrir as respostas.');});return()=>{active=false;};},[sourceId,sessionId]);
    return <dialog ref={dialog} className={styles.dialog} onCancel={onClose} aria-labelledby="quizAnswersTitle">
        <header className={styles.header}><div><h2 id="quizAnswersTitle">Respostas para a entrega</h2><p>Dados preenchidos no quiz vinculado a este pedido.</p></div><button type="button" className="btn btn-secondary" onClick={onClose} aria-label="Fechar respostas"><X size={18}/></button></header>
        {error?<p role="alert">{error}</p>:!detail?<p role="status">Carregando respostas…</p>:<dl className={styles.answers}>{detail.funnel_slug==='mamae-quero-historinha'&&<div><dt>Oferta 4 histórias (R$ 19,90)</dt><dd style={detail.combo4==='accepted'?{color:'var(--accent-green,#22c55e)',fontWeight:600}:undefined}>{detail.combo4==='accepted'?'Aceitou — entregar as 4 histórias':detail.combo4==='refused'?'Recusou — ficou com 1 história':detail.combo4==='viewed'?'Viu a oferta e saiu sem escolher':'Não chegou a ver a oferta'}</dd></div>}{Object.entries(detail.answers).filter(([key])=>!(detail.funnel_slug==='mamae-quero-historinha'&&key==='extra')).map(([key,value])=><div key={key}><dt>{detail.funnel_slug==='mamae-quero-historinha'?(labels[key]||key):key}</dt><dd>{typeof value==='boolean'?(value?'Sim':'Não'):Array.isArray(value)?value.join(', '):value===0?'0':String(value||'—')}</dd></div>)}</dl>}
    </dialog>;
}
