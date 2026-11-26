const {test}=require('node:test');
const assert=require('node:assert/strict');
const {projectSales,pctChange,shortName,minuteSeries}=require('../dist/tracking/live-metrics.service');

test('projeção soma o pago ao ritmo das últimas 3 h nas horas restantes',()=>{
 // 15h00 em Brasília = 18h00 UTC: faltam 9 h; ritmo de 3 vendas em 3 h = 1/h
 assert.equal(projectSales(10,3,new Date('2026-11-25T18:00:00Z')),19);
});
test('perto da meia-noite a projeção fica no que já foi pago',()=>{
 assert.equal(projectSales(7,6,new Date('2026-11-26T02:59:00Z')),7);
});
test('sem vendas recentes a projeção não inventa vendas',()=>{
 assert.equal(projectSales(4,0,new Date('2026-11-25T13:00:00Z')),4);
});
test('variação contra ontem e ontem zerado',()=>{
 assert.equal(pctChange(110,100),10);
 assert.equal(pctChange(5,0),null);
});
test('nome curto mostra primeiro nome e inicial do último',()=>{
 assert.equal(shortName('marcos silva souza'),'Marcos S.');
 assert.equal(shortName('Juliana'),'Juliana');
 assert.equal(shortName('  '),null);
 assert.equal(shortName(null),null);
});
test('série por minuto vai do mais antigo ao mais novo e ignora fora da janela',()=>{
 assert.deepEqual(minuteSeries([{m:0,n:4},{m:2,n:'1'},{m:9,n:3}],3),[1,0,4]);
});
