'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';

/** Foto opcional que o responsável enviou no quiz. Não renderiza nada quando a sessão não tem foto. */
export function QuizPhoto({sourceId,sessionId}:{sourceId:string;sessionId?:string|null}){
    const [url,setUrl]=useState('');
    useEffect(()=>{
        if(!sourceId||!sessionId)return;
        let active=true,created='';
        api.getQuizSessionPhoto(sourceId,sessionId).then(blob=>{if(active&&blob){created=URL.createObjectURL(blob);setUrl(created);}}).catch(()=>{});
        return()=>{active=false;if(created)URL.revokeObjectURL(created);setUrl('');};
    },[sourceId,sessionId]);
    if(!url)return null;
    return <figure style={{margin:'16px 0',display:'flex',gap:14,alignItems:'center'}}>
        <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="Foto enviada pelo responsável no quiz" style={{width:112,height:112,objectFit:'cover',borderRadius:12,border:'1px solid var(--border)'}}/></a>
        <figcaption style={{fontSize:12,lineHeight:1.6,color:'var(--text-muted)'}}><strong style={{display:'block',color:'var(--text-primary)'}}>Foto enviada no quiz</strong>Use como referência para o personagem. Toque para ampliar.</figcaption>
    </figure>;
}
