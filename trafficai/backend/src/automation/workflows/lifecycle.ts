import {query,transaction} from '../../database/connection';
import {decrypt} from '../../shared/encryption';
import {recoverableQuizContact} from '../../tracking/quiz-recovery';
import {hasJourneyPurchase,purchaseScope} from '../../tracking/journey-purchases';
import {emitEvent} from './events';
import {logger} from '../../shared/logger';

export function orderLifecycleType(status:string):string|null{
    return ({approved:'payment.approved',pending:'checkout.started',abandoned:'checkout.abandoned',refused:'payment.failed',canceled:'payment.expired',refunded:'refund.completed',chargeback:'chargeback.received'} as Record<string,string>)[status]||null;
}

async function contactDeal(product:any,externalId:string,contact:{name:string;email:string;phone:string},consent:boolean){
    return transaction(async tx=>{
        // Product configuration must point to a pipeline owned by this same account.
        const stages=await tx(`SELECT stage.id,stage.pipeline_id FROM comm_pipeline_stages stage JOIN comm_pipelines pipeline ON pipeline.id=stage.pipeline_id
            WHERE stage.id=$1 AND pipeline.id=$2 AND pipeline.user_id=$3`,[product.settings.lifecycle_stage_id,product.settings.lifecycle_pipeline_id,product.user_id]);
        if(!stages.length)return null;
        const rows=await tx(`INSERT INTO comm_deals(user_id,pipeline_id,stage_id,external_source,external_id,contact_name,contact_email,contact_phone,title)
            VALUES($1,$2,$3,'trafficai_lifecycle',$4,$5,NULLIF($6,''),NULLIF($7,''),$8)
            ON CONFLICT(user_id,external_source,external_id) WHERE external_source IS NOT NULL AND external_id IS NOT NULL
            DO UPDATE SET contact_name=COALESCE(NULLIF(EXCLUDED.contact_name,''),comm_deals.contact_name),
                contact_email=COALESCE(EXCLUDED.contact_email,comm_deals.contact_email),contact_phone=COALESCE(EXCLUDED.contact_phone,comm_deals.contact_phone),updated_at=NOW()
            RETURNING id`,[product.user_id,stages[0].pipeline_id,stages[0].id,externalId,contact.name,contact.email,contact.phone,product.name]);
        const id=rows[0].id;
        // An old opt-out is never silently replaced by an import or a worker cycle.
        if(consent)for(const channel of ['email','whatsapp']){
            const destination=channel==='email'?contact.email:contact.phone;if(!destination)continue;
            await tx(`INSERT INTO aw_consents(user_id,deal_id,channel,status,evidence) VALUES($1,$2,$3,'opted_in',$4)
                ON CONFLICT(user_id,deal_id,channel) DO NOTHING`,[product.user_id,id,channel,'Autorização explícita no quiz Historinha; contato '+externalId]);
        }
        return id;
    });
}

export async function syncLifecycleEvents(){
    const products=await query<any>(`SELECT * FROM aw_products WHERE active=true AND settings->>'lifecycle_enabled'='true'`);
    for(const product of products){
      try{
        const since=product.settings.lifecycle_started_at;
        if(typeof since!=='string'||!Number.isFinite(Date.parse(since)))continue;
        const scope=purchaseScope(product);
        if(!scope.sources.length||!scope.products.length)continue;
        const orders=await query<any>(`SELECT o.*,q.id AS quiz_id,q.answers_encrypted FROM tracking_orders o
            JOIN tracking_sources owner ON owner.id=o.source_id AND owner.user_id=$1
            LEFT JOIN tracking_quiz_sessions q ON q.order_id=o.id
            WHERE o.source_id=ANY($2::uuid[]) AND o.product_id=ANY($3::text[]) AND o.updated_at>=$4 AND ($5::text IS NULL OR o.raw->'item'->>'offer_code'=$5 OR o.raw->>'offer_code'=$5)
            AND NOT EXISTS(SELECT 1 FROM aw_events e WHERE e.user_id=$1 AND e.external_id='order:'||o.id::text||':'||o.status||':'||$6::text)
            ORDER BY o.updated_at LIMIT 100`,[product.user_id,scope.sources,scope.products,since,product.settings.purchase_offer_code||null,product.id]);
        for(const order of orders){
            const type=orderLifecycleType(order.status);if(!type)continue;
            let a:any={};try{if(order.answers_encrypted)a=JSON.parse(decrypt(order.answers_encrypted));}catch{}
            const c=recoverableQuizContact(a);
            const deal=await contactDeal(product,order.quiz_id?'quiz:'+order.quiz_id:'order:'+order.id,{name:order.customer_name||a.momName||'',email:order.customer_email||c.email,phone:order.customer_phone||c.phone},c.consent);
            if(!deal)continue;
            await emitEvent({userId:product.user_id,sourceId:product.source_id,externalId:'order:'+order.id+':'+order.status+':'+product.id,type,orderId:order.id,dealId:deal,productId:product.id});
        }
        const sessions=await query<any>(`SELECT q.*,f.source_id FROM tracking_quiz_sessions q JOIN tracking_quiz_funnels f ON f.id=q.funnel_id
            JOIN tracking_sources owner ON owner.id=f.source_id AND owner.user_id=$1
            WHERE f.source_id=$2 AND f.slug=$3 AND q.order_id IS NULL AND q.created_at>=$4
            AND q.updated_at<NOW()-INTERVAL '30 minutes' AND q.updated_at>NOW()-INTERVAL '7 days'
            AND NOT EXISTS(SELECT 1 FROM aw_events e WHERE e.user_id=$1 AND e.external_id='quiz:'||q.id::text)
            ORDER BY q.updated_at LIMIT 100`,[product.user_id,product.source_id,product.settings.quiz_slug,since]);
        for(const session of sessions){
            let answers:any;try{answers=JSON.parse(decrypt(session.answers_encrypted));}catch{continue;}
            const c=recoverableQuizContact(answers);if(!c.consent||(!c.email&&!c.phone))continue;
            if(await hasJourneyPurchase(product.user_id,product,c))continue;
            const deal=await contactDeal(product,'quiz:'+session.id,{name:answers.momName||'',email:c.email,phone:c.phone},true);
            if(!deal)continue;
            await emitEvent({userId:product.user_id,sourceId:product.source_id,externalId:'quiz:'+session.id,type:'quiz.abandoned',dealId:deal,productId:product.id,payload:{quiz_session_id:session.id}});
        }
      }catch{logger.warn('lifecycle: sincronização pendente', {product:product.id});}
    }
}
