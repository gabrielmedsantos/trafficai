process.env.ENCRYPTION_KEY=require('node:crypto').randomBytes(32).toString('hex');
const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const fs=require('node:fs');
const {fixture}=require('./support/automation-db.cjs');
const {HISTORINHA_JOURNEY:j,quizSourceScope,sharedOrderScope}=require('../dist/tracking/quiz-sharing');
const {hasJourneyPurchase}=require('../dist/tracking/journey-purchases');
const {recoverableQuizContact}=require('../dist/tracking/quiz-recovery');
const {orderLifecycleType}=require('../dist/automation/workflows/lifecycle');
test('contato exige endereço válido e não presume autorização',()=>{
 assert.deepEqual(recoverableQuizContact({email:'bad',phone:'123'}),{email:'',phone:'',consent:false});
 assert.equal(recoverableQuizContact({email:'a@example.invalid',recoveryConsent:true}).consent,true);
 assert.equal(orderLifecycleType('approved'),'payment.approved');assert.equal(orderLifecycleType('pending'),'checkout.started');assert.equal(orderLifecycleType('something'),null);
});
test('jornada compartilhada mantém isolamento, pedido único, bloqueio por compra e instalação em rascunho',async()=>{
 const {db,q,close}=await fixture();try{
 await db.exec(fs.readFileSync('src/database/migrations/083_quiz_sessions.sql','utf8'));
 await db.exec(`CREATE TABLE comm_pipelines(id UUID DEFAULT gen_random_uuid() PRIMARY KEY,user_id UUID,external_source TEXT,external_id TEXT,name TEXT,is_main BOOLEAN);
 CREATE TABLE comm_pipeline_stages(id UUID DEFAULT gen_random_uuid() PRIMARY KEY,pipeline_id UUID,external_id TEXT,name TEXT,position INT);
 ALTER TABLE comm_deals ADD COLUMN pipeline_id UUID;ALTER TABLE comm_deals ADD COLUMN stage_id UUID;ALTER TABLE comm_deals ADD COLUMN external_source TEXT;ALTER TABLE comm_deals ADD COLUMN external_id TEXT;
 ALTER TABLE comm_deals ALTER COLUMN id SET DEFAULT gen_random_uuid();
 CREATE UNIQUE INDEX deal_external ON comm_deals(user_id,external_source,external_id) WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
 ALTER TABLE tracking_orders ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();`);
 const owner=randomUUID(),foreign=randomUUID(),other=randomUUID();await q('INSERT INTO users(id) VALUES($1),($2)',[owner,foreign]);
 await q('INSERT INTO tracking_sources(id,user_id) VALUES($1,$2),($3,$2),($4,$5)',[j.sourceId,owner,j.sharedSourceId,other,foreign]);
 const canonical=randomUUID(),unrelated=randomUUID(),own=randomUUID();
 await q(`INSERT INTO tracking_quiz_funnels(id,source_id,slug,name,origin,steps,answer_keys) VALUES($1,$2,$3,'Historinha','https://historinha.alfamaxdigital.com.br','[]','["email","phone"]'),($4,$2,'black','Outro','https://other.example','[]','[]'),($5,$6,'mesa','Mesa','https://mesa.example','[]','[]')`,[canonical,j.sourceId,j.slug,unrelated,own,j.sharedSourceId]);
 let rows=await q(`SELECT f.id FROM tracking_quiz_funnels f WHERE ${quizSourceScope()}`,[j.sharedSourceId]);assert.deepEqual(new Set(rows.map(r=>r.id)),new Set([canonical,own]));
 await q('UPDATE tracking_sources SET user_id=$2 WHERE id=$1',[j.sharedSourceId,foreign]);rows=await q(`SELECT f.id FROM tracking_quiz_funnels f WHERE ${quizSourceScope()}`,[j.sharedSourceId]);assert.deepEqual(rows.map(r=>r.id),[own]);await q('UPDATE tracking_sources SET user_id=$2 WHERE id=$1',[j.sharedSourceId,owner]);
 const order=randomUUID();await q("INSERT INTO tracking_orders(id,source_id,product_id,status,customer_phone) VALUES($1,$2,'121023','approved','55 (11) 99999-9999')",[order,j.sharedSourceId]);
 assert.equal(await hasJourneyPurchase(owner,{source_id:j.sourceId,external_product_id:'121023'},{phone:'11999999999'},q),true);
 assert.equal(await hasJourneyPurchase(foreign,{source_id:j.sourceId,external_product_id:'121023'},{phone:'11999999999'},q),false);
 assert.equal(await hasJourneyPurchase(owner,{source_id:j.sourceId,external_product_id:'121026'},{phone:'11999999999'},q),false);
 assert.equal(await hasJourneyPurchase(owner,{source_id:j.sourceId,external_product_id:'121023',settings:{purchase_offer_code:'O97B9CEC1'}},{phone:'11999999999'},q),false);
 await q("UPDATE tracking_orders SET raw=$2 WHERE id=$1",[order,JSON.stringify({item:{offer_code:'O97B9CEC1'}})]);
 assert.equal(await hasJourneyPurchase(owner,{source_id:j.sourceId,external_product_id:'121023',settings:{purchase_offer_code:'O97B9CEC1'}},{phone:'11999999999'},q),true);
 const {purchaseTag}=require('../dist/automation/workflows/purchase-target');assert.notEqual(purchaseTag({source_id:j.sourceId,external_product_id:'121023'}),purchaseTag({source_id:j.sourceId,external_product_id:'121023',settings:{purchase_offer_code:'O97B9CEC1'}}));
 assert.equal((await q(`SELECT o.id FROM tracking_orders o WHERE ${sharedOrderScope()}`,[j.sharedSourceId])).filter(r=>r.id===order).length,1);
 await q("INSERT INTO comm_integrations(id,user_id,name,type,status,config) VALUES('eace897e-6392-4fd7-a7fb-413f8e7a6f3d',$1,'Test connection','whatsapp_uazapi','connected','{}')",[owner]);
 process.env.HISTORINHA_BASIC_CHECKOUT='https://payment.ticto.app/BASIC1';
 const {prepareHistorinhaLifecycle}=require('../scripts/prepare-historinha-lifecycle.cjs');const result=await prepareHistorinhaLifecycle();
 assert.equal(result.flows.length,10);assert(result.flows.every(f=>f.status==='draft'));
 assert.equal((await q('SELECT count(*)::int AS n FROM aw_products'))[0].n,2);
 assert.equal((await q('SELECT count(*)::int AS n FROM aw_templates'))[0].n,24);
 await prepareHistorinhaLifecycle();assert.equal((await q('SELECT count(*)::int AS n FROM aw_templates'))[0].n,24);
 assert.equal((await q('SELECT count(*)::int AS n FROM aw_runs'))[0].n,0);
 assert.equal((await q('SELECT answer_keys FROM tracking_quiz_funnels WHERE id=$1',[canonical]))[0].answer_keys.filter(k=>k==='recoveryConsent').length,1);
 // Without explicit consent, even a complete old quiz never becomes a recovery message.
 const session=randomUUID();const {encrypt}=require('../dist/shared/encryption');
 await q("INSERT INTO tracking_quiz_sessions(id,funnel_id,write_key_hash,answers_encrypted,created_at,updated_at) VALUES($1,$2,repeat('a',64),$3,NOW(),NOW()-INTERVAL '1 hour')",[session,canonical,encrypt(JSON.stringify({email:'new@example.invalid',phone:'11988888888'}))]);
 const {syncLifecycleEvents}=require('../dist/automation/workflows/lifecycle');await syncLifecycleEvents();assert.equal((await q("SELECT count(*)::int AS n FROM aw_events WHERE event_type='quiz.abandoned'"))[0].n,0);
 await q('UPDATE tracking_quiz_sessions SET answers_encrypted=$2 WHERE id=$1',[session,encrypt(JSON.stringify({email:'new@example.invalid',phone:'11988888888',recoveryConsent:true}))]);await syncLifecycleEvents();await syncLifecycleEvents();
 assert.equal((await q("SELECT count(*)::int AS n FROM aw_events WHERE event_type='quiz.abandoned'"))[0].n,1);
 assert.equal((await q('SELECT count(*)::int AS n FROM tracking_orders'))[0].n,1);
 assert.equal((await q('SELECT count(*)::int AS n FROM aw_messages'))[0].n,0);
 // Exercise an actual quiz recovery run in simulation, then approve on the second
 // source before the next contact. No provider is called and no real order is invented.
 const [flow]=await q("SELECT * FROM aw_flows WHERE name='Historinha · Quiz interrompido · E-mail'");
 await q("UPDATE aw_flows SET status='active',published_version=1 WHERE id=$1",[flow.id]);
 await q('INSERT INTO aw_versions(flow_id,version,user_id,graph,source_id,product_id,recovery,settings) VALUES($1,1,$2,$3,$4,$5,true,$6)',[flow.id,owner,JSON.stringify(flow.graph),j.sourceId,result.product,JSON.stringify(flow.settings)]);
 const {dispatchEvents}=require('../dist/automation/workflows/events');await dispatchEvents();
 const [run]=await q('SELECT id FROM aw_runs WHERE flow_id=$1',[flow.id]);assert(run);
 await q('UPDATE aw_runs SET test_mode=true WHERE id=$1',[run.id]);
 const {claimJob,executeJob}=require('../dist/automation/workflows/engine');
 for(let i=0;i<8;i++){await q("UPDATE aw_jobs SET due_at=NOW() WHERE run_id=$1 AND status IN ('queued','waiting')",[run.id]);const job=await claimJob();if(!job)break;await executeJob(job);if((await q('SELECT id FROM aw_messages WHERE run_id=$1',[run.id])).length)break;}
 assert.equal((await q("SELECT count(*)::int AS n FROM aw_messages WHERE run_id=$1 AND status='simulated'",[run.id]))[0].n,1);
 await q("INSERT INTO tracking_orders(id,source_id,status,product_id,customer_phone) VALUES($1,$2,'approved','121023','55 (11) 98888-8888')",[randomUUID(),j.sharedSourceId]);
 await q("UPDATE aw_jobs SET due_at=NOW() WHERE run_id=$1 AND status IN ('queued','waiting')",[run.id]);const next=await claimJob();assert(next);await executeJob(next);
 assert.equal((await q('SELECT status FROM aw_runs WHERE id=$1',[run.id]))[0].status,'canceled');
 assert.equal((await q('SELECT count(*)::int AS n FROM aw_messages WHERE run_id=$1',[run.id]))[0].n,1);
 // A paid recovery link keeps an exact quiz reference even when its sck is a new
 // automation click id. This is sufficient for the secondary CAPI, without PII guessing.
 await db.exec(`ALTER TABLE tracking_sources ADD COLUMN pixel_id TEXT;ALTER TABLE tracking_sources ADD COLUMN access_token TEXT;ALTER TABLE tracking_sources ADD COLUMN test_event_code TEXT;ALTER TABLE tracking_sources ADD COLUMN is_active BOOLEAN DEFAULT true;ALTER TABLE tracking_sources ADD COLUMN account_id UUID;
 CREATE TABLE tracking_events(source_id UUID,session_id TEXT,event_name TEXT,event_source_url TEXT,created_at TIMESTAMPTZ DEFAULT NOW());`);
 await q("UPDATE tracking_sources SET pixel_id='target',access_token='fixture-only' WHERE id=$1",[j.sharedSourceId]);
 const paidRecovery=randomUUID();await q("INSERT INTO tracking_orders(id,source_id,status,product_id,sck,raw) VALUES($1,$2,'approved','121023','recovery-click',$3)",[paidRecovery,j.sourceId,JSON.stringify({TrackingParameters:{quiz_session_id:session}})]);
 const {mirrorCapiEvent}=require('../dist/tracking/capi-mirrors');let mirrors=0;
 const originalSource={id:j.sourceId,user_id:owner,pixel_id:'original',access_token:'fixture-only',is_active:true,test_event_code:null};
 await mirrorCapiEvent(originalSource,{event_name:'Purchase',event_id:randomUUID(),session_id:'recovery-click',event_source_url:'https://gateway.example/'},async()=>{mirrors++});assert.equal(mirrors,1);
 await mirrorCapiEvent(originalSource,{event_name:'Purchase',event_id:randomUUID(),session_id:'unknown-click',event_source_url:'https://gateway.example/'},async()=>{mirrors++});assert.equal(mirrors,1);


 }finally{await close()}
});
