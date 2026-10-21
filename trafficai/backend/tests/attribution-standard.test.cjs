const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {attributionSdk}=require('../dist/tracking/attribution-sdk');const {quizSdk}=require('../dist/tracking/quiz-sdk');const {checkoutAttribution}=require('../dist/tracking/checkout-attribution');const {parsePlatformWebhook}=require('../dist/tracking/checkout-platforms');
const sid='11111111-1111-4111-8111-111111111111',qid='22222222-2222-4222-8222-222222222222';
function storage(map=new Map()){return{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)}}
function browser(search='',opts={}){
 const handlers={},requests=[],links=opts.links||[];const session=opts.session||storage(),local=opts.local||storage();
 const document={readyState:'complete',documentElement:{},querySelectorAll:()=>links,getElementById:()=>null,addEventListener:(type,fn)=>(handlers[type]??=[]).push(fn)};
 const location={protocol:'https:',origin:'https://shop.example.com',href:'https://shop.example.com/page'+search,search};
 const window={document,location,sessionStorage:session,localStorage:local,crypto:webcrypto,setTimeout,addEventListener(){}};
 const context=vm.createContext({window,document,sessionStorage:session,localStorage:local,crypto:webcrypto,Uint8Array,URL,URLSearchParams,AbortSignal,setTimeout,clearTimeout,fetch:async(url,config)=>{requests.push({url,body:JSON.parse(config.body)});return{ok:true}}});
 vm.runInContext(opts.quiz?quizSdk:attributionSdk,context);
 return{window,context,requests,session,local,handlers,links,client:()=>window.TrafficAIAttribution.create({sourceToken:opts.token||'source'})};
}
function link(href,attrs={}){return{href,getAttribute:key=>key==='href'?href:attrs[key],hasAttribute:key=>Object.hasOwn(attrs,key)}}
test('atribuição preserva UTMs, click IDs e sessão na navegação até PushinPay',()=>{
 const f=browser('?utm_source=teste&utm_campaign=A%7C123456&fbclid=click&sck='+sid+'&quiz_session_id='+qid);const c=f.client();
 const dest=new URL(c.decorate('https://app.pushinpay.com.br/service/pay/123?cupom=SIM#planos'));
 assert.equal(dest.searchParams.get('utm_campaign'),'A|123456');assert.equal(dest.searchParams.get('quiz_session_id'),qid);assert.equal(dest.searchParams.get('sck'),sid);assert.equal(dest.searchParams.get('fbclid'),'click');assert.equal(dest.searchParams.get('cupom'),'SIM');assert.equal(dest.hash,'#planos');
 const next=browser('',{session:f.session,local:f.local});assert.equal(next.client().params().quiz_session_id,qid);assert.equal(next.client().params().utm_campaign,'A|123456');
});
test('fontes isoladas e novo toque não mistura campos da campanha anterior',()=>{
 const local=storage();browser('?utm_source=antiga&utm_campaign=antiga&fbclid=antigo',{local}).client();
 const changed=browser('?utm_campaign=nova',{local}).client();assert.equal(changed.params().utm_source,undefined);assert.equal(changed.params().fbclid,undefined);assert.equal(changed.params().utm_campaign,'nova');
 assert.equal(browser('',{local,token:'outra-fonte'}).client().params().utm_campaign,undefined);
});
test('decoração automática trata links próprios, hosts exatos e cliques de links dinâmicos',()=>{
 const links=[link('https://app.pushinpay.com.br/service/pay/a'),link('https://shop.example.com/oferta'),link('https://checkout.custom.example/compra',{'data-tai-checkout':''}),link('https://pushinpay.com.br.evil.example/roubo'),link('https://evilpushinpay.com.br/roubo'),link('javascript:alert(1)',{'data-tai-checkout':''}),link('#planos'),link('https://shop.example.com/arquivo.pdf'),link('https://pay.kiwify.com.br/a',{'data-tai-ignore':''})];
 const f=browser('?utm_source=meta',{links});const c=f.client();c.bind();c.bind();
 for(let i=0;i<3;i++)assert.equal(new URL(links[i].href).searchParams.get('utm_source'),'meta');
 for(let i=3;i<links.length;i++)assert(!links[i].href.includes('sck='));
 const dynamic=link('https://pay.hotmart.com/a');for(const fn of f.handlers.click)fn({target:{closest:()=>dynamic}});assert(new URL(dynamic.href).searchParams.get('sck'));
 assert.equal(f.handlers.click.length,1);assert(!JSON.stringify(c.diagnose()).includes('meta'));assert.equal(c.diagnose().webhookVerified,false);
});
test('armazenamento bloqueado mantém a mesma sessão em memória e exclui dados não permitidos',()=>{
 const blocked={getItem(){throw Error()},setItem(){throw Error()}};
 const f=browser('?utm_source=teste&name=privado&phone=privado&key=segredo',{session:blocked,local:blocked});const c=f.client(),a=c.decorate('https://pay.ticto.app/a'),b=c.decorate('https://pay.ticto.app/a');assert.equal(new URL(a).searchParams.get('sck'),new URL(b).searchParams.get('sck'));assert(!a.includes('privado'));assert(!a.includes('segredo'));assert.equal(c.diagnose().storageBlocked,true);
});
test('createStandard envia só campos cadastrados e sem dados pessoais, mantendo legado explícito',async()=>{
 const f=browser('?utm_source=teste',{quiz:true});const q=f.window.TrafficAIQuiz.createStandard({sourceToken:'source',funnelId:'generico',apiBase:'https://api.example.com',answerKeys:['objetivo','name','phone','email','cpf','password']});
 await q.record('inicio','complete',{objetivo:'aprender',name:'privado',phone:'privado',email:'privado',cpf:'privado',password:'segredo',naoCadastrado:'x'});
 assert.equal(f.requests.length,2);assert.deepEqual(JSON.parse(JSON.stringify(f.requests[1].body.answers)),{objetivo:'aprender'});assert.equal(q.status().lastError,null);assert.equal(q.status().pending,0);assert.equal(new URL(q.decorateUrl('https://shop.example.com/vendas')).searchParams.get('quiz_session_id'),f.window.__taiQuizSessionId);
 const legacy=browser('',{quiz:true});await legacy.window.TrafficAIQuiz.create({sourceToken:'other',funnelId:'antigo',apiBase:'https://api.example.com'}).record('nome','save',{name:'Legado'});assert.equal(legacy.requests[1].body.answers.name,'Legado');
});
test('modelo padrão restaura rascunho sem reexpor contatos de uma integração anterior',async()=>{
 const session=storage();session.setItem('trafficai_quiz:source:quiz',JSON.stringify({id:qid,writeKey:'a'.repeat(64),trackingSessionId:sid,attribution:{},revision:1,answers:{name:'privado',objetivo:'x'},queue:[{step:'inicio',kind:'save',eventId:sid,revision:1,answers:{name:'privado',objetivo:'x'}}],created:true,updatedAt:Date.now()}));
 const f=browser('',{quiz:true,session});const q=f.window.TrafficAIQuiz.createStandard({sourceToken:'source',funnelId:'quiz',apiBase:'https://api.example.com',answerKeys:['name','objetivo']});await q.flush();assert.equal(q.restored.name,undefined);assert(!JSON.stringify(f.requests).includes('privado'));
});
test('normalização reconhece formatos de sessão sem inventar vínculo e adapta PushinPay',()=>{
 for(const container of ['tracking','metadata','TrackingParameters'])assert.equal(checkoutAttribution({[container]:{s1:qid,utm_campaign:'A'}}).quiz_session_id,qid);
 assert.equal(checkoutAttribution({data:{metadata:{quiz_session_id:qid,sck:sid}}}).sck,sid);
 assert.equal(checkoutAttribution({quiz_session_id:'invalid',s1:'nome',payer_name:'Pessoa'}).quiz_session_id,undefined);
 const r=parsePlatformWebhook('pushinpay',{id:'transaction',status:'paid',value:'990',payer_name:'Teste',s1:qid,utm_campaign:'A',sck:sid,key:'SEGREDO'});assert.equal(r.order.raw.tracking.quiz_session_id,qid);assert.equal(r.order.sck,sid);assert(!JSON.stringify(r).includes('SEGREDO'));
 const generic=parsePlatformWebhook('other',{event:'order',platform:'nova',id:'123',status:'approved',value:10,metadata:{quiz_session_id:qid,sck:sid}});assert.equal(generic.order.raw.tracking.quiz_session_id,qid);assert.equal(generic.order.sck,sid);
});

test('quiz sem pixel preserva a sessão recebida de outro domínio',()=>{
 const f=browser('?sck='+sid,{quiz:true});const q=f.window.TrafficAIQuiz.createStandard({sourceToken:'source',funnelId:'crossdomain',apiBase:'https://api.example.com',answerKeys:['objetivo']});
 assert.equal(new URLSearchParams(q.checkoutParams()).get('sck'),sid);
});

test('pixel gerado incorpora o runtime compartilhado com JavaScript válido',()=>{
 const fs=require('node:fs');const source=fs.readFileSync(require('node:path').join(__dirname,'../src/tracking/tracking.public.ts'),'utf8');
 const start=source.indexOf('function buildPixelScript('),end=source.indexOf('// ─── POST /track/behavior/click',start);
 const fn=source.slice(start,end).trim().replace('function buildPixelScript(token: string, apiBase: string, pixelId: string | null): string {','function buildPixelScript(token,apiBase,pixelId) {');
 const generate=vm.runInNewContext('('+fn+')',{attributionSdk});
 const pixel=generate('public-source','https://api.example.com','');new vm.Script(pixel);
 assert(pixel.includes('window.TrafficAIAttribution.create'));assert(pixel.includes('integrationStatus'));assert(pixel.includes('__taiQuizPersonalDataAllowed === false'));
});

test('placeholders do checkout não voltam como sessão/UTM após normalização da Ticto',()=>{
 const {checkoutAttribution}=require('../dist/tracking/checkout-attribution');
 const {parsePlatformWebhook}=require('../dist/tracking/checkout-platforms');
 for(const placeholder of ['Não Informado','não informado','Nao informado','null','undefined','N/A','(not set)']){
  assert.equal(checkoutAttribution({tracking:{sck:placeholder,utm_campaign:placeholder}}).sck,undefined);
  assert.equal(checkoutAttribution({tracking:{sck:placeholder,utm_campaign:placeholder}}).utm_campaign,undefined);
 }
 const r=parsePlatformWebhook('ticto',{status:'authorized',order:{hash:'fixture-placeholder',paid_amount:990},item:{product_id:121023,product_name:'Historinha',amount:990,quantity:1},tracking:{sck:'Não Informado',utm_campaign:'Não Informado'}});
 assert.equal(r.kind,'order');assert.equal(r.order.sck,undefined);assert.equal(r.order.utm_campaign,undefined);
 const fallback=checkoutAttribution({tracking:{sck:'Não Informado'},metadata:{sck:'valid-session-123'}});assert.equal(fallback.sck,'valid-session-123');
});
