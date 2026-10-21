const {test}=require('node:test');
const assert=require('node:assert/strict');
const {contactMatches}=require('../dist/tracking/quiz-contact-search');
test('busca aceita acentos, e-mail, telefone formatado, país e número antigo sem o nono dígito',()=>{
 assert.ok(contactMatches('otavio',['Otávio']));
 assert.ok(contactMatches('NEIA@example.com',['neia@example.com']));
 assert.ok(contactMatches('(67) 99945-5672',['+5567999455672']));
 assert.ok(contactMatches('6799455672',['+5567999455672']));
 assert.ok(!contactMatches('Otávio',['Maité','Lindinéia']));
 assert.ok(!contactMatches('não existe',['neia@example.com']));
});
