const {test}=require('node:test');const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {salesAccountScope,salesSourceScope}=require('../dist/tracking/sales-account-scope');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('one product across accounts: pending PIX follows campaign, unified selection counts once, tenant isolated',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE tracking_sources(id uuid,user_id uuid,account_id uuid);CREATE TABLE ad_accounts(id uuid,user_id uuid);CREATE TABLE campaigns(account_id uuid,meta_campaign_id text);CREATE TABLE tracking_orders(id text,source_id uuid,meta_campaign_id text,status text);`);
 for(const [s,u,a]of [[1,100,11],[2,100,12],[3,200,13]]){
 await db.query('INSERT INTO tracking_sources VALUES($1,$2,$3)',[id(s),id(u),id(a)]);
 await db.query('INSERT INTO ad_accounts VALUES($1,$2)',[id(a),id(u)]);
 }
 await db.query('INSERT INTO campaigns VALUES($1,$2),($3,$4),($5,$6)',[id(11),'airton',id(12),'moblyar',id(13),'foreign']);
 for(const [o,s,c,status]of [['pix',1,'moblyar','pending'],['paid',1,'airton','approved'],['organic',1,null,'approved'],['unknown',1,'not-synced','pending'],['foreign',3,'moblyar','pending']])await db.query('INSERT INTO tracking_orders VALUES($1,$2,$3,$4)',[o,id(s),c,status]);
 const read=async(s,accounts)=> (await db.query(`SELECT o.id FROM tracking_orders o WHERE ${salesAccountScope('o','$1',accounts)} ORDER BY o.id`,[id(s)])).rows.map(r=>r.id);
 assert.deepEqual(await read(1),['organic','paid']);assert.deepEqual(await read(2),['pix']);
 assert.deepEqual(await read(1,[id(11),id(12)]),['organic','paid','pix']);
 assert.deepEqual(await read(2,[id(13)]),[]);
 // Approval uses the same row; no source mutation or duplicate revenue.
 await db.exec("UPDATE tracking_orders SET status='approved' WHERE id='pix'");assert.deepEqual(await read(2),['pix']);
 assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM tracking_orders WHERE id='pix'")).rows[0].n,1);
 // Ambiguous campaign ownership is not silently attributed to a random account.
 await db.query('INSERT INTO campaigns VALUES($1,$2)',[id(11),'moblyar']);assert.deepEqual(await read(2),[]);
 }finally{await db.close()}
});
test('SQL builders reject injected identifiers and account IDs',()=>{
 assert.throws(()=>salesAccountScope('o;DROP'));assert.throws(()=>salesAccountScope('o','$1',["x');DROP"]));assert.throws(()=>salesSourceScope('$1',["x'"]));
});
