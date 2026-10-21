import { query } from '../database/connection';
import { HISTORINHA_JOURNEY } from './quiz-sharing';
import { sameBrazilPhoneSql } from './tracking.service';

export function purchaseScope(product: any, includeOffers=false) {
    const j=HISTORINHA_JOURNEY;
    const family=product?.source_id===j.sourceId && (j.productIds as readonly string[]).includes(product?.external_product_id);
    return family ? {sources:[j.sourceId,j.sharedSourceId],products:[...j.productIds]} : {
        sources:[product?.source_id].filter(Boolean),products:[product?.external_product_id,...(includeOffers?(product?.offers||[]).map((o:any)=>o.external_product_id):[])].filter(Boolean),
    };
}
export async function hasJourneyPurchase(userId: string, product: any, contact: {email?: string;phone?: string}, tx=query,includeOffers=false): Promise<boolean> {
    const scope=purchaseScope(product,includeOffers);
    if(!scope.products.length||!scope.sources.length||(!contact.email&&!contact.phone))return false;
    const rows=await tx(`SELECT o.id FROM tracking_orders o JOIN tracking_sources source ON source.id=o.source_id
        CROSS JOIN (SELECT $5::text AS customer_phone) contact
        WHERE source.user_id=$1 AND o.source_id=ANY($2::uuid[]) AND o.product_id=ANY($3::text[]) AND o.status='approved'
        AND ($6::text IS NULL OR o.raw->'item'->>'offer_code'=$6 OR o.raw->>'offer_code'=$6)
        AND ((NULLIF($4,'') IS NOT NULL AND LOWER(o.customer_email)=LOWER($4)) OR
        (NULLIF($5,'') IS NOT NULL AND ${sameBrazilPhoneSql('o','contact')})) LIMIT 1`,
        [userId,scope.sources,scope.products,contact.email||'',contact.phone||'',product?.settings?.purchase_offer_code||null]);
    return rows.length>0;
}
