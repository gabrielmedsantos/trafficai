const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../dist/database/connection');
const {sharedAccountReadAccess} = require('../dist/team/account-read-access');

test('account sharing resolves only granted resources, blocks writes and removes credentials', async () => {
    const original = db.query;
    const source = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    db.query = async (_sql, args) => args[0] === source && args[1] === 'rickson' ? [{user_id:'owner'}] : [];
    const run = async (id, method='GET', kind='tracking') => {
        const req = {path:`/sources/${id}`,method,query:{},user:{userId:'rickson',actorId:'rickson'}};
        const res = {statusCode:200,status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}};
        let next = false;
        await sharedAccountReadAccess(kind)(req,res,e=>{if(e)throw e;next=true;});
        return {req,res,next};
    };
    try {
        const allowed=await run(source);
        assert.equal(allowed.req.user.userId,'owner');
        assert.equal(allowed.req.user.actorId,'rickson');
        allowed.res.json({data:{name:'Airton',access_token:'private',webhook_secret:'private',public_token:'public'}});
        assert.deepEqual(allowed.res.body.data,{name:'Airton',public_token:'public'});
        const denied=await run(other);
        assert.equal(denied.req.user.userId,'rickson');
        const write=await run(source,'PUT','quiz');
        assert.equal(write.res.statusCode,403);
        assert.equal(write.next,false);
        assert.equal(write.req.user.userId,'rickson');
        const quiz=await run(source,'GET','quiz');
        assert.equal(quiz.req.user.userId,'owner');
    } finally { db.query=original; }
});
