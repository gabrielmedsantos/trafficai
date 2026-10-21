import { query } from '../database/connection';
import { decrypt } from '../shared/encryption';
import { quizSourceScope, HISTORINHA_JOURNEY } from './quiz-sharing';
import { hasJourneyPurchase } from './journey-purchases';

export function recoverableQuizContact(answers: any) {
    const email=typeof answers?.email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email)?answers.email.trim():'';
    const phone=String(answers?.phone||'').replace(/[^0-9+]/g,'');
    return {email,phone:phone.replace(/\D/g,'').length>=10?phone:'',consent:answers?.recoveryConsent===true};
}
export async function quizRecoveryCandidates(sourceId: string,userId: string,since: string,until: string) {
    const rows=await query<any>(`SELECT s.id,s.funnel_id,s.answers_encrypted,s.updated_at,s.current_step,s.tracking_session_id,
        f.name,f.slug,f.source_id,f.origin FROM tracking_quiz_sessions s JOIN tracking_quiz_funnels f ON f.id=s.funnel_id
        WHERE ${quizSourceScope()} AND s.order_id IS NULL
          AND s.created_at>=($2::date::timestamp AT TIME ZONE 'America/Fortaleza')
          AND s.created_at<(($3::date+1)::timestamp AT TIME ZONE 'America/Fortaleza')
          AND s.updated_at<NOW()-INTERVAL '30 minutes'
        ORDER BY s.updated_at DESC LIMIT 500`,[sourceId,since,until]);
    const result=[];
    for(const row of rows){
        let answers:any;try{answers=JSON.parse(decrypt(row.answers_encrypted));}catch{continue;}
        const contact=recoverableQuizContact(answers);if(!contact.email&&!contact.phone)continue;
        // Only mapped products can be enrolled; unknown quizzes remain manually reviewable.
        const mapped=row.source_id===HISTORINHA_JOURNEY.sourceId&&row.slug===HISTORINHA_JOURNEY.slug;
        const product=mapped?{source_id:row.source_id,external_product_id:HISTORINHA_JOURNEY.productIds[0]}:null;
        if(product&&await hasJourneyPurchase(userId,product,contact))continue;
        result.push({id:row.id,funnel_id:row.funnel_id,name:row.name,current_step:row.current_step,updated_at:row.updated_at,
            customer_name:String(answers.momName||''),customer_email:contact.email,customer_phone:contact.phone,
            consent:contact.consent,mapped,quiz_url:row.origin,source_id:row.source_id});
    }
    return result;
}
