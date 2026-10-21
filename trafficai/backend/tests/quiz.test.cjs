const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const express=require('express');
const {normalizeFunnel,normalizeAnswers,normalizeAttribution,validateEvent}=require('../dist/tracking/quiz.validation');

test('quizzes genéricos: campos, etapas, origem e marcos validados',()=>{
    const config={slug:'quiz-teste',name:'Quiz',origin:'https://quiz.example.com/path',steps:[{id:'inicio',label:'Início'},{id:'oferta',label:'Oferta'}],answerKeys:['objetivo'],completedStep:'oferta'};
    assert.equal(normalizeFunnel(config).origin,'https://quiz.example.com');
    assert.deepEqual(normalizeAnswers({objetivo:' aprender '},['objetivo']),{objetivo:'aprender'});
    assert.throws(()=>normalizeAnswers({cartao:'123'},['objetivo']));
    assert.throws(()=>normalizeFunnel({...config,steps:[config.steps[0],config.steps[0]]}));
    assert.throws(()=>normalizeFunnel({...config,origin:'http://externo.example.com'}));
    assert.throws(()=>normalizeFunnel({...config,completedStep:'inexistente'}));
    assert.deepEqual(normalizeAttribution({utm_campaign:'A',name:'criança',email:'privado'}),{utm_campaign:'A'});
    assert.throws(()=>validateEvent({eventId:randomUUID(),kind:'paid',step:'inicio',revision:1,answers:{}},config.steps));
});

test('API com PostgreSQL: criptografia, deduplicação, revisão, isolamento e pedido real',async t=>{
    const db=new PGlite();
    await db.exec(`CREATE TABLE tracking_sources(id UUID PRIMARY KEY,user_id UUID,account_id UUID,public_token TEXT,is_active BOOLEAN DEFAULT TRUE);
        CREATE TABLE account_read_access(user_id UUID,account_id UUID);
        CREATE TABLE tracking_events(source_id UUID,session_id TEXT,event_name TEXT,created_at TIMESTAMPTZ DEFAULT NOW());
        CREATE TABLE tracking_orders(id UUID PRIMARY KEY,source_id UUID REFERENCES tracking_sources(id),status TEXT,customer_name TEXT,customer_email TEXT,customer_phone TEXT,external_order_id TEXT);`);
    const migration=readFileSync(require('node:path').join(__dirname,'../src/database/migrations/083_quiz_sessions.sql'),'utf8');
    await db.exec(migration);await db.exec(migration); // repetição segura
    const owner=randomUUID(),outsider=randomUUID(),source=randomUUID(),otherSource=randomUUID();
    await db.query('INSERT INTO tracking_sources(id,user_id,public_token) VALUES($1,$2,$3),($4,$5,$6)',[source,owner,'public-one',otherSource,outsider,'public-two']);
    const connectionPath=require.resolve('../dist/database/connection');
    require.cache[connectionPath]={id:connectionPath,filename:connectionPath,loaded:true,exports:{
        query:async(sql,params)=>(await db.query(sql,params)).rows,
        queryOne:async(sql,params)=>(await db.query(sql,params)).rows[0]||null,
        transaction:fn=>db.transaction(tx=>fn(async(sql,params)=>(await tx.query(sql,params)).rows))
    }};
    const authPath=require.resolve('../dist/auth/auth.middleware');
    require.cache[authPath]={id:authPath,filename:authPath,loaded:true,exports:{actorIdOf:req=>req.get('x-test-user'),authMiddleware:(req,res,next)=>{if(!req.get('x-test-user'))return res.status(401).end();req.user={userId:req.get('x-test-user')};next();}}};
    process.env.ENCRYPTION_KEY='ab'.repeat(32);
    const {quizController,quizPublicController}=require('../dist/tracking/quiz.controller');
    const app=express();app.use(express.json());app.use('/admin',quizController);app.use('/public',quizPublicController);app.use((req,res)=>res.status(404).json({error:'Not found'}));
    app.use((err,req,res,next)=>res.status(500).json({error:err.message}));
    const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    t.after(async()=>{await new Promise(r=>server.close(r));await db.close();});
    const base=`http://127.0.0.1:${server.address().port}`;
    async function call(method,path,body,headers={}){const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});const data=await res.text();return {status:res.status,body:data?JSON.parse(data):null};}
    const admin=`/admin/sources/${source}`,auth={'x-test-user':owner};
    assert.equal((await call('GET',admin+'/funnels')).status,401);
    assert.equal((await call('GET',admin+'/funnels',null,{'x-test-user':outsider})).status,404);
    const sharedAccount=randomUUID();
    await db.query('UPDATE tracking_sources SET account_id=$1 WHERE id=$2',[sharedAccount,source]);
    await db.query('INSERT INTO account_read_access(user_id,account_id) VALUES($1,$2)',[outsider,sharedAccount]);
    assert.equal((await call('GET',admin+'/funnels',null,{'x-test-user':outsider})).status,200);
    assert.equal((await call('POST',admin+'/funnels',{}, {'x-test-user':outsider})).status,403);
    await db.exec('DELETE FROM account_read_access');
    const config={slug:'produto-a',name:'Produto A',origin:'https://quiz.example.com',steps:[{id:'inicio',label:'Início'},{id:'oferta',label:'Oferta'},{id:'checkout',label:'Checkout'}],answerKeys:['nome','objetivo','phone'],completedStep:'oferta',checkoutStep:'checkout'};
    const created=await call('POST',admin+'/funnels',config,auth);assert.equal(created.status,200,JSON.stringify(created));
    const origin={origin:config.origin},pub='/public/public-one/produto-a/sessions',sid=randomUUID(),key='cd'.repeat(32);
    assert.equal((await call('POST',pub,{id:sid,writeKey:key}, {origin:'https://evil.example.com'})).status,403);
    const payload={id:sid,writeKey:key,attribution:{utm_campaign:'Teste',nome:'Nunca para atribuição'},trackingSessionId:'tracking-123'};
    assert.equal((await call('POST',pub,payload,origin)).status,201);
    assert.equal((await call('POST',pub,payload,origin)).status,201);
    assert.equal((await call('POST',pub,{...payload,writeKey:'ef'.repeat(32)},origin)).status,409);
    const eventPath=pub+'/'+sid+'/events',write={...origin,'X-Quiz-Key':key};
    const event={eventId:randomUUID(),step:'inicio',kind:'view',revision:1,answers:{nome:'Lia'}};
    assert.equal((await call('POST',eventPath,event,{...origin,'X-Quiz-Key':'ef'.repeat(32)})).status,403);
    const firstEvent=await call('POST',eventPath,event,write);assert.equal(firstEvent.status,200,JSON.stringify(firstEvent));
    assert.equal((await call('POST',eventPath,event,write)).status,200);
    assert.equal((await db.query('SELECT * FROM tracking_quiz_events')).rows.length,1);
    assert.equal((await call('POST',eventPath,{...event,eventId:randomUUID(),step:'oferta',revision:3,answers:{nome:'Lia',objetivo:'Aprender',phone:'11999991234'}},write)).status,200);
    assert.equal((await call('POST',eventPath,{...event,eventId:randomUUID(),kind:'save',revision:2,answers:{nome:'Antigo'}},write)).status,200);
    const row=(await db.query('SELECT * FROM tracking_quiz_sessions')).rows[0];assert.equal(row.revision,3);assert.ok(row.completed_at);assert.ok(!row.answers_encrypted.includes('Lia'));assert.deepEqual(row.attribution,{utm_campaign:'Teste'});
    let detail=await call('GET',admin+'/sessions/'+sid,null,auth);assert.equal(detail.status,200,JSON.stringify(detail));assert.equal(detail.body.data.answers.nome,'Lia');assert.equal(detail.body.data.answers.phone,'11999991234');
    assert.equal((await call('GET',`/admin/sources/${otherSource}/sessions/${sid}`,null,{'x-test-user':outsider})).status,404);
    assert.equal((await call('GET',pub+'/'+sid,null,origin)).status,404); // sem leitura pública
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
    const reportPath=admin+`/report?since=${today}&until=${today}&funnel=${created.body.data.id}`;
    let report=await call('GET',reportPath,null,auth);assert.equal(report.status,200,JSON.stringify(report));assert.equal(report.body.data.summary.total,1);assert.equal(report.body.data.summary.paid,0);assert.equal(report.body.data.stages.find(s=>s.step==='inicio').viewed,1);
    let paidReport=await call('GET',reportPath+'&payment=approved',null,auth);assert.equal(paidReport.body.data.sessions.length,0);assert.equal(paidReport.body.data.summary.total,1);
    assert.equal((await call('GET',reportPath+'&payment=invalid',null,auth)).status,400);
    const order=randomUUID(),wrongOrder=randomUUID();await db.query('INSERT INTO tracking_orders(id,source_id,status) VALUES($1,$2,$3),($4,$5,$6)',[order,source,'approved',wrongOrder,otherSource,'approved']);
    assert.equal((await call('PUT',admin+'/sessions/'+sid+'/order',{orderId:wrongOrder},auth)).status,404);
    assert.equal((await call('PUT',admin+'/sessions/'+sid+'/order',{orderId:order},auth)).status,200);
    report=await call('GET',reportPath,null,auth);assert.equal(report.body.data.summary.paid,1);
    paidReport=await call('GET',reportPath+'&payment=approved',null,auth);assert.equal(paidReport.body.data.sessions.length,1);assert.equal(paidReport.body.data.sessions[0].id,sid);assert.equal(paidReport.body.data.sessions[0].payment_status,'approved');
    await db.query('UPDATE tracking_orders SET customer_name=$2,customer_email=$3,customer_phone=$4 WHERE id=$1',[order,'Lindinéia','neia@example.com','+5567999455672']);
    await db.query('INSERT INTO tracking_quiz_sessions(id,funnel_id,write_key_hash,answers_encrypted) SELECT UNNEST($1::uuid[]),$2,$3,$4',[Array.from({length:35},()=>randomUUID()),created.body.data.id,'aa'.repeat(32),require('../dist/shared/encryption').encrypt(JSON.stringify({nome:'Outro visitante'}))]);
    const searched=await call('GET',reportPath+'&search=lindineia&sort=recent',null,auth);
    assert.equal(searched.status,200,JSON.stringify(searched));assert.equal(searched.body.data.engagement.matched,1);
    assert.equal(searched.body.data.sessions[0].customer_email,'neia@example.com');
    assert.equal(searched.body.data.sessions[0].answers_encrypted,undefined);
    assert.equal((await call('GET',reportPath+'&search=6799455672',null,auth)).body.data.engagement.matched,1);
    assert.equal((await call('GET',reportPath+'&search=neia%40example.com',null,auth)).body.data.sessions[0].id,sid);
    assert.equal((await call('GET',reportPath+'&search=inexistente',null,auth)).body.data.engagement.matched,0);
    paidReport=await call('GET',reportPath+'&payment=approved&page=2',null,auth);assert.equal(paidReport.body.data.sessions.length,0);
    await db.query('UPDATE tracking_orders SET status=$2 WHERE id=$1',[order,'refunded']);
    report=await call('GET',reportPath,null,auth);assert.equal(report.body.data.summary.paid,0);
    paidReport=await call('GET',reportPath+'&payment=approved',null,auth);assert.equal(paidReport.body.data.sessions.length,0);
    assert.equal((await call('POST',admin+'/funnels',{...config,answerKeys:['outro']},auth)).status,409);
    assert.equal((await call('POST',admin+'/funnels',{...config,slug:'produto-b',answerKeys:['outro']},auth)).status,200);
    const sdk=await fetch(base+'/public/sdk.js');assert.equal(sdk.status,200);new(require('node:vm').Script)(await sdk.text());
    await db.query('UPDATE tracking_sources SET is_active=false WHERE id=$1',[source]);
    assert.equal((await call('POST',pub,{id:randomUUID(),writeKey:key},origin)).status,403);
});
