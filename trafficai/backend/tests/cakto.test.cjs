const test=require('node:test');const assert=require('node:assert/strict');
const {detectPlatform,parsePlatformWebhook,buildPurchaseFromOrder}=require('../dist/tracking/checkout-platforms');
function item(ref,parent,price){return {id:'id-'+ref,refId:ref,parent_order:parent,offer_type:parent?'orderbump':'main',customer:{name:'Teste',email:'cliente@teste.local',phone:'5511999991234'},product:{id:'product-'+ref,name:parent?'Adicional '+ref:'Mamãe, quero historinha'},amount:price,baseAmount:price,commissions:[{type:'producer',totalAmount:price-1}],paymentMethod:'pix',checkoutUrl:'https://pay.cakto.com.br/vv37kcp_1181142?utm_campaign=123456789&utm_medium=paid&utm_term=234567890&sck=session123&s1=quiz123',createdAt:'2026-10-07T15:00:00-03:00',paidAt:'2026-10-07T15:01:00-03:00'};}
test('Cakto lista: compra principal e bumps viram uma venda com valor total, sessão e Purchase único',()=>{
 const payload={secret:'não-deve-ser-armazenada',event:'purchase_approved',data:[item('colorir','main',7.9),item('priority','main',5.5),item('main',null,9.9)]};
 assert.equal(detectPlatform(payload),'cakto');const r=parsePlatformWebhook('cakto',payload);assert.equal(r.kind,'order');
 const o=r.order;assert.equal(o.external_order_id,'main');assert.equal(o.gross_value,23.3);assert.equal(o.net_value,20.3);assert.equal(o.status,'approved');assert.equal(o.sck,'session123');assert.equal(o.utm_campaign,'123456789');assert.equal(o.raw.tracking.quiz_session_id,'quiz123');assert.equal(o.raw.order_bumps.length,2);assert.equal(o.raw.secret,undefined);
 const p=buildPurchaseFromOrder(o);assert.equal(p.event_id,'cakto-main-Purchase');assert.equal(p.value,23.3);assert.equal(p.custom_data.num_items,3);assert.equal(p.custom_data.contents.length,3);assert.equal(p.campaign.meta_campaign_id,'123456789');
 assert.equal(buildPurchaseFromOrder(parsePlatformWebhook('cakto',payload).order).event_id,p.event_id);
});
test('Cakto aceita objeto, lista única e carrinho com contato nos campos planos',()=>{
 for(const data of [item('main',null,9.9),[item('main',null,9.9)]]){const r=parsePlatformWebhook('cakto',{event:'pix_gerado',data});assert.equal(r.kind,'order');assert.equal(r.order.status,'pending');}
 const r=parsePlatformWebhook('cakto',{event:'checkout_abandonment',data:[{product:{id:'p',name:'Livro'},customerName:'Cliente',customerEmail:'cliente@teste.local',customerCellphone:'5511999991234',offer:{price:9.9},recoveryLink:'https://pay.cakto.com.br/recovery?id=123'}]});assert.equal(r.kind,'cart');assert.equal(r.order.customer_phone,'5511999991234');assert.ok(r.order.checkout_url.includes('recovery'));
});
test('Cakto rejeita lotes incompletos, misturados ou repetidos em vez de confirmar perda silenciosa',()=>{
 for(const data of [[],[item('colorir','main',7.9),item('priority','main',5.5)],[item('main',null,9.9),item('other',null,7.9)],[item('main',null,9.9),item('main','main',7.9)]])assert.throws(()=>parsePlatformWebhook('cakto',{event:'purchase_approved',data}));
});
