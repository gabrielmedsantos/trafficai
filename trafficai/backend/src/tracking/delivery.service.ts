import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import axios from 'axios';
import { query,queryOne } from '../database/connection';
import { encrypt,decrypt,decryptMaybe } from '../shared/encryption';
import { DeliveryError,deliveryProfile,purchasedExtras } from './delivery-profile';
import { logger } from '../shared/logger';
import { normEmail,normPhone,sameBrazilPhoneSql,sha256 } from './tracking.service';

export const storageRoot=()=>path.resolve(process.env.DELIVERY_STORAGE_ROOT||'/data/deliveries');
export function jobDirectory(id:string){
    if(!/^[a-f0-9-]{36}$/i.test(id))throw new DeliveryError('Identificador de geração inválido.',400);
    return path.join(storageRoot(),'jobs',id);
}
export async function deliveryOrder(sourceId:string,orderId:string,userId:string){
    const order=await queryOne<any>(`SELECT o.*,s.user_id FROM tracking_orders o JOIN tracking_sources s ON s.id=o.source_id
        WHERE o.id=$1 AND o.source_id=$2 AND s.user_id=$3`,[orderId,sourceId,userId]);
    if(!order)throw new DeliveryError('Pedido não encontrado.',404);
    return order;
}
async function audit(deliveryId:string,actorId:string|null,action:string,details:any={}){
    await query('INSERT INTO tracking_delivery_history(delivery_id,actor_id,action,details) VALUES($1,$2,$3,$4::jsonb)',[deliveryId,actorId,action,JSON.stringify(details)]);
}
// Oferta "4 aventuras": pedidos feitos por estas ofertas do checkout levam um livro de cada cenário.
const COMBO4_OFFERS=(process.env.DELIVERY_COMBO4_OFFERS||'O97B9CEC1').split(',').map(x=>x.trim()).filter(Boolean);
export const STORY_SETTINGS:Record<string,string>={floresta:'Floresta',reino:'Reino encantado',fazendinha:'Fazendinha','fundo-do-mar':'Fundo do mar'};
const STORY_KIND=/^historia(-(floresta|reino|fazendinha|fundo-do-mar))?$/;
export const isStoryKind=(kind:unknown)=>STORY_KIND.test(String(kind||''));
export const storyKindLabel=(kind:string)=>STORY_SETTINGS[kind.replace(/^historia-?/,'')]||'';
export const isCombo4Order=(order:any)=>COMBO4_OFFERS.includes(String(order?.raw?.item?.offer_code||''));
export async function eligibleDelivery(order:any, nameOverride?:string, settingOverride?:string){
    if(order.status!=='approved')throw new DeliveryError('A entrega exige um pedido aprovado.');
    const settings=await queryOne<any>('SELECT * FROM tracking_delivery_settings WHERE source_id=$1 AND enabled=true',[order.source_id]);
    const storyProduct=!!settings?.product_ids?.map(String).includes(String(order.product_id));
    const coloringProduct=!!settings?.coloring_product_ids?.map(String).includes(String(order.product_id));
    if(!settings||(!storyProduct&&!coloringProduct))throw new DeliveryError('Este produto ainda não tem templates de entrega configurados.');
    // If both products were recorded as separate approved orders, attach the
    // coloring add-on to the story order. That keeps one delivery record and
    // one WhatsApp delivery for the complete package.
    let hasSeparateColoring=false;
    if(storyProduct&&(order.customer_email_hash||order.customer_phone_hash)){
        const date=order.approved_at||order.order_created_at||order.created_at;
        const companion=await queryOne<any>(`SELECT o.id FROM tracking_orders o
            WHERE o.source_id=$1 AND o.id<>$2 AND o.product_id=ANY($3::text[])
              AND o.status='approved'
              AND COALESCE(o.approved_at,o.order_created_at,o.created_at)
                  BETWEEN $4::timestamptz-INTERVAL '24 hours' AND $4::timestamptz+INTERVAL '24 hours'
              AND COALESCE(o.gross_value,0)>COALESCE($5::numeric,0)
              AND (($6::text IS NOT NULL AND o.customer_email_hash=$6)
                OR ($7::text IS NOT NULL AND o.customer_phone_hash=$7))
            ORDER BY ABS(EXTRACT(EPOCH FROM (COALESCE(o.approved_at,o.order_created_at,o.created_at)-$4::timestamptz)))
            LIMIT 1`,[order.source_id,order.id,settings.coloring_product_ids.map(String),date,order.gross_value,
                order.customer_email_hash||null,order.customer_phone_hash||null]);
        hasSeparateColoring=!!companion;
    }
    let coloringOnly=coloringProduct&&!storyProduct;
    let sessions=await query<any>(`SELECT q.id,q.answers_encrypted FROM tracking_quiz_sessions q JOIN tracking_quiz_funnels f ON f.id=q.funnel_id
        WHERE q.order_id=$1 AND f.source_id=$2 AND f.slug=$3 ORDER BY q.updated_at DESC,q.created_at DESC LIMIT 2`,[order.id,order.source_id,settings.funnel_slug]);
    if(sessions.length>1)throw new DeliveryError('Mais de um formulário está ligado a este pedido. Confirme qual resposta pertence à compra.');
    if(!sessions.length){
        const ref=String(order.raw?.tracking?.quiz_session_id||order.raw?.tracking?.s1||order.raw?.tracking?.sck||order.sck||'').trim();
        if(ref)sessions=await query<any>(`SELECT q.id,q.answers_encrypted FROM tracking_quiz_sessions q JOIN tracking_quiz_funnels f ON f.id=q.funnel_id
            WHERE f.source_id=$1 AND f.slug=$2 AND (q.id::text=$3 OR q.tracking_session_id=$3)
            ORDER BY q.updated_at DESC,q.created_at DESC LIMIT 2`,[order.source_id,settings.funnel_slug,ref]);
    }
    let matchedByContact=false;
    if(!sessions.length&&(order.customer_email_hash||order.customer_phone_hash||order.customer_email||order.customer_phone)){
        const date=order.approved_at||order.order_created_at||order.created_at;
        const candidates=await query<any>(`SELECT q.id,q.answers_encrypted FROM tracking_quiz_sessions q JOIN tracking_quiz_funnels f ON f.id=q.funnel_id
            WHERE f.source_id=$1 AND f.slug=$2 AND q.created_at BETWEEN $3::timestamptz-INTERVAL '30 days' AND $3::timestamptz+INTERVAL '1 day'
              AND (q.order_id IS NULL OR q.order_id=$4 OR EXISTS(
                  SELECT 1 FROM tracking_orders previous_order WHERE previous_order.id=q.order_id
                    AND previous_order.source_id=$1 AND previous_order.status IN ('pending','abandoned','refused','canceled')))
            ORDER BY ABS(EXTRACT(EPOCH FROM (q.created_at-$3::timestamptz))),q.updated_at DESC LIMIT 1000`,[order.source_id,settings.funnel_slug,date,order.id]);
        const canonicalPhone=(value:unknown)=>{
            let digits=normPhone(String(value||''));
            if(digits.startsWith('55')&&digits.length>11)digits=digits.slice(2);
            if(digits.length===11&&digits[2]==='9')digits=digits.slice(0,2)+digits.slice(3);
            return digits;
        };
        const matches=candidates.filter((candidate:any)=>{
            try{
                const answers=JSON.parse(decrypt(candidate.answers_encrypted));
                const email=answers.email||answers.customer_email;
                const phone=answers.phone||answers.whatsapp||answers.telefone||answers.customer_phone;
                const emailMatches=!!((order.customer_email_hash&&email&&sha256(normEmail(String(email)))===order.customer_email_hash)
                    ||(order.customer_email&&email&&normEmail(String(order.customer_email))===normEmail(String(email))));
                const phoneMatches=!!((order.customer_phone_hash&&phone&&sha256(normPhone(String(phone)))===order.customer_phone_hash)
                    ||(order.customer_phone&&phone&&canonicalPhone(order.customer_phone)===canonicalPhone(phone)&&canonicalPhone(phone).length>=10));
                return emailMatches||phoneMatches;
            }catch{return false;}
        });
        if(matches.length>1)throw new DeliveryError('Encontramos mais de um formulário recente com este contato. Abra as respostas do quiz e vincule ao pedido o formulário correto antes de gerar.');
        if(matches.length===1){sessions=matches;matchedByContact=true;}
    }
    if(!sessions.length&&coloringOnly&&(order.customer_email_hash||order.customer_phone_hash||order.customer_phone)){
        sessions=await query<any>(`WITH candidates AS (
            SELECT DISTINCT q.id,q.answers_encrypted,q.updated_at,q.created_at
            FROM tracking_orders target_order
            JOIN tracking_orders story_order ON story_order.source_id=target_order.source_id AND story_order.id<>target_order.id
                AND story_order.status='approved' AND story_order.product_id=ANY($3::text[])
            JOIN tracking_quiz_sessions q ON q.order_id=story_order.id
            JOIN tracking_quiz_funnels f ON f.id=q.funnel_id
            WHERE target_order.id=$1 AND f.source_id=$2 AND f.slug=$4
              AND ((target_order.customer_email_hash IS NOT NULL AND target_order.customer_email_hash=story_order.customer_email_hash)
                OR (target_order.customer_phone_hash IS NOT NULL AND target_order.customer_phone_hash=story_order.customer_phone_hash)
                OR ${sameBrazilPhoneSql('target_order','story_order')})
        ) SELECT id,answers_encrypted FROM candidates ORDER BY updated_at DESC,created_at DESC LIMIT 2`,
        [order.id,order.source_id,settings.product_ids.map(String),settings.funnel_slug]);
        if(sessions.length>1)throw new DeliveryError('Há mais de um formulário possível para este pedido de colorir. Abra as respostas do quiz e confirme o vínculo antes de gerar.');
    }
    if(!sessions.length)throw new DeliveryError('Vincule as respostas do quiz a este pedido antes de gerar. Se comprou apenas o livro para colorir, o sistema precisa localizar a compra principal pelo mesmo telefone ou e-mail.');
    // Ticto can send a bundle (story + coloring) as a single transaction
    // associated with the coloring product ID. When there is no separate
    // story order, infer the bundle from the paid amount only if the quiz has
    // a complete story profile and the amount exceeds the normal story price
    // observed for this source/platform. This leaves genuine coloring-only
    // orders classified as coloring-only.
    if(coloringOnly&&Number(order.gross_value)>0){
        const answers=JSON.parse(decrypt(sessions[0].answers_encrypted));
        let storyProfile:any=null;
        try{storyProfile=deliveryProfile(answers,nameOverride,false,settingOverride);}catch{}
        if(storyProfile){
            const baseline=await queryOne<any>(`SELECT MIN(gross_value) AS story_base
                FROM tracking_orders
                WHERE source_id=$1 AND platform=$2 AND status='approved'
                  AND product_id=ANY($3::text[]) AND gross_value>0
                  AND COALESCE(approved_at,order_created_at,created_at)>=NOW()-INTERVAL '180 days'`,
                [order.source_id,order.platform,settings.product_ids.map(String)]);
            const storyBase=Number(baseline?.story_base);
            if(Number.isFinite(storyBase)&&storyBase>0&&Number(order.gross_value)>storyBase+0.01)coloringOnly=false;
        }
    }
    // Ticto may report a combined story + coloring payment under the coloring
    // product while the earlier story checkout remains pending. Only treat it
    // as a bundle when the same buyer has a nearby story order and the paid
    // coloring transaction covers at least that story amount as well.
    if(coloringOnly&&Number(order.gross_value)>0){
        const date=order.approved_at||order.order_created_at||order.created_at;
        const companion=await queryOne<any>(`SELECT o.id FROM tracking_orders o
            WHERE o.source_id=$1 AND o.id<>$2 AND o.product_id=ANY($3::text[])
              AND o.status IN ('pending','approved')
              AND COALESCE(o.approved_at,o.order_created_at,o.created_at)
                  BETWEEN $4::timestamptz-INTERVAL '24 hours' AND $4::timestamptz+INTERVAL '24 hours'
              AND $5::numeric>COALESCE(o.gross_value,0)
              AND (($6::text IS NOT NULL AND o.customer_email_hash=$6)
                OR ($7::text IS NOT NULL AND o.customer_phone_hash=$7))
            ORDER BY ABS(EXTRACT(EPOCH FROM (COALESCE(o.approved_at,o.order_created_at,o.created_at)-$4::timestamptz)))
            LIMIT 1`,[order.source_id,order.id,settings.product_ids.map(String),date,order.gross_value,
                order.customer_email_hash||null,order.customer_phone_hash||null]);
        if(companion)coloringOnly=false;
    }
    const profile=deliveryProfile(JSON.parse(decrypt(sessions[0].answers_encrypted)),nameOverride,coloringOnly,settingOverride);
    const extras=purchasedExtras(order,settings);
    return {...profile,...extras,combo4:!coloringOnly&&isCombo4Order(order),coloring:coloringOnly||extras.coloring||hasSeparateColoring,coloringOnly,sessionId:sessions[0].id,matchedByContact,version:settings.template_version};
}
export async function viewDelivery(order:any){
    const row=await queryOne<any>('SELECT * FROM tracking_order_deliveries WHERE order_id=$1 AND source_id=$2',[order.id,order.source_id]);
    let profile:any=null,eligibilityError='';
    try{profile=await eligibleDelivery(order);}catch(e:any){eligibilityError=e.message;}
    if(!row)return {delivery:null,profile,eligibilityError};
    const snapshot=JSON.parse(decrypt(row.snapshot_encrypted));
    const history=await query('SELECT action,details,created_at FROM tracking_delivery_history WHERE delivery_id=$1 ORDER BY id DESC LIMIT 20',[row.id]);
    return {profile:profile||(snapshot.manual?null:snapshot),eligibilityError,delivery:{id:row.id,status:row.status,attempt:row.attempt,last_error:row.last_error,delivered_at:row.delivered_at,
        cleanup_pending:row.cleanup_pending,completion_method:row.completion_method,
        files:row.files.map((file:any)=>({kind:file.kind,state:file.state,bytes:file.bytes,template:file.template,message_id:file.message_id||null})),history}};
}
export async function queueDelivery(order:any,actorId:string,regenerate=false,nameOverride?:string,settingOverride?:string){
    if(order.status!=='approved')throw new DeliveryError('O pedido não está aprovado.');
    const old=await queryOne<any>('SELECT * FROM tracking_order_deliveries WHERE order_id=$1',[order.id]);
    if(old&&['queued','generating','ready','sending'].includes(old.status))return old;
    if(old?.status==='delivered'&&!regenerate)throw new DeliveryError('Este pedido já foi entregue. Use Gerar novamente para preparar um reenvio.');
    if(old?.cleanup_pending)throw new DeliveryError('A limpeza da entrega anterior ainda está pendente. Tente novamente em instantes.');
    const config=await queryOne<any>('SELECT * FROM tracking_delivery_settings WHERE source_id=$1 AND enabled=true',[order.source_id]);
    const storyProduct=!!config?.product_ids?.map(String).includes(String(order.product_id));
    const coloringProduct=!!config?.coloring_product_ids?.map(String).includes(String(order.product_id));
    if(!config||(!storyProduct&&!coloringProduct))throw new DeliveryError('O produto não tem entregas habilitadas.');
    // Re-read the exact linked quiz session on every generation, including re-sends.
    // Otherwise a regenerated PDF silently keeps stale profile/scenario answers.
    const currentProfile=await eligibleDelivery(order,nameOverride,settingOverride);
    if(currentProfile.matchedByContact){
        const linked=await query<any>(`UPDATE tracking_quiz_sessions SET order_id=$1,updated_at=NOW()
            WHERE id=$2 AND (order_id IS NULL OR order_id=$1 OR EXISTS(
                SELECT 1 FROM tracking_orders previous_order WHERE previous_order.id=tracking_quiz_sessions.order_id
                  AND previous_order.source_id=$3 AND previous_order.status IN ('pending','abandoned','refused','canceled')))
            RETURNING id`,[order.id,currentProfile.sessionId,order.source_id]);
        if(!linked.length)throw new DeliveryError('O formulário foi vinculado a outro pedido enquanto esta entrega era preparada. Atualize e confira as respostas antes de gerar.');
    }
    const previousProfile=old?JSON.parse(decrypt(old.snapshot_encrypted)):null;
    const profile={...currentProfile,
        coloring:previousProfile?.coloring||currentProfile.coloring,
        priority:previousProfile?.priority||currentProfile.priority,
        coloringOnly:currentProfile.coloringOnly};
    if(order.status!=='approved')throw new DeliveryError('O pedido não está aprovado.');
    const previousColoring=old?.files?.find((file:any)=>file.kind==='colorir'&&file.state==='sent');
    const otherStories=profile.combo4&&!profile.coloringOnly?Object.keys(STORY_SETTINGS).filter(s=>s!==profile.setting)
        .map(s=>({kind:`historia-${s}`,setting:s,template:`${profile.moral}-${s}-${profile.gender}`,state:'pending'})):[];
    const files=[...(profile.coloringOnly?[]:[{kind:'historia',template:`${profile.moral}-${profile.setting}-${profile.gender}`,state:'pending'}]),...otherStories,
        ...(profile.coloring?[previousColoring?{...previousColoring,template:`colorir-${profile.gender}`}:{kind:'colorir',template:`colorir-${profile.gender}`,state:'pending'}]:[])];
    const id=old?.id||crypto.randomUUID();const generation=old?.status==='partial'?old.generation_id:crypto.randomUUID();
    const rows=await query<any>(`INSERT INTO tracking_order_deliveries(id,order_id,source_id,status,snapshot_encrypted,template_version,files,generation_id)
        VALUES($1,$2,$3,'queued',$4,$5,$6::jsonb,$7)
        ON CONFLICT(order_id) DO UPDATE SET status='queued',generation_id=EXCLUDED.generation_id,files=EXCLUDED.files,
        attempt=tracking_order_deliveries.attempt+1,last_error=NULL,delivered_at=NULL,delivered_by=NULL,completion_method=NULL,updated_at=NOW()
        WHERE tracking_order_deliveries.status IN ('failed','delivered','partial') AND tracking_order_deliveries.cleanup_pending=false RETURNING *`,
        [id,order.id,order.source_id,encrypt(JSON.stringify(profile)),profile.version,JSON.stringify(files),generation]);
    if(!rows.length)throw new DeliveryError('Este pedido já está sendo preparado.');
    await audit(id,actorId,old?'regenerated':'queued',{version:profile.version,files:files.map(f=>f.kind)});
    return rows[0];
}
export function personalizeFiles(row:any):Promise<any[]> {
    const profile=JSON.parse(decrypt(row.snapshot_encrypted));
    return new Promise((resolve,reject)=>{
        const child=spawn(process.env.DELIVERY_PYTHON||'/opt/pdf-runtime/bin/python',[path.resolve('scripts/personalize-delivery.py')],
            {env:{...process.env,DELIVERY_STORAGE_ROOT:storageRoot()},stdio:['pipe','pipe','pipe']});
        let output='';const timeout=setTimeout(()=>child.kill(),row.files.length>2?240000:60000);
        child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.length>64000)child.kill();});
        child.stderr.on('data',()=>{}); // Never put the child's personal data in API errors/logs.
        child.on('error',()=>{clearTimeout(timeout);reject(new DeliveryError('Não foi possível iniciar o gerador de PDF.'));});
        child.on('close',code=>{clearTimeout(timeout);try{if(code!==0)throw new Error();resolve(JSON.parse(output));}catch{reject(new DeliveryError('Falha ao preencher ou validar o template. Nenhum arquivo foi liberado.'));}});
        child.stdin.on('error',()=>{});
        child.stdin.end(JSON.stringify({name:profile.name,gender:profile.gender,age:profile.age,skin:profile.skin,
            hairColor:profile.hairColor,hairType:profile.hairType,eyes:profile.eyes,moral:profile.moral,
            setting:profile.setting,special:profile.special,temperament:profile.temperament,preference:profile.preference,dedicationName:profile.dedicationName,
            version:row.template_version,generationId:row.generation_id,files:row.files}));
    });
}
export async function cleanupDelivery(row:any){
    await fs.rm(jobDirectory(row.generation_id),{recursive:true,force:true});
    await query('UPDATE tracking_order_deliveries SET cleanup_pending=false,updated_at=NOW() WHERE id=$1 AND generation_id=$2',[row.id,row.generation_id]);
}
/** Entrega feita fora do painel (arquivo enviado à mão): registra a conclusão mesmo sem PDFs gerados aqui. */
export async function markDeliveredManually(order:any,actorId:string|null){
    if(order.status!=='approved')throw new DeliveryError('O pedido não está aprovado.');
    const old=await queryOne<any>('SELECT status FROM tracking_order_deliveries WHERE order_id=$1 AND source_id=$2',[order.id,order.source_id]);
    if(old&&['ready','partial'].includes(old.status))return completeDelivery(order,actorId,'manual_external');
    if(old?.status==='delivered')return;
    if(old&&old.status!=='failed')throw new DeliveryError('Esta entrega está em processamento. Aguarde terminar antes de marcar como entregue.');
    const settings=await queryOne<any>('SELECT template_version FROM tracking_delivery_settings WHERE source_id=$1',[order.source_id]);
    const rows=await query<any>(`INSERT INTO tracking_order_deliveries(order_id,source_id,status,snapshot_encrypted,template_version,files,delivered_at,delivered_by,completion_method)
        VALUES($1,$2,'delivered',$3,$4,'[]'::jsonb,NOW(),$5,'manual_external')
        ON CONFLICT(order_id) DO UPDATE SET status='delivered',delivered_at=NOW(),delivered_by=EXCLUDED.delivered_by,
        completion_method='manual_external',last_error=NULL,updated_at=NOW()
        WHERE tracking_order_deliveries.status='failed' RETURNING *`,
        [order.id,order.source_id,encrypt(JSON.stringify({manual:true})),settings?.template_version||'manual',actorId]);
    if(!rows.length)throw new DeliveryError('Não foi possível marcar esta entrega. Atualize a tela e tente de novo.');
    await audit(rows[0].id,actorId,'delivered',{method:'manual_external'});
}
export async function completeDelivery(order:any,actorId:string|null,method='manual'){
    if(order.status!=='approved')throw new DeliveryError('O pedido não está aprovado.');
    const rows=await query<any>(`UPDATE tracking_order_deliveries SET status='delivered',delivered_at=NOW(),delivered_by=$3,
        completion_method=$4,cleanup_pending=true,last_error=NULL,updated_at=NOW()
        WHERE order_id=$1 AND source_id=$2 AND status IN ('ready','partial') RETURNING *`,[order.id,order.source_id,actorId,method]);
    if(!rows.length)throw new DeliveryError('Não há arquivos prontos para confirmar a entrega.');
    await audit(rows[0].id,actorId,'delivered',{method,attempt:rows[0].attempt});
    try{await cleanupDelivery(rows[0]);}catch{logger.warn('delivery cleanup pending',{deliveryId:rows[0].id});}
}
export async function fileForOrder(order:any,kind:string){
    if(order.status!=='approved')throw new DeliveryError('O pedido não está aprovado.');
    if(kind!=='colorir'&&!isStoryKind(kind))throw new DeliveryError('Arquivo inválido.',404);
    const row=await queryOne<any>('SELECT * FROM tracking_order_deliveries WHERE order_id=$1 AND source_id=$2',[order.id,order.source_id]);
    if(!row||!['ready','partial'].includes(row.status)||!row.files.some((f:any)=>f.kind===kind))throw new DeliveryError('Arquivo temporário indisponível. Gere novamente se a entrega já foi concluída.',404);
    const file=row.files.find((f:any)=>f.kind===kind);
    const filename=path.join(jobDirectory(row.generation_id),kind+'.pdf');
    const bytes=await fs.readFile(filename);
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new DeliveryError('O arquivo não passou na conferência de integridade.');
    return {filename,bytes};
}
export async function deliveryWhatsAppConfig(userId:string,sourceId:string){
    const settings=await queryOne<any>(`SELECT d.whatsapp_config FROM tracking_delivery_settings d JOIN tracking_sources s ON s.id=d.source_id WHERE d.source_id=$1 AND s.user_id=$2`,[sourceId,userId]);
    const selected=settings?.whatsapp_config;
    if(!selected?.integrationId||!/^\d{10,15}$/.test(selected.phone||''))throw new DeliveryError('Conecte e configure o WhatsApp da Alfa para esta operação antes de enviar.');
    const integration=await queryOne<any>(`SELECT type,config,credentials FROM comm_integrations WHERE id=$1 AND user_id=$2 AND type IN ('whatsapp_evolution','whatsapp_uazapi') AND status='connected'`,[selected.integrationId,userId]);
    if(!integration)throw new DeliveryError('Conecte o WhatsApp da Alfa para esta operação antes de enviar.');
    const config=integration?.config||{},credentials=integration?.credentials||{};
    if(integration.type==='whatsapp_uazapi'){
        const base=config.baseUrl||process.env.UAZAPI_BASE_URL;
        const key=decryptMaybe(credentials.instance_token);
        if(!base||!key)throw new DeliveryError('Conecte o WhatsApp da Alfa na Uazapi antes de enviar.');
        return {provider:'uazapi' as const,base,key,instance:'',phone:selected.phone as string};
    }
    const base=credentials.evolution_base_url||config.baseUrl||process.env.EVOLUTION_API_BASE_URL;
    const key=decryptMaybe(credentials.evolution_api_key||credentials.apiKey)||process.env.EVOLUTION_API_KEY;
    const instance=config.instanceName||config.instance;
    if(!base||!key||!instance)throw new DeliveryError('Conecte o WhatsApp da operação antes de enviar.');
    return {provider:'evolution' as const,base,key,instance,phone:selected.phone as string};
}
async function verifyDeliverySender(sender:Awaited<ReturnType<typeof deliveryWhatsAppConfig>>){
    try{
        if(sender.provider==='uazapi'){
            const {data}=await axios.get(`${sender.base.replace(/\/$/,'')}/instance/status`,{headers:{token:sender.key},timeout:15000});
            const current=data.instance||{};
            const phone=String(current.owner||data.status?.jid?.id||'').split('@')[0].split(':')[0].replace(/\D/g,'');
            const connected=data.status?.connected===true||data.connected===true||current.status==='connected';
            if(!connected||phone!==sender.phone)throw new DeliveryError('Conecte o número da Alfa configurado para esta operação. O telefone conectado não corresponde ao remetente autorizado.');
            return;
        }
        const {data}=await axios.get(`${sender.base.replace(/\/$/,'')}/instance/fetchInstances`,{params:{instanceName:sender.instance},headers:{apikey:sender.key},timeout:15000});
        const instances=(Array.isArray(data)?data:[data]).map((x:any)=>x.instance||x);
        const current=instances.find((x:any)=>(x.instanceName||x.name)===sender.instance);
        const phone=String(current?.ownerJid||current?.owner||'').split('@')[0].replace(/\D/g,'');
        if(phone!==sender.phone||!['open','connected'].includes(current?.state||current?.connectionStatus))throw new DeliveryError('Conecte o número da Alfa configurado para esta operação. O telefone conectado não corresponde ao remetente autorizado.');
    }catch(e){if(e instanceof DeliveryError)throw e;throw new DeliveryError('Não foi possível confirmar o WhatsApp da Alfa. Nenhum arquivo foi enviado.');}
}
export async function sendDeliveryDocument(sender:Awaited<ReturnType<typeof deliveryWhatsAppConfig>>,phone:string,bytes:Buffer,kind:string,name:string,caption:string){
    const {base,key,instance}=sender;
    const fileName=`${isStoryKind(kind)?'Sua-historinha':'Para-colorir'}-${name.replace(/[^\p{L}\p{N} -]/gu,'').slice(0,40)}${kind.startsWith('historia-')?'-'+storyKindLabel(kind).replace(/ /g,'-'):''}.pdf`;
    const request=sender.provider==='uazapi'
        ? {url:`${base.replace(/\/$/,'')}/send/media`,body:{number:phone,type:'document',mimetype:'application/pdf',file:bytes.toString('base64'),docName:fileName,text:caption,async:false},headers:{token:key,'Content-Type':'application/json'}}
        : {url:`${base.replace(/\/$/,'')}/message/sendMedia/${encodeURIComponent(instance)}`,body:
        {number:phone,mediatype:'document',mimetype:'application/pdf',media:bytes.toString('base64'),
        fileName,caption},headers:{apikey:key,'Content-Type':'application/json'}};
    const {data}=await axios.post(request.url,request.body,{headers:request.headers,timeout:60000,maxBodyLength:32*1024*1024});
    const messageId=sender.provider==='uazapi'?data?.messageid:data?.key?.id;
    if(typeof messageId!=='string'||!messageId.trim()||data?.error||['failed','canceled'].includes(String(data?.status||'').toLowerCase()))throw new DeliveryError('O WhatsApp não confirmou o identificador do envio. Confira a conversa antes de reenviar.');
    return messageId as string;
}
export async function sendOrderDelivery(order:any,actorId:string,message:string){
    if(order.status!=='approved')throw new DeliveryError('O pedido não está aprovado.');
    let phone=String(order.customer_phone||'').replace(/\D/g,'');
    if(phone.length===10||phone.length===11)phone='55'+phone;
    if(!/^\d{10,15}$/.test(phone))throw new DeliveryError('Confira o telefone do comprador antes de enviar.');
    const sender=await deliveryWhatsAppConfig(order.user_id,order.source_id);
    await verifyDeliverySender(sender);
    const rows=await query<any>(`UPDATE tracking_order_deliveries SET status='sending',updated_at=NOW(),last_error=NULL
        WHERE order_id=$1 AND source_id=$2 AND status IN ('ready','partial') RETURNING *`,[order.id,order.source_id]);
    if(!rows.length)throw new DeliveryError('Esta entrega já está em processamento ou não tem arquivos prontos.');
    const row=rows[0];const profile=JSON.parse(decrypt(row.snapshot_encrypted));
    try{
        if(row.files.some((f:any)=>['uncertain','sending'].includes(f.state)))throw new DeliveryError('Um envio anterior ficou sem confirmação. Confira o WhatsApp e marque a entrega manualmente; ele não será repetido automaticamente.');
        for(const file of row.files){
            if(file.state==='sent')continue;
            const bytes=await fs.readFile(path.join(jobDirectory(row.generation_id),file.kind+'.pdf'));
            if(crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new DeliveryError('Arquivo inválido. Não foi enviado.');
            file.state='sending';await saveFiles(row);
            try{
                file.message_id=await sendDeliveryDocument(sender,phone,bytes,file.kind,profile.name,file.kind==='historia'?message:isStoryKind(file.kind)?`Mais uma aventura de ${profile.name}: ${storyKindLabel(file.kind)}.`:`Aqui está o caderno para colorir de ${profile.name}. Boa diversão!`);
                file.state='sent';await saveFiles(row);
                await audit(row.id,actorId,'document_sent',{kind:file.kind,message_id:file.message_id,attempt:row.attempt});
            }catch(e:any){file.state=(e.response?.status&&e.response.status<500)||(e instanceof DeliveryError&&e.message.startsWith('Conecte'))?'failed':'uncertain';await saveFiles(row);throw e;}
        }
        // Provider acceptance is not proof of delivery to the recipient.
        await query(`UPDATE tracking_order_deliveries SET status='partial',last_error=NULL,updated_at=NOW() WHERE id=$1 AND status='sending'`,[row.id]);
        await audit(row.id,actorId,'send_accepted',{attempt:row.attempt});
    }catch(e:any){
        const error=e instanceof DeliveryError?e.message:'O envio não foi concluído. Confira o WhatsApp antes de tentar novamente.';
        await query(`UPDATE tracking_order_deliveries SET status='partial',last_error=$2,updated_at=NOW() WHERE id=$1 AND status='sending'`,[row.id,error]);
        throw new DeliveryError(error);
    }
}
async function saveFiles(row:any){await query("UPDATE tracking_order_deliveries SET files=$2::jsonb,updated_at=NOW() WHERE id=$1 AND status='sending'",[row.id,JSON.stringify(row.files)]);}

let working=false;
export async function processDeliveryQueue(){
    if(working)return;working=true;
    try{
        // Interrupted sends are ambiguous; never resend them without review.
        await query(`UPDATE tracking_order_deliveries SET status='partial',last_error='Envio interrompido. Confira a conversa antes de confirmar a entrega.',updated_at=NOW() WHERE status='sending' AND updated_at<NOW()-INTERVAL '5 minutes'`);
        await query(`UPDATE tracking_order_deliveries SET status='failed',cleanup_pending=true,last_error='Geração interrompida. Use Gerar novamente.',updated_at=NOW() WHERE status='generating' AND updated_at<NOW()-INTERVAL '5 minutes'`);
        const cleanup=await query<any>('SELECT * FROM tracking_order_deliveries WHERE cleanup_pending=true LIMIT 20');
        for(const row of cleanup){try{await cleanupDelivery(row);}catch{}}
        const row=await queryOne<any>(`UPDATE tracking_order_deliveries SET status='generating',updated_at=NOW() WHERE id=(
            SELECT id FROM tracking_order_deliveries WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`);
        if(!row)return;
        try{
            const order=await queryOne<any>('SELECT status FROM tracking_orders WHERE id=$1 AND source_id=$2',[row.order_id,row.source_id]);
            if(order?.status!=='approved')throw new DeliveryError('O pagamento deixou de estar aprovado.');
            // Files already sent are rebuilt too, so they can still be downloaded after a
            // regeneration, but they keep their sent state and are not sent again.
            const generated=await personalizeFiles(row);
            const files=generated.map((file:any)=>{
                const sent=row.files.find((previous:any)=>previous.kind===file.kind&&previous.state==='sent');
                return sent?{...file,state:'sent',message_id:sent.message_id}:file;
            });
            await query(`UPDATE tracking_order_deliveries SET status='ready',files=$2::jsonb,last_error=NULL,updated_at=NOW() WHERE id=$1 AND generation_id=$3 AND status='generating'`,[row.id,JSON.stringify(files),row.generation_id]);
            await audit(row.id,null,'generated',{attempt:row.attempt,files:files.map(f=>({kind:f.kind,bytes:f.bytes,sha256:f.sha256}))});
        }catch(e:any){
            let cleanupPending=false;
            try{await fs.rm(jobDirectory(row.generation_id),{recursive:true,force:true});}catch{cleanupPending=true;}
            await query("UPDATE tracking_order_deliveries SET status='failed',last_error=$2,cleanup_pending=$4,updated_at=NOW() WHERE id=$1 AND generation_id=$3",[row.id,e instanceof DeliveryError?e.message:'Não foi possível gerar os arquivos.',row.generation_id,cleanupPending]);
        }
    }catch(e:any){logger.error('delivery worker failed',{error:e.code||'internal'});}finally{working=false;}
}
export function startDeliveryWorker(){setInterval(()=>void processDeliveryQueue(),5000).unref();void processDeliveryQueue();}
