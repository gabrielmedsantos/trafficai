// Default: preview only. Financial attribution only; no quiz/child association,
// order recreation, webhook replay, notification or CAPI request.
const {query,transaction}=require('../dist/database/connection');
const {decrypt}=require('../dist/shared/encryption');
const {normPhone,normEmail}=require('../dist/tracking/tracking.service');
const {metaIdsFromUtms}=require('../dist/tracking/utm');
const ORDER='409d1087-fe53-4362-a109-9949894f4a6a',SESSION='d6bcb4ee-b1cf-42c2-b208-b3562f680401';
const CANONICAL='bcad48f8-de1f-4501-8dea-4810dc3b248d',MOBLYAR='fb8d4d3b-2603-4c55-8655-51ca086f3091',CAMPAIGN='120250092439360513';
async function inspect(tx,lock=false){
 const [order]=await tx('SELECT * FROM tracking_orders WHERE id=$1'+(lock?' FOR UPDATE':''),[ORDER]);
 if(!order||order.source_id!==CANONICAL||order.product_id!=='121023'||order.status!=='approved'||Number(order.gross_value)!==9.9)throw Error('ORDER_CHANGED');
 if(order.meta_campaign_id){if(order.meta_campaign_id===CAMPAIGN)return{already:true,order};throw Error('EXISTING_ATTRIBUTION_CONFLICT');}
 const [source]=await tx('SELECT user_id FROM tracking_sources WHERE id=$1',[CANONICAL]);
 const [target]=await tx('SELECT account_id FROM tracking_sources WHERE id=$1 AND user_id=$2',[MOBLYAR,source.user_id]);if(!target?.account_id)throw Error('SOURCE_OWNER_MISMATCH');
 const sessions=await tx(`SELECT q.id,q.answers_encrypted,q.attribution FROM tracking_quiz_sessions q JOIN tracking_quiz_funnels f ON f.id=q.funnel_id
 WHERE f.source_id=$1 AND f.slug='mamae-quero-historinha' AND q.order_id IS NULL AND q.created_at<=$2
 AND q.created_at>=$2::timestamptz-INTERVAL '30 days'`,[CANONICAL,order.created_at]);
 const phone=normPhone(order.customer_phone||'');if(phone.length<10)throw Error('PHONE_MISSING');
 const matches=sessions.filter(q=>{try{const a=JSON.parse(decrypt(q.answers_encrypted));return a.phone&&normPhone(a.phone)===phone&&!(a.email&&order.customer_email&&normEmail(a.email)!==normEmail(order.customer_email));}catch{return false;}});
 if(matches.length!==1||matches[0].id!==SESSION)throw Error('CONTACT_MATCH_AMBIGUOUS_OR_CHANGED');
 const utm=matches[0].attribution||{},ids=metaIdsFromUtms(utm);if(ids.meta_campaign_id!==CAMPAIGN)throw Error('CAMPAIGN_CHANGED');
 const missing=v=>v==null||!String(v).trim()||/^(?:n[aã]o informado|null|undefined|n\/a|\(not set\))$/i.test(String(v).trim());
 for(const k of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'])if(!missing(order[k])&&order[k]!==utm[k])throw Error('EXISTING_UTM_CONFLICT');
 for(const k of ['meta_adset_id','meta_ad_id'])if(order[k]&&order[k]!==ids[k])throw Error('EXISTING_META_ID_CONFLICT');
 const campaigns=await tx('SELECT c.account_id FROM campaigns c JOIN ad_accounts a ON a.id=c.account_id WHERE a.user_id=$1 AND c.meta_campaign_id=$2',[source.user_id,CAMPAIGN]);
 if(new Set(campaigns.map(c=>c.account_id)).size!==1||campaigns[0]?.account_id!==target.account_id)throw Error('CAMPAIGN_OWNER_AMBIGUOUS');
 return{order,user:source.user_id,utm,ids};
}
async function repairHistorinhaAttribution(apply=false){
 if(!apply){const p=await inspect(query);return{mode:'preview',alreadyAttributed:!!p.already,orderId:ORDER,evidenceSession:SESSION,targetSource:MOBLYAR,targetCampaign:CAMPAIGN,changes:['utm_source','utm_medium','utm_campaign','utm_content','utm_term','meta_campaign_id','meta_adset_id','meta_ad_id'],quizAssociation:false,capiReplay:false};}
 return transaction(async tx=>{
  const p=await inspect(tx,true);if(p.already)return{mode:'unchanged',orderId:ORDER};
  const keys=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','meta_campaign_id','meta_adset_id','meta_ad_id'];
  const after={...p.utm,...p.ids};
  const result=await tx(`UPDATE tracking_orders SET ${keys.map((k,n)=>`${k}=CASE WHEN ${k} IS NULL OR LOWER(BTRIM(${k})) IN ('','não informado','nao informado','null','undefined','n/a','(not set)') THEN $${n+2} ELSE ${k} END`).join(',')},updated_at=NOW() WHERE id=$1 AND meta_campaign_id IS NULL RETURNING id`,[ORDER,...keys.map(k=>after[k]||null)]);
  if(result.length!==1)throw Error('ORDER_UPDATE_CONFLICT');
  const [user]=await tx('SELECT name FROM users WHERE id=$1',[p.user]);
  await tx('INSERT INTO audit_log(user_id,user_name,action,entity_type,entity_id,entity_label,details) VALUES($1,$2,$3,$4,$5,$6,$7)',[p.user,user?.name||'TrafficAI','manual_attribution_repair','tracking_order',ORDER,'Historinha — atribuição financeira revisada',JSON.stringify({reason:'authorized_unique_phone_match_to_prior_quiz',session_id:SESSION,before:Object.fromEntries(keys.map(k=>[k,p.order[k]||null])),after:Object.fromEntries(keys.map(k=>[k,after[k]||null])),quiz_link_unchanged:true,purchase_event_unchanged:true})]);
  return{mode:'applied',orderId:ORDER,affectedOrders:1,quizAssociation:false,capiReplay:false};
 });
}
module.exports={repairHistorinhaAttribution,ORDER,SESSION};
if(require.main===module)repairHistorinhaAttribution(process.env.TRAFFICAI_APPLY_ATTRIBUTION_REPAIR===ORDER).then(r=>{console.log(JSON.stringify(r));process.exit(0)}).catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1)});
