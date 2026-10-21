const test=require('node:test');const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');const {quizEngagementCte}=require('../dist/tracking/quiz-engagement');
test('interesse respeita avanço real, duplicação, retorno de etapa, aprovação e encerramento',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE tracking_quiz_funnels(id TEXT,source_id TEXT,name TEXT,slug TEXT,steps JSONB,completed_step TEXT,checkout_step TEXT);
 CREATE TABLE tracking_orders(id TEXT,status TEXT,customer_name TEXT,customer_email TEXT,customer_phone TEXT);
 CREATE TABLE tracking_quiz_sessions(id TEXT,funnel_id TEXT,current_step TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW(),completed_at TIMESTAMPTZ,checkout_at TIMESTAMPTZ,attribution JSONB DEFAULT '{}',order_id TEXT,answers_encrypted TEXT);
 CREATE TABLE tracking_quiz_events(session_id TEXT,step TEXT,kind TEXT);`);
 const steps=[...Array.from({length:10},(_,i)=>({id:'q'+(i+1)})),{id:'offer'},{id:'checkout'}];
 await db.query("INSERT INTO tracking_quiz_funnels VALUES('f','source','Quiz','generic',$1,'offer','checkout')",[JSON.stringify(steps)]);
 await db.query("INSERT INTO tracking_quiz_funnels VALUES('other','other-source','Outro','generic',$1,'offer','checkout')",[JSON.stringify(steps)]);
 for(const id of ['cold','warm','hot','done','checkout','paid','refund'])await db.query("INSERT INTO tracking_quiz_sessions(id,funnel_id,current_step) VALUES($1,'f','q1')",[id]);
 await db.exec("INSERT INTO tracking_quiz_sessions(id,funnel_id) VALUES('outsider','other'); INSERT INTO tracking_orders VALUES('paid-order','approved'),('refund-order','refunded'); UPDATE tracking_quiz_sessions SET order_id='paid-order' WHERE id='paid'; UPDATE tracking_quiz_sessions SET order_id='refund-order' WHERE id='refund'; UPDATE tracking_quiz_sessions SET completed_at=NOW() WHERE id='done'; UPDATE tracking_quiz_sessions SET checkout_at=NOW() WHERE id='checkout';");
 for(const [id,step] of [['cold','q2'],['warm','q3'],['hot','q7'],['hot','q7'],['hot','q1'],['paid','q10'],['refund','q10']])await db.query('INSERT INTO tracking_quiz_events VALUES($1,$2,$3)',[id,step,'complete']);
 const sql=quizEngagementCte('f.source_id=$1');const rows=(await db.query(sql+' SELECT id,progress_percent,interest FROM leads ORDER BY id',['source'])).rows;
 const byId=Object.fromEntries(rows.map(r=>[r.id,r]));assert.equal(rows.length,7);
 assert.equal(byId.cold.progress_percent,20);assert.equal(byId.cold.interest,'cold');assert.equal(byId.warm.progress_percent,30);assert.equal(byId.warm.interest,'warm');
 assert.equal(byId.hot.progress_percent,70);assert.equal(byId.hot.interest,'hot');assert.equal(byId.done.progress_percent,100);assert.equal(byId.checkout.interest,'hot');
 assert.equal(byId.paid.interest,'paid');assert.equal(byId.refund.interest,'closed');
 const hot=(await db.query(sql+" SELECT id FROM leads WHERE interest='hot' ORDER BY progress_percent DESC,id LIMIT 2 OFFSET 0",['source'])).rows;
 assert.deepEqual(hot.map(r=>r.id),['checkout','done']);
 const next=(await db.query(sql+" SELECT id FROM leads WHERE interest='hot' ORDER BY progress_percent DESC,id LIMIT 2 OFFSET 2",['source'])).rows;assert.deepEqual(next.map(r=>r.id),['hot']);
 }finally{await db.close();}
});
