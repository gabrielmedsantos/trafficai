const {test}=require('node:test');
const assert=require('node:assert/strict');
const db=require('../dist/database/connection');
const axios=require('axios');
const {mirrorCapiEvent,CAPI_MIRROR_RULES}=require('../dist/tracking/capi-mirrors');
const rule=CAPI_MIRROR_RULES[0];
const source={id:rule.sourceId,user_id:'owner',pixel_id:'original',access_token:'test-token',is_active:true,test_event_code:null};
const target={...source,id:rule.targetId,pixel_id:'moblyar'};
const event={event_name:'PageView',event_id:'same-browser-id',event_time:1792510000,event_source_url:rule.origin+'/?utm_source=test',session_id:'test-session',custom_data:{value:9.9}};
async function run(e=event,s=source,visits=[],destination=target){
 const original=db.query;const delivered=[];let queries=0;
 db.query=async(sql,params)=>{queries++;if(sql.includes('FROM tracking_events'))return visits;if(sql.includes('FROM tracking_orders'))return[];assert(sql.includes('user_id=$2'));assert.equal(params[1],s.user_id);return destination?[destination]:[]};
 try{await mirrorCapiEvent(s,e,async(t,e)=>delivered.push({target:t,event:e}));return{delivered,queries}}finally{db.query=original}
}
test('Historinha envia ao MOBLYAR com mesmo event_id, data, sessão e valor',async()=>{
 const {delivered}=await run();assert.equal(delivered.length,1);assert.equal(delivered[0].target.id,rule.targetId);assert.equal(delivered[0].target.google_ads_account_id,null);
 for(const key of ['event_id','event_time','session_id'])assert.equal(delivered[0].event[key],event[key]);assert.equal(delivered[0].event.custom_data.value,9.9);
});
test('outras fontes e páginas não são encaminhadas',async()=>{
 for(const url of ['https://other.example/','https://historinha.alfamaxdigital.com.br.evil.example/','https://historinha.alfamaxdigital.com.br/es/','invalid'])assert.equal((await run({...event,event_source_url:url})).delivered.length,0);
 assert.equal((await run(event,{...source,id:'different-source'})).queries,0);
});
test('URL principal index.html é aceita',async()=>assert.equal((await run({...event,event_source_url:rule.origin+'/index.html'})).delivered.length,1));
test('Purchase do gateway exige vínculo com sessão anterior do quiz',async()=>{
 const purchase={...event,event_name:'Purchase',event_source_url:'https://gateway.example/',value:9.9,currency:'BRL'};
 assert.equal((await run(purchase)).delivered.length,0);
 assert.equal((await run(purchase,source,[{event_source_url:rule.origin+'/'}])).delivered.length,1);
 assert.equal((await run({...purchase,session_id:undefined},source,[{event_source_url:rule.origin+'/'}])).delivered.length,0);
});
test('fontes desativadas ou destino ausente não encaminham',async()=>{
 assert.equal((await run(event,{...source,is_active:false})).queries,0);
 assert.equal((await run(event,source,[],null)).delivered.length,0);
});
test('mesmo pixel no destino não duplica entrega',async()=>assert.equal((await run(event,source,[],{...target,pixel_id:source.pixel_id})).delivered.length,0));
test('pipeline completo persiste uma entrega por fonte e deduplica repetição',async()=>{
 const originalQuery=db.query,originalPost=axios.post;const records=new Map(),sent=[];
 db.query=async(sql,params)=>{
 if(sql.includes('FROM tracking_events')&&sql.includes('event_id = $2')){const v=records.get(params[0]+params[1]);return v?[v]:[]}
 if(sql.includes('FROM tracking_sources'))return[target];
 if(sql.includes('INSERT INTO tracking_events')){records.set(params[0]+params[2],{event_id:params[2],emq_score:0,meta_status:'sent'});return[]}
 return[];
 };
 axios.post=async(url,body)=>{sent.push({url,payload:body.data[0]});return{data:{events_received:1}}};
 try{
 const {trackEvent}=require('../dist/tracking/tracking.service');await trackEvent(source,event);await trackEvent(source,event);
 assert.equal(sent.length,2);assert.equal(records.size,2);assert(sent.every(r=>r.payload.event_id===event.event_id));assert(sent.some(r=>r.url.includes('/original/events')));assert(sent.some(r=>r.url.includes('/moblyar/events')));
 }finally{db.query=originalQuery;axios.post=originalPost}
});
