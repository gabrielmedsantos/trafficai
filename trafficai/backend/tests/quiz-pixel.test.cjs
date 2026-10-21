const {test}=require('node:test');const assert=require('node:assert/strict');
const vm=require('node:vm');const {readFileSync}=require('node:fs');const {join}=require('node:path');
const source=readFileSync(join(__dirname,'../src/tracking/tracking.public.ts'),'utf8');
const snippet=source.slice(source.indexOf('  var ADD_TO_CART_TEXTS'),source.indexOf('  // ── Auto-scroll tracking'));
function fixture(quiz,store=new Map()){
 const sent=[];let handler;
 const document={addEventListener(type,fn){assert.equal(type,'click');handler=fn;}};
 const context=vm.createContext({window:{__taiQuizActive:quiz,__taiQuizSessionId:quiz?'quiz-one':null},TOKEN:'source',document,sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},track:(event,params)=>sent.push({event,params}),isCheckoutLink:el=>!!el.href,decorate:url=>url});
 vm.runInContext(snippet,context);
 return {sent,click(text,checkout=false,href){handler({target:{tagName:href?'A':'BUTTON',textContent:text,parentNode:document,href,hasAttribute:name=>checkout&&name==='data-tai-checkout',getAttribute:()=>null}});}};
}
test('pixel no quiz ignora perguntas e registra apenas uma saída, inclusive após recarregar',()=>{
 const store=new Map(),f=fixture(true,store);
 for(const text of ['Continuar','Próximo','Avançar','Confirmar resposta','Quero criar o livro'])f.click(text);
 assert.equal(f.sent.length,0);
 f.click('Quero meu livro',true);f.click('Quero meu livro',true);
 assert.equal(f.sent.length,1);assert.equal(f.sent[0].event,'InitiateCheckout');
 const reloaded=fixture(true,store);reloaded.click('Quero meu livro',true);assert.equal(reloaded.sent.length,0);
});
test('landing pages mantêm a detecção e link externo de checkout é deduplicado',()=>{
 const f=fixture(false);f.click('Ir para pagamento');f.click('Ir para pagamento');assert.equal(f.sent.length,1);
 const link=fixture(true);link.click('Pagar',false,'https://pay.kiwify.com.br/test');link.click('Pagar',false,'https://pay.kiwify.com.br/test');assert.equal(link.sent.length,1);
});

test('SDK distribuído inicializa sem delegação recursiva e expõe flush',()=>{
 const {quizSdk}=require('../dist/tracking/quiz-sdk');
 const store=new Map(),window={location:{protocol:'https:',search:''},addEventListener(){}};
 const context=vm.createContext({window,crypto:require('node:crypto').webcrypto,Uint8Array,URLSearchParams,AbortSignal,sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},document:{getElementById:()=>null},setTimeout,fetch:async()=>({ok:true})});
 vm.runInContext(quizSdk,context);
 const capture=window.TrafficAIQuiz.create({sourceToken:'token',apiBase:'https://api.example.com',funnelId:'quiz'});
 assert.equal(typeof capture.flush,'function');assert.equal(window.__taiQuizActive,true);
 assert.equal(new URLSearchParams(capture.checkoutParams()).get('s1'),window.__taiQuizSessionId);
});
