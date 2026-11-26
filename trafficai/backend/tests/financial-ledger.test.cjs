const assert=require('node:assert/strict');
const test=require('node:test');
const {PGlite}=require('@electric-sql/pglite');
test('financial ledger reconciles cash, competence and individual receipts', async()=>{
 const db=new PGlite();
 await db.exec(`CREATE TABLE clients(id text PRIMARY KEY,user_id text,name text,avatar_color text,reminder_mode text,status text,created_at timestamptz,churned_at timestamptz);
 CREATE TABLE contracts(id text,client_id text,user_id text,description text,type text,percentage numeric,percentage_base text,billing_day int,fixed_amount numeric,status text,start_date date,end_date date);
 CREATE TABLE contract_billing(id text,client_id text,user_id text,contract_id text,reference_month date,due_date date,total_amount numeric,fixed_amount numeric,percentage_amount numeric,status text,paid_at timestamptz,payment_method text,notes text,created_at timestamptz,updated_at timestamptz);
 CREATE TABLE transactions(id text,user_id text,client_id text,account_id text,type text,category text,description text,amount numeric,date date,status text,created_at timestamptz);
 CREATE TABLE financial_accounts(id text,user_id text,name text);
 CREATE TABLE recurring_transactions(user_id text,amount numeric,active boolean,type text);
 INSERT INTO clients VALUES ('a','u','Cliente A','#fff',NULL,'ativo','2026-01-01',NULL),('b','other','Cliente B','#fff',NULL,'ativo','2026-01-01',NULL);
 INSERT INTO contracts VALUES ('c','a','u','Gestão','fixed',0,NULL,23,500,'active','2026-01-01',NULL);
 INSERT INTO contract_billing(id,client_id,user_id,contract_id,reference_month,due_date,total_amount,fixed_amount,percentage_amount,status,paid_at) VALUES
 ('july','a','u','c','2026-07-01','2026-07-23',1200,1200,0,'paid','2026-10-05 15:00Z'),
 ('aug','a','u','c','2026-08-01','2026-08-23',300,300,0,'paid','2026-09-23 15:00Z'),
 ('oct','a','u','c','2026-10-01','2026-10-23',500,500,0,'pending',NULL),
 ('nov','a','u','c','2026-11-01','2026-11-23',600,600,0,'pending',NULL),
 ('march','a','u','c','2026-03-01','2026-03-23',700,700,0,'pending',NULL),
 ('foreign','b','other','c','2026-10-01','2026-10-23',999,999,0,'paid','2026-10-05 15:00Z');
 INSERT INTO transactions(id,user_id,client_id,type,amount,date,status) VALUES
 ('t1','u','a','income',100,'2026-10-09','confirmed'),('t2','u','a','income',50,'2026-10-09','pending'),
 ('t3','u','a','expense',40,'2026-10-09','confirmed'),('t4','u','a','expense',60,'2026-10-09','pending');`);
 const connection=require('../dist/database/connection');
 const originalQuery=connection.query;
 connection.query=async(sql,args)=>(await db.query(sql,args)).rows;
 const router=require('../dist/financial/financial.controller').financialController;
 try {
 async function run(method,url,query={},body={},id){const layer=router.stack.find(x=>x.route?.path===url&&x.route.methods[method]);assert.ok(layer,url);const req={user:{userId:'u'},query,body,params:{id}};const res={statusCode:200,status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};await layer.route.stack.at(-1).handle(req,res);assert.notEqual(res.statusCode,500,JSON.stringify(res.body));return res;}
 let checks=0;function check(v,label){assert.ok(v,label);checks++;console.log('PASS '+label)}
 let r=await run('get','/dashboard',{month:'10',year:'2026',regime:'cash'});check(r.body.data.income===1300&&r.body.data.expense===40,'caixa usa data de recebimento e apenas transações confirmadas');
 check(r.body.data.billing_receipts.length===1&&r.body.data.billing_receipts[0].id==='july','histórico inclui mensalidade antiga recebida no período e isola usuário');
 check(r.body.data.dailyFlow.filter(x=>x.type==='income').reduce((n,x)=>n+Number(x.total),0)===1300,'gráfico concilia com receitas de caixa sem duplicar');
 check(r.body.data.incomeByCategory.reduce((n,x)=>n+Number(x.total),0)===1300,'categorias incluem mensalidades');
 r=await run('get','/dashboard',{month:'10',year:'2026',regime:'accrual'});check(r.body.data.income===650&&r.body.data.expense===100,'competência mantém valores no mês de referência');
 check(r.body.data.dailyFlow.filter(x=>x.type==='income').reduce((n,x)=>n+Number(x.total),0)===650,'gráfico por competência concilia');
 r=await run('get','/metrics',{month:'10',year:'2026'});check(r.body.data.revenue_this_month===1300&&r.body.data.revenue_last_month===300&&r.body.data.expense_realized===40,'gestão e comparativo usam caixa realizado');
 r=await run('get','/revenue-by-client',{month:'10',year:'2026'});check(r.body.data.length===1&&r.body.data[0].total_paid===1300,'ranking por cliente concilia com caixa');
 r=await run('get','/billing',{client_id:'a',all:'true'});check(r.body.data.length===5&&r.body.data[0].id==='march','histórico completo ordena mais antiga primeiro');
 r=await run('get','/billing',{client_id:'a',months:'3'});check(r.body.data.some(x=>x.id==='march'),'filtro mensal não esconde dívida antiga');
 r=await run('get','/billing',{all:'true'});check(r.statusCode===400,'histórico completo exige cliente');
 for(const body of [{status:'invalido'},{status:'paid',paid_at:'2026-02-30'},{status:'paid',paid_at:'2999-01-01'},{percentage_amount:-1}]){r=await run('put','/billing/:id',{},body,'oct');check(r.statusCode===400,'rejeita entrada inválida '+JSON.stringify(body));}
 r=await run('put','/billing/:id',{}, {status:'paid',paid_at:'2026-10-15',payment_method:'PIX'},'foreign');check(r.statusCode===404,'baixa não acessa cobrança de outro usuário');
 r=await run('put','/billing/:id',{}, {status:'paid',paid_at:'2026-10-15',payment_method:'PIX'},'oct');check(r.body.data.status==='paid'&&new Date(r.body.data.paid_at).toISOString()==='2026-10-15T15:00:00.000Z','baixa preserva competência e registra data real em Fortaleza');
 const first=String(r.body.data.paid_at);r=await run('put','/billing/:id',{}, {status:'paid'},'oct');check(String(r.body.data.paid_at)===first,'repetir baixa não altera data original');
 r=await run('put','/billing/:id',{}, {status:'pending'},'oct');check(r.body.data.paid_at===null,'estorno limpa data de recebimento');
 check((await db.query("SELECT status FROM contract_billing WHERE id='nov'")).rows[0].status==='pending','baixar uma mensalidade não quita outra');
 assert.equal(checks,20);
 } finally { connection.query=originalQuery; await db.close(); }
});
