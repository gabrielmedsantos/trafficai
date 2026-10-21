const test=require('node:test');const assert=require('node:assert/strict');
const {parseUtmId,metaIdsFromUtms}=require('../dist/tracking/utm');
test('UTMs reconhecem IDs numéricos puros e nome|ID sem converter nomes em IDs',()=>{
 assert.deepEqual(parseUtmId('52704235642034'),{name:null,id:'52704235642034'});
 assert.deepEqual(parseUtmId(' Campanha | 52704235642034 '),{name:'Campanha',id:'52704235642034'});
 for(const v of ['Campanha','Campanha|Teste','123','{{campaign.id}}'])assert.equal(parseUtmId(v).id,null);
 assert.deepEqual(metaIdsFromUtms({utm_campaign:'52704235642034',utm_medium:'52704235642035',utm_content:'52704235642036'}),{meta_campaign_id:'52704235642034',meta_adset_id:'52704235642035',meta_ad_id:'52704235642036'});
 assert.equal(metaIdsFromUtms({utm_medium:'paid',utm_term:'52704235642234'}).meta_adset_id,'52704235642234');
});
