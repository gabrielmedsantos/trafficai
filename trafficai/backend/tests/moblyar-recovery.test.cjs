process.env.ENCRYPTION_KEY=require('node:crypto').randomBytes(32).toString('hex');
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {plans,graph,configs,WPP,MAIL,SOURCE}=require('../scripts/moblyar-recovery-plans.cjs');
const {recoveryCheckout}=require('../dist/automation/workflows/recovery');
const {graphIssues}=require('../dist/automation/workflows/validation');
test('seis fluxos separados: templates W0-W5 e E0-E6, links e saída obrigatórios',()=>{
 const list=plans();assert.equal(list.length,6);assert.equal(list.reduce((n,p)=>n+p.messages.length,0),39);
 for(const p of list){assert.equal(p.messages.length,p.channel==='email'?7:6);const g=graph(p,p.messages.map(()=>randomUUID()));assert.equal(graphIssues(g,true).length,0);assert(g.nodes.filter(n=>n.type==='message').every(n=>n.data.config.buttonText));
  for(const m of p.messages){assert(m.body.includes('{{checkout_url}}'));assert(m.body.includes('{{unsubscribe_url}}'));assert(!/desconto|meia-noite|só hoje|vagas/i.test(m.body));}
 }
 assert.equal(list.filter(p=>p.product.key==='clube-pedagogia'&&p.journey==='quiz').length,0);
});
test('checkout preserva oferta configurada e nunca usa URL arbitrária do webhook',()=>{
 const product={platform:'ticto',sales_url:'https://pedagogia.alfamaxdigital.com.br/',checkout_url:'https://payment.ticto.app/OAF7221C7',settings:{recovery_preserve_offer:true,recovery_offer_urls:configs[1].offers}};
 assert.equal(recoveryCheckout(product,{raw:{item:{offer_code:'O8B0DAEB8'}}}),'https://payment.ticto.app/O8B0DAEB8');
 assert.equal(recoveryCheckout(product,{raw:{offer_code:'O08E7DA50'}}),'https://payment.ticto.app/O08E7DA50');
 assert.equal(recoveryCheckout(product,{raw:{offer_code:'unknown',checkout_url:'https://attacker.invalid/'}}),product.sales_url);
 assert.equal(recoveryCheckout(product,null,true),product.sales_url);
 product.settings.recovery_offer_urls.attack='https://attacker.invalid/';assert.equal(recoveryCheckout(product,{raw:{offer_code:'attack'}}),product.sales_url);
});
test('instalação idempotente em rascunho, recuperação única entre status/pedidos e compra isolada por produto',async()=>{
 const {fixture}=require('./support/automation-db.cjs');const {db,q,close}=await fixture();try{
 await db.exec(`CREATE TABLE comm_pipelines(id UUID DEFAULT gen_random_uuid() PRIMARY KEY,user_id UUID,external_source TEXT,external_id TEXT,name TEXT,is_main BOOLEAN);
 CREATE TABLE comm_pipeline_stages(id UUID DEFAULT gen_random_uuid() PRIMARY KEY,pipeline_id UUID,external_id TEXT,name TEXT,position INT);
 ALTER TABLE comm_deals ADD COLUMN pipeline_id UUID;ALTER TABLE comm_deals ADD COLUMN stage_id UUID;ALTER TABLE comm_deals ADD COLUMN external_source TEXT;ALTER TABLE comm_deals ADD COLUMN external_id TEXT;ALTER TABLE comm_deals ALTER COLUMN id SET DEFAULT gen_random_uuid();
 CREATE UNIQUE INDEX deal_external ON comm_deals(user_id,external_source,external_id) WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
 ALTER TABLE tracking_orders ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();ALTER TABLE tracking_orders ADD COLUMN customer_name TEXT;`);
 const owner=randomUUID();await q('INSERT INTO users(id) VALUES($1)',[owner]);
 await q('INSERT INTO tracking_sources(id,user_id) VALUES($1,$2),($3,$2)',[SOURCE,owner,configs[0].source]);
 await q("INSERT INTO comm_integrations(id,user_id,name,type,status,config) VALUES($1,$2,'Conexão de teste','whatsapp_uazapi','connected','{}')",[WPP,owner]);
 await q("INSERT INTO aw_integrations(id,user_id,name,provider,status,credentials_encrypted) VALUES($1,$2,'Email de teste','resend','verified','fixture-only')",[MAIL,owner]);
 const {prepareMoblyarRecovery}=require('../scripts/prepare-moblyar-recovery.cjs');const result=await prepareMoblyarRecovery();assert.equal(result.flows.length,6);assert(result.flows.every(f=>f.status==='draft'));assert.equal(result.templates,39);
 await prepareMoblyarRecovery();assert.equal((await q('SELECT count(*)::int AS n FROM aw_templates'))[0].n,39);assert.equal((await q('SELECT count(*)::int AS n FROM aw_runs'))[0].n,0);assert.equal((await q('SELECT count(*)::int AS n FROM aw_consents'))[0].n,0);
 const first=randomUUID(),second=randomUUID();
 for(const [id,phone] of [[first,'11999999999'],[second,'55 (11) 99999-9999']])await q("INSERT INTO tracking_orders(id,source_id,status,product_id,customer_email,customer_phone,raw) VALUES($1,$2,'pending','121790','same@example.invalid',$3,$4)",[id,SOURCE,phone,JSON.stringify({item:{offer_code:'O8B0DAEB8'}})]);
 const {syncLifecycleEvents}=require('../dist/automation/workflows/lifecycle');await syncLifecycleEvents();await syncLifecycleEvents();assert.equal((await q("SELECT count(*)::int AS n FROM aw_events WHERE event_type='checkout.recovery'"))[0].n,2);
 const [ped]=await q("SELECT * FROM aw_products WHERE external_product_id='121790'");
 const flows=await q('SELECT * FROM aw_flows WHERE product_id=$1',[ped.id]);for(const f of flows){await q("UPDATE aw_flows SET status='active',published_version=1 WHERE id=$1",[f.id]);await q('INSERT INTO aw_versions(flow_id,version,user_id,graph,source_id,product_id,recovery,settings) VALUES($1,1,$2,$3,$4,$5,true,$6)',[f.id,owner,JSON.stringify(f.graph),SOURCE,ped.id,JSON.stringify(f.settings)]);}
 const {dispatchEvents}=require('../dist/automation/workflows/events');await dispatchEvents();assert.equal((await q('SELECT count(*)::int AS n FROM aw_runs'))[0].n,2,'apenas um run por produto/contato/canal');
 await q("UPDATE tracking_orders SET status='refused',updated_at=NOW() WHERE id=$1",[first]);await syncLifecycleEvents();await dispatchEvents();assert.equal((await q('SELECT count(*)::int AS n FROM aw_runs'))[0].n,2);
 const {hasJourneyPurchase}=require('../dist/tracking/journey-purchases');await q("INSERT INTO tracking_orders(id,source_id,status,product_id,customer_email) VALUES($1,$2,'approved','121023','same@example.invalid')",[randomUUID(),configs[0].source]);
 assert.equal(await hasJourneyPurchase(owner,ped,{email:'same@example.invalid'},q),false,'Historinha não é compra da Pedagogia');
 await q("INSERT INTO tracking_orders(id,source_id,status,product_id,customer_email,raw) VALUES($1,$2,'approved','121790','same@example.invalid',$3)",[randomUUID(),SOURCE,JSON.stringify({item:{offer_code:'OAF7221C7'}})]);
 assert.equal(await hasJourneyPurchase(owner,ped,{email:'same@example.invalid'},q),true,'qualquer plano comprado interrompe recuperação');assert.equal((await q('SELECT count(*)::int AS n FROM aw_messages'))[0].n,0);
 const [hist]=await q("SELECT * FROM aw_products WHERE external_product_id='121023'");
 const histContact=randomUUID(),pedContact=randomUUID();
 await q("INSERT INTO comm_deals(id,user_id,pipeline_id,contact_email,external_source,external_id) VALUES($1,$2,$3,'authorized@example.invalid','crm-manual','hist-authorized')",[histContact,owner,hist.settings.lifecycle_pipeline_id]);
 await q("INSERT INTO aw_consents(user_id,deal_id,channel,status,evidence) VALUES($1,$2,'email','opted_in','Autorização documentada de teste')",[owner,histContact]);
 const third=randomUUID();await q("INSERT INTO tracking_orders(id,source_id,status,product_id,customer_email) VALUES($1,$2,'pending','121790','authorized@example.invalid')",[third,SOURCE]);await syncLifecycleEvents();
 assert.equal((await q("SELECT c.deal_id FROM aw_consents c JOIN comm_deals d ON d.id=c.deal_id WHERE d.external_id=$1",['order:'+third])).length,0,'autorização da Historinha não passa para Pedagogia');
 await q("INSERT INTO comm_deals(id,user_id,pipeline_id,contact_email,external_source,external_id) VALUES($1,$2,$3,'authorized@example.invalid','crm-manual','ped-authorized')",[pedContact,owner,ped.settings.lifecycle_pipeline_id]);
 await q("INSERT INTO aw_consents(user_id,deal_id,channel,status,evidence) VALUES($1,$2,'email','opted_in','Autorização documentada de teste')",[owner,pedContact]);
 const fourth=randomUUID();await q("INSERT INTO tracking_orders(id,source_id,status,product_id,customer_email) VALUES($1,$2,'pending','121790','authorized@example.invalid')",[fourth,SOURCE]);await syncLifecycleEvents();
 assert.equal((await q("SELECT c.status FROM aw_consents c JOIN comm_deals d ON d.id=c.deal_id WHERE d.external_id=$1",['order:'+fourth]))[0]?.status,'opted_in');
 }finally{await close()}
});
