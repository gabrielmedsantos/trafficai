// Somente preparação autorizada. Nunca ativa envios, publica fluxos ou importa contatos.
const {query,transaction}=require('../dist/database/connection');
const {saveFlow}=require('../dist/automation/workflows/repository');
const {saveTemplate}=require('../dist/automation/workflows/templates');
const {graphIssues}=require('../dist/automation/workflows/validation');
const {configs,plans,graph,SOURCE,WPP,MAIL}=require('./moblyar-recovery-plans.cjs');
async function prepareMoblyarRecovery(){
 const [source]=await query('SELECT user_id FROM tracking_sources WHERE id=$1',[SOURCE]);if(!source)throw Error('SOURCE_MISSING');const user=source.user_id;
 for(const config of configs){const [owned]=await query('SELECT id FROM tracking_sources WHERE id=$1 AND user_id=$2',[config.source,user]);if(!owned)throw Error('SOURCE_OWNER_MISMATCH');}
 const [wpp]=await query('SELECT id,type,status FROM comm_integrations WHERE id=$1 AND user_id=$2',[WPP,user]);if(wpp?.type!=='whatsapp_uazapi'||wpp.status!=='connected')throw Error('WHATSAPP_NOT_READY');
 const [mail]=await query('SELECT id,provider,status FROM aw_integrations WHERE id=$1 AND user_id=$2',[MAIL,user]);if(mail?.provider!=='resend'||mail.status!=='verified')throw Error('EMAIL_NOT_READY');
 const oldNames=['Historinha · Pagamento pendente · WhatsApp','Historinha · Pagamento pendente · E-mail','Historinha · Pagamento recusado · WhatsApp','Historinha · Pagamento recusado · E-mail'];
 const conflicting=await query("SELECT id FROM aw_flows WHERE user_id=$1 AND name=ANY($2::text[]) AND (published_version IS NOT NULL OR status NOT IN ('draft','archived'))",[user,oldNames]);if(conflicting.length)throw Error('STATUS_RECOVERY_ALREADY_PUBLISHED');
 const prepared=plans();
 for(const plan of prepared){const [flow]=await query('SELECT status,published_version FROM aw_flows WHERE user_id=$1 AND name=$2',[user,plan.name]);if(flow&&(flow.status!=='draft'||flow.published_version))throw Error('EXISTING_FLOW_REQUIRES_REVIEW');}
 const products={};
 for(const config of configs){
  const pipeline=await transaction(async tx=>{
   let [p]=await tx("SELECT id FROM comm_pipelines WHERE user_id=$1 AND external_source='trafficai_lifecycle' AND external_id=$2",[user,config.key]);
   if(!p)[p]=await tx("INSERT INTO comm_pipelines(user_id,external_source,external_id,name,is_main) VALUES($1,'trafficai_lifecycle',$2,$3,false) RETURNING id",[user,config.key,config.label+' — atendimento e recuperação']);
   let [s]=await tx("SELECT id FROM comm_pipeline_stages WHERE pipeline_id=$1 AND external_id='new'",[p.id]);
   if(!s)[s]=await tx("INSERT INTO comm_pipeline_stages(pipeline_id,external_id,name,position) VALUES($1,'new','Contato recebido',0) RETURNING id",[p.id]);return{pipeline:p.id,stage:s.id};
  });
  let [product]=await query("SELECT * FROM aw_products WHERE user_id=$1 AND settings->>'lifecycle_key'=$2",[user,config.key]);
  const now=new Date().toISOString();
  const settings={...(product?.settings||{}),lifecycle_key:config.key,lifecycle_enabled:true,lifecycle_started_at:product?.settings?.lifecycle_started_at||now,
   lifecycle_pipeline_id:pipeline.pipeline,lifecycle_stage_id:pipeline.stage,recovery_enabled:true,recovery_started_at:product?.settings?.recovery_started_at||now,
   recovery_offer_urls:config.offers,recovery_preserve_offer:true,...(config.key==='historinha'?{quiz_slug:'mamae-quero-historinha'}:{})};
  if(product){if(product.source_id!==config.source||product.external_product_id!==config.external)throw Error('PRODUCT_MAPPING_MISMATCH');
   [product]=await query('UPDATE aw_products SET settings=$3,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *',[product.id,user,JSON.stringify(settings)]);
  }else [product]=await query(`INSERT INTO aw_products(user_id,name,description,source_id,price,currency,sales_url,checkout_url,platform,external_product_id,settings)
   VALUES($1,$2,$3,$4,$5,'BRL',$6,$7,'ticto',$8,$9) RETURNING *`,[user,config.label,config.key==='clube-pedagogia'?'Acervo digital de materiais educativos e licença de revenda conforme os planos da oferta.':'Livro digital personalizado.',config.source,config.price,config.sales,config.checkout,config.external,JSON.stringify(settings)]);
  products[config.key]=product;
 }
 const result=[];
 for(const plan of prepared){
  const ids=[];
  for(const m of plan.messages){
   const [existing]=await query('SELECT id FROM aw_templates WHERE user_id=$1 AND name=$2',[user,m.name]);
   const template=await saveTemplate(user,{...m,channel:plan.channel,purpose:'marketing',parameters:['name','product','checkout_url','unsubscribe_url']},existing?.id);ids.push(template.id);
  }
  const g=graph(plan,ids),issues=graphIssues(g,true);if(issues.length)throw Error('GRAPH_INVALID');
  const [existing]=await query('SELECT id,revision FROM aw_flows WHERE user_id=$1 AND name=$2',[user,plan.name]);
  const flow=await saveFlow(user,{name:plan.name,revision:existing?.revision,source_id:plan.product.source,product_id:products[plan.product.key].id,recovery:true,graph:g,
    settings:{sales_mode:'recovery',stop_on_purchase:true,default_whatsapp_connection_id:WPP,max_messages:plan.messages.length,days:[0,1,2,3,4,5,6],time_zone:'America/Fortaleza',allowed_start:9,allowed_end:19}},existing?.id);
  result.push({id:flow.id,name:flow.name,status:flow.status,messages:plan.messages.length});
 }
 // Substitui apenas os quatro rascunhos antigos de status, preservando versões,
 // templates, histórico, upsell, tags e qualquer fluxo que o usuário tenha ativado.
 await query("UPDATE aw_flows SET status='archived',updated_at=NOW() WHERE user_id=$1 AND name=ANY($2::text[]) AND status='draft' AND published_version IS NULL",[user,oldNames]);
 return{products:Object.values(products).map(p=>({id:p.id,name:p.name})),flows:result,templates:prepared.reduce((n,p)=>n+p.messages.length,0),sendsEnabled:false,activation:'draft_only',historicalImport:false};
}
module.exports={prepareMoblyarRecovery};
if(require.main===module)prepareMoblyarRecovery().then(r=>{console.log(JSON.stringify(r));process.exit(0)}).catch(e=>{console.error('Preparação interrompida: '+e.message);process.exit(1)});
