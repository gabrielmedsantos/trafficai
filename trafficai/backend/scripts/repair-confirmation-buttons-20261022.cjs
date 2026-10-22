const {query,transaction}=require('../dist/database/connection');
const{saveFlow,publishFlow}=require('../dist/automation/workflows/repository');
const{saveTemplate}=require('../dist/automation/workflows/templates');
const USER='be5aa130-bd20-42f4-850f-a5532a5c4c42';
function cleanGraph(g){const x=structuredClone(g);for(const n of x.nodes){delete n.data.config.templateSnapshot;delete n.data.config.externalSnapshot;}return JSON.stringify(x);}
function preSendFailure(t){return t?.purpose==='transactional'&&!t.provider_template&&(t.parameters||[]).includes('unsubscribe_url');}
async function repair(apply=false){
 const flows=await query("SELECT f.*,v.graph published_graph FROM aw_flows f JOIN aw_versions v ON v.flow_id=f.id AND v.version=f.published_version WHERE f.user_id=$1 AND f.status='active' AND (f.recovery=true OR f.settings->>'post_purchase'='true') ORDER BY f.id",[USER]);
 const blocked=await query("SELECT r.id,r.flow_id,r.version,m.id message_id,m.node_id,n->'data'->'config'->'templateSnapshot' template FROM aw_runs r JOIN aw_messages m ON m.run_id=r.id JOIN aw_versions v ON v.flow_id=r.flow_id AND v.version=r.version JOIN aw_flows f ON f.id=r.flow_id CROSS JOIN LATERAL jsonb_array_elements(v.graph->'nodes') n WHERE f.user_id=$1 AND f.settings->>'post_purchase'='true' AND r.test_mode=false AND r.status='intervention' AND m.status='unknown' AND m.error_code='SEND_RESULT_UNKNOWN' AND m.provider_id IS NULL AND n->>'id'=m.node_id",[USER]);
 if(blocked.some(r=>!preSendFailure(r.template)))throw Error('UNCERTAIN_RESULT_NOT_PROVEN_PRE_SEND');
 if(flows.some(f=>cleanGraph(f.graph)!==cleanGraph(f.published_graph)))throw Error('UNPUBLISHED_DRAFT_CHANGES');
 if(!apply)return{mode:'preview',flows:flows.map(f=>({id:f.id,name:f.name,version:f.published_version})),provenBeforeProvider:blocked.length,retryRuns:blocked.map(x=>x.id),otherUncertainMessagesUntouched:true};
 if(process.env.TRAFFICAI_APPLY_CONFIRMATION_REPAIR!=='20261022')throw Error('APPLY_NOT_AUTHORIZED');
 const versions=new Map(),published=[];
 for(const f of flows){const graph=structuredClone(f.graph);let changed=false;
  for(const n of graph.nodes){if(n.type!=='message')continue;const c=n.data.config;const old=f.published_graph.nodes.find(x=>x.id===n.id).data.config.templateSnapshot;
   const needs=f.recovery ? (!c.buttonText||(c.channel==='email'&&!(old.blocks||[]).some(b=>b.type==='button'))) : preSendFailure(old);
   if(!needs)continue;
   const body={...old,name:old.name+' · revisão',parameters:f.recovery?old.parameters:[]};
   if(f.recovery){c.buttonText=f.name.includes('Quiz')?'Continuar personalização':'Continuar meu pedido';if(c.channel==='email')body.blocks=[...(old.blocks||[]),{type:'button',text:c.buttonText,url:'{{checkout_url}}'}];}
   const model=await saveTemplate(USER,body);c.templateId=model.id;changed=true;
  }
  if(changed){const draft=await saveFlow(USER,{...f,graph,revision:f.revision},f.id);const active=await publishFlow(USER,draft.id);versions.set(f.id,active.published_version);published.push({id:f.id,version:active.published_version});}else versions.set(f.id,f.published_version);
 }
 const result=await transaction(async tx=>{let migrated=0,retried=0;
  for(const[fid,version]of versions){const rows=await tx("UPDATE aw_runs r SET version=$2,updated_at=NOW() WHERE r.flow_id=$1 AND r.version<$2 AND r.test_mode=false AND r.status IN ('queued','waiting') AND NOT EXISTS(SELECT 1 FROM aw_jobs j WHERE j.run_id=r.id AND j.status='running') RETURNING r.id",[fid,version]);migrated+=rows.length;}
  for(const row of blocked){const[locked]=await tx("SELECT r.id FROM aw_runs r JOIN aw_messages m ON m.run_id=r.id AND m.id=$2 WHERE r.id=$1 AND r.status='intervention' AND m.status='unknown' AND m.error_code='SEND_RESULT_UNKNOWN' AND m.provider_id IS NULL FOR UPDATE OF r,m",[row.id,row.message_id]);if(!locked)continue;
   await tx("UPDATE aw_messages SET status='failed',error_code=NULL WHERE id=$1",[row.message_id]);await tx("UPDATE aw_runs SET version=$2,status='queued',updated_at=NOW(),finished_at=NULL WHERE id=$1",[row.id,versions.get(row.flow_id)]);const jobs=await tx("UPDATE aw_jobs SET status='queued',due_at=NOW(),locked_until=NULL,failure_count=0,updated_at=NOW() WHERE run_id=$1 AND node_id=$2 AND status='intervention' RETURNING id",[row.id,row.node_id]);retried+=jobs.length;
  }
  await tx("INSERT INTO audit_log(user_id,user_name,action,entity_type,entity_label,details) VALUES($1,'TrafficAI','repair_confirmation_buttons','automation','Confirmação transacional e botões de recuperação',$2)",[USER,JSON.stringify({published,migrated,retried,provenPreProvider:blocked.map(x=>x.id),otherUncertainMessagesUntouched:true})]);return{migrated,retried};});return{mode:'applied',published,...result};
}
module.exports={repair,preSendFailure};if(require.main===module)repair(process.argv.includes('--apply')).then(x=>{console.log(JSON.stringify(x));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)});
