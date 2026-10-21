// Executar somente na instalação autorizada. Não publica fluxos, não importa contatos e não envia mensagens.
const {query,transaction}=require('../dist/database/connection');
const {randomUUID}=require('crypto');
const {HISTORINHA_JOURNEY:j}=require('../dist/tracking/quiz-sharing');
const {graphIssues}=require('../dist/automation/workflows/validation');
const {saveTemplate}=require('../dist/automation/workflows/templates');
const {saveFlow}=require('../dist/automation/workflows/repository');
const MAIL='9f42c852-f0df-4e1e-b023-29095941aebd',WPP='eace897e-6392-4fd7-a7fb-413f8e7a6f3d';
async function prepareHistorinhaLifecycle(){
 const [owner]=await query('SELECT user_id FROM tracking_sources WHERE id=$1',[j.sourceId]);if(!owner)throw Error('SOURCE_MISSING');const user=owner.user_id;
 const [other]=await query('SELECT user_id FROM tracking_sources WHERE id=$1',[j.sharedSourceId]);if(other?.user_id!==user)throw Error('OWNER_MISMATCH');
 const [funnel]=await query('SELECT id FROM tracking_quiz_funnels WHERE source_id=$1 AND slug=$2',[j.sourceId,j.slug]);if(!funnel)throw Error('FUNNEL_MISSING');
 const pipeline=await transaction(async tx=>{
   let [p]=await tx("SELECT id FROM comm_pipelines WHERE user_id=$1 AND external_source='trafficai_lifecycle' AND external_id='historinha'",[user]);
   if(!p)[p]=await tx("INSERT INTO comm_pipelines(user_id,external_source,external_id,name,is_main) VALUES($1,'trafficai_lifecycle','historinha','Historinha — atendimento e recuperação',false) RETURNING id",[user]);
   let [stage]=await tx("SELECT id FROM comm_pipeline_stages WHERE pipeline_id=$1 AND external_id='new'",[p.id]);
   if(!stage)[stage]=await tx("INSERT INTO comm_pipeline_stages(pipeline_id,external_id,name,position) VALUES($1,'new','Contato recebido',0) RETURNING id",[p.id]);
   return{pipeline:p.id,stage:stage.id};
 });
 let [product]=await query("SELECT * FROM aw_products WHERE user_id=$1 AND settings->>'lifecycle_key'='historinha'",[user]);
 if(!product)[product]=await query(`INSERT INTO aw_products(user_id,name,description,source_id,price,currency,sales_url,checkout_url,platform,external_product_id,settings)
 VALUES($1,'Mamãe, quero historinha','Livro digital personalizado. Jornada única nas fontes CA5 e MOBLYAR.',$2,9.90,'BRL','https://historinha.alfamaxdigital.com.br/',NULL,'ticto','121023',$3) RETURNING *`,[user,j.sourceId,JSON.stringify({lifecycle_key:'historinha',lifecycle_enabled:true,lifecycle_started_at:new Date().toISOString(),lifecycle_pipeline_id:pipeline.pipeline,lifecycle_stage_id:pipeline.stage,quiz_slug:j.slug})]);
 // Use the actual basic checkout from the deployed config. Never infer from the premium URL.
 const basic=process.env.HISTORINHA_BASIC_CHECKOUT;
 if(!/^https:\/\/payment\.ticto\.app\/[A-Za-z0-9]+$/.test(basic||''))throw Error('BASIC_CHECKOUT_MISSING');
 if(product.settings.lifecycle_key==='historinha')await query('UPDATE aw_products SET checkout_url=$2 WHERE id=$1',[product.id,basic]);
 // Add an optional answer key without rewriting existing sessions, answers or milestones.
 await query(`UPDATE tracking_quiz_funnels SET answer_keys=answer_keys||'["recoveryConsent"]'::jsonb WHERE id=$1 AND NOT answer_keys ? 'recoveryConsent'`,[funnel.id]);
 let [premium]=await query("SELECT * FROM aw_products WHERE user_id=$1 AND settings->>'lifecycle_key'='historinha-combo4'",[user]);
 if(!premium)[premium]=await query(`INSERT INTO aw_products(user_id,name,description,source_id,price,currency,sales_url,checkout_url,platform,external_product_id,settings)
 VALUES($1,'Combo 4 historinhas','Oferta O97B9CEC1 / 179702; interromper upsell apenas após compra aprovada desta oferta.',$2,19.90,'BRL','https://historinha.alfamaxdigital.com.br/','https://payment.ticto.app/O97B9CEC1','ticto','121023',$3) RETURNING *`,[user,j.sourceId,JSON.stringify({lifecycle_key:'historinha-combo4',lifecycle_enabled:true,lifecycle_started_at:new Date().toISOString(),lifecycle_pipeline_id:pipeline.pipeline,lifecycle_stage_id:pipeline.stage,purchase_offer_code:'O97B9CEC1'})]);
 const result=[];
 for(const event of ['quiz.abandoned','checkout.started','payment.failed','upsell'])for(const channel of ['whatsapp','email']){
  const upsell=event==='upsell';const label=upsell?'Upsell combo 4 histórias':event==='quiz.abandoned'?'Quiz interrompido':event==='checkout.started'?'Pagamento pendente':'Pagamento recusado';
  const name=`Historinha · ${label} · ${channel==='email'?'E-mail':'WhatsApp'}`;
  const [existing]=await query('SELECT id,status FROM aw_flows WHERE user_id=$1 AND name=$2',[user,name]);if(existing){result.push({name,...existing});continue;}
  const texts=upsell?[
    'Olá, {{name}}! Obrigado pela compra da sua historinha. Quer conhecer outras aventuras? Temos o combo de 4 historinhas por R$ 19,90: {{checkout_url}}. É uma compra adicional e opcional.',
    'Oi, {{name}}! No combo, a criança pode viver aventuras na floresta, no reino encantado, na fazendinha e no fundo do mar. Conheça as 4 historinhas por R$ 19,90: {{checkout_url}}.',
    'Olá, {{name}}! Este é nosso último convite para conhecer o combo de 4 historinhas por R$ 19,90: {{checkout_url}}. Sua compra anterior continua normalmente, mesmo sem o combo.']:event==='quiz.abandoned'?[
    'Olá, {{name}}! Você pediu ajuda para criar o livro personalizado. Ficou alguma dúvida? Você pode continuar a personalização aqui: {{checkout_url}}',
    'Oi, {{name}}! O livro é personalizado com o nome e as características da criança. Se quiser continuar, acesse {{checkout_url}}. Se precisar de ajuda, responda esta mensagem.',
    'Olá, {{name}}! Este é nosso último lembrete para continuar sua historinha: {{checkout_url}}. Se agora não for o momento, tudo bem.']:
    event==='payment.failed'?[
    'Olá, {{name}}! O pagamento do seu pedido de {{product}} não foi aprovado. Se quiser tentar novamente, confira as opções disponíveis: {{checkout_url}}. Podemos ajudar por aqui.',
    'Oi, {{name}}! Quer ajuda para concluir o pagamento de {{product}}? Confira seu pedido e as formas disponíveis aqui: {{checkout_url}}.',
    'Olá, {{name}}! Se ainda quiser concluir seu pedido, acesse {{checkout_url}}. Se já pagou, desconsidere este lembrete e fale conosco para conferirmos.']:[
    'Olá, {{name}}! Seu pedido de {{product}} está aguardando pagamento. Ficou alguma dúvida para concluir? Confira o checkout: {{checkout_url}}.',
    'Oi, {{name}}! Passando para saber se você precisa de ajuda com seu pedido de {{product}}. Acesse {{checkout_url}} para consultar as opções de pagamento.',
    'Olá, {{name}}! Este é nosso último lembrete do pedido de {{product}}: {{checkout_url}}. Se agora não for o momento, não precisa fazer nada.'];
  const id='n';const nodes=[{id:'start',type:'trigger',position:{x:0,y:0},data:{label,config:{event:upsell?'payment.approved':event}}},{id:'channel',type:'condition',position:{x:220,y:0},data:{label:'Contato disponível',config:{kind:'channel_available',value:channel}}}];
  const edges=[{id:'e0',source:'start',target:'channel'},{id:'no',source:'channel',target:'end-no',sourceHandle:'no'}];
  for(let n=0;n<3;n++){
    const [existingTemplate]=await query('SELECT id FROM aw_templates WHERE user_id=$1 AND name=$2',[user,`${name} · ${n+1}`]);
    const template=existingTemplate||await saveTemplate(user,{name:`${name} · ${n+1}`,channel,subject:upsell?'Mais aventuras para a sua criança':label==='Quiz interrompido'?'Quer ajuda com sua historinha?':'Sobre seu pedido de historinha',body:texts[n]+'\n\nPara não receber mais: {{unsubscribe_url}}',purpose:'marketing',parameters:['name','product','checkout_url','unsubscribe_url']});
    nodes.push({id:'wait'+n,type:'wait',position:{x:440+n*440,y:0},data:{label:n||upsell?'Aguardar 24 horas':'Aguardar 1 hora',config:{seconds:n||upsell?86400:3600}}},{id:'msg'+n,type:'message',position:{x:660+n*440,y:0},data:{label:`Contato ${n+1}`,config:{channel,templateId:template.id,integrationId:channel==='email'?MAIL:WPP}}});
    edges.push({id:'wait-msg'+n,source:'wait'+n,target:'msg'+n},{id:'next'+n,source:'msg'+n,target:n===2?'end':'wait'+(n+1)});
  }
  nodes.push({id:'end-no',type:'end',position:{x:440,y:250},data:{label:'Sem contato neste canal',config:{}}});
  nodes.push({id:'end',type:'end',position:{x:1800,y:0},data:{label:'Encerrar',config:{}}});edges.push({id:'yes',source:'channel',target:'wait0',sourceHandle:'yes'});
  const graph={schemaVersion:1,nodes,edges};const issues=graphIssues(graph,true);if(issues.length)throw Error('GRAPH_INVALID '+JSON.stringify(issues));
  const flow=await saveFlow(user,{name,source_id:j.sourceId,product_id:product.id,recovery:!upsell,graph,settings:{sales_mode:upsell?'upsell':'recovery',stop_on_purchase:!upsell,promotion_product_id:upsell?premium.id:null,default_whatsapp_connection_id:WPP,max_messages:3,days:[0,1,2,3,4,5,6],allowed_start:9,allowed_end:19,time_zone:'America/Fortaleza'}});
  result.push({id:flow.id,name,status:flow.status});
 }
 for(const tagProduct of [product,premium]){
 const paidName=(tagProduct.id===product.id?'Historinha':'Combo 4 historinhas')+' · Compra aprovada · Sincronizar tags';
 if(!(await query('SELECT id FROM aw_flows WHERE user_id=$1 AND name=$2',[user,paidName])).length){
   const flow=await saveFlow(user,{name:paidName,source_id:j.sourceId,product_id:tagProduct.id,recovery:false,
     graph:{schemaVersion:1,nodes:[{id:'start',type:'trigger',position:{x:0,y:0},data:{label:'Compra aprovada',config:{event:'payment.approved'}}},{id:'tag',type:'tag',position:{x:220,y:0},data:{label:'Marcar compra',config:{operation:'add',tag:'{{product_tag}}'}}},{id:'end',type:'end',position:{x:440,y:0},data:{label:'Encerrar',config:{}}}],edges:[{id:'e1',source:'start',target:'tag'},{id:'e2',source:'tag',target:'end'}]},
     settings:{sales_mode:'purchase_tags',default_whatsapp_connection_id:WPP}});
   result.push({id:flow.id,name:paidName,status:flow.status});
 }
 }
 return {product:product.id,premium:premium.id,pipeline,flows:result,sendsEnabled:false,activation:'draft_only'};
}
module.exports={prepareHistorinhaLifecycle};
if(require.main===module)prepareHistorinhaLifecycle().then(result=>{console.log(JSON.stringify(result));process.exit(0)}).catch(()=>{console.error('Falha na preparação; revisar antes de repetir.');process.exit(1)});
