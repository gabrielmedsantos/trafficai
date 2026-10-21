const {test}=require('node:test');
const assert=require('node:assert/strict');
const {metaService}=require('../dist/meta/meta.service');
const action=(action_type,value)=>({action_type,value:String(value)});
for(const objective of ['OUTCOME_SALES','OUTCOME_LEADS','OUTCOME_TRAFFIC','OUTCOME_ENGAGEMENT']){
 test(`${objective}: conversas prevalecem sobre leads, compras e cliques`,()=>{
 const result=metaService.extractPrimaryAction([action('lead',220),action('purchase',1),action('link_click',125),action('onsite_conversion.messaging_conversation_started_7d',34)],objective,'CONVERSATIONS');
 assert.equal(result.count,34);assert.equal(result.label,'Conversas');
 });
}
test('conversas ausentes não viram leads ou conexões',()=>{
 for(const actions of [[],undefined,[action('lead',220),action('onsite_conversion.total_messaging_connection',54)]]){
 const result=metaService.extractPrimaryAction(actions,'OUTCOME_SALES','CONVERSATIONS');assert.equal(result.count,0);assert.equal(result.label,'Conversas');
 }
});
test('cliques não são rotulados como visitas ao perfil',()=>{
 assert.deepEqual(metaService.extractPrimaryAction([action('link_click',78)],'OUTCOME_TRAFFIC','PROFILE_VISIT'),{count:78,label:'Cliques no link',action_type:'link_click'});
});
test('vendas e leads reais preservam a seleção original',()=>{
 assert.equal(metaService.extractPrimaryAction([action('purchase',3),action('lead',220)],'OUTCOME_SALES','OFFSITE_CONVERSIONS').count,3);
 assert.equal(metaService.extractPrimaryAction([action('lead',6)],'OUTCOME_LEADS','LEAD_GENERATION').count,6);
});
test('relatório inclui gasto de dias sem conversas no custo agregado',async()=>{
 const db=require('../dist/database/connection');const original=db.query;
 db.query=async()=>[{spend:'100',impressions:1000,objective:'OUTCOME_SALES',optimization_goal:'CONVERSATIONS',actions:[action('onsite_conversion.messaging_conversation_started_7d',10)]},{spend:'50',impressions:500,objective:'OUTCOME_SALES',optimization_goal:'CONVERSATIONS',actions:[action('lead',20)]}];
 try {const {dailyWhatsAppService}=require('../dist/reports/daily-whatsapp.service');const m=await dailyWhatsAppService.getRangeMetrics('test','2026-10-01','2026-10-19');assert.equal(m.spend,150);assert.equal(m.leads,10);assert.equal(m.cost_per_lead,15);}finally{db.query=original;}
});
test('detalhado recalcula resultados das ações sem reutilizar conversões classificadas incorretamente',()=>{
 const {sumPrimaryResults}=require('../dist/reports/pdf-report.service');
 assert.equal(sumPrimaryResults([
 {objective:'OUTCOME_SALES',goal:'CONVERSATIONS',actions:[action('lead',220),action('onsite_conversion.messaging_conversation_started_7d',34)]},
 {objective:'OUTCOME_SALES',goal:'CONVERSATIONS',actions:[action('purchase',1),action('onsite_conversion.messaging_conversation_started_7d',8)]}
 ]),42);
});
