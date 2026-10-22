const {query,transaction}=require('../dist/database/connection');
const {saveFlow,publishFlow}=require('../dist/automation/workflows/repository');
const {saveTemplate}=require('../dist/automation/workflows/templates');
const {graphIssues}=require('../dist/automation/workflows/validation');
const SOURCE='bcad48f8-de1f-4501-8dea-4810dc3b248d',BASE='69df58d9-8bb2-4b29-881b-ff642550bd26',FOUR='8744ae9b-2d26-4615-9baa-82694af96a51';
const WPP='eace897e-6392-4fd7-a7fb-413f8e7a6f3d',MAIL='9f42c852-f0df-4e1e-b023-29095941aebd';
const offers={
 color:{name:'Historinha · Versão para colorir',external:'121026',price:7.5,url:'https://payment.ticto.app/O63D7C194'},
 priority:{name:'Historinha · Prioridade de entrega',external:'121025',price:5.5,url:null},
 bundle:{name:'Historinha · Colorir + prioridade',external:'121025',price:13,url:'https://payment.ticto.app/ODDC26E96',offer:'ODDC26E96'},
 mission:{name:'Missão Família',external:'121137',price:19.9,url:'https://payment.ticto.app/O264C610F'}
};
const copy={
 thanks:{subject:'Sua compra da Historinha foi aprovada! 🎉',body:'Olá, {{name}}! Sua compra da Historinha foi aprovada! 🎉\n\nParabéns por escolher uma aventura em que a criança é a protagonista. Recebemos seu pedido, que seguirá para preparação conforme os itens e o prazo contratados.\n\nSe precisar de ajuda, responda esta mensagem. Sua compra está confirmada; nenhum adicional é necessário para continuar.'},
 bundle:{subject:'Sua Historinha pode ganhar cores — e chegar mais rápido 🎨',button:'Quero o combo',body:'Sua Historinha já está confirmada, {{name}}! 🎉\n\nQue tal acrescentar um momento de criação à aventura? Com a versão para colorir, a criança dá suas próprias cores à história. E, com a prioridade, o prazo de entrega passa de até 24 horas para até 2 horas.\n\nOs dois adicionais por R$ 13,00. Confira também a taxa de serviço e as condições no checkout. A compra é opcional: sua Historinha continua normalmente sem os adicionais.\n\nQuero colorir e receber mais rápido: {{checkout_url}}'},
 color:{subject:'A aventura da criança também pode ganhar suas próprias cores 🎨',button:'Quero colorir',body:'Olá, {{name}}! Que tal deixar a criança participar da criação da própria aventura? 🎨\n\nA versão para colorir acrescenta uma nova forma de brincar com a Historinha: escolher as cores e dar um toque pessoal à história.\n\nAdicione somente a versão para colorir por R$ 7,50. Confira taxas e condições no checkout. Sua prioridade já adquirida não será oferecida novamente.\n\nQuero a versão para colorir: {{checkout_url}}'},
 four:{subject:'Uma aventura é só o começo: conheça o combo de 4 historinhas',button:'Quero 4 histórias',body:'Olá, {{name}}! Uma nova história é uma nova oportunidade para imaginar, descobrir e criar momentos de leitura juntos. 📚\n\nQue tal ampliar as aventuras da criança com o combo de 4 historinhas por R$ 19,90? Conheça a oferta e seus detalhes no checkout. É uma compra adicional e opcional; sua primeira Historinha continua normalmente.\n\nQuero conhecer as 4 histórias: {{checkout_url}}'},
 mission:{subject:'Agora a família inteira pode entrar na aventura! 🗺️',button:'Quero Missão Família',body:'A criança já vai protagonizar uma história, {{name}}. Agora, a família inteira pode entrar na aventura! 🗺️✨\n\nNo Missão Família: A Grande Aventura, ela é a heroína de um jogo de cartas e tabuleiro — e vocês jogam todos no mesmo time.\n\nA missão é chegar ao baú do tesouro antes do Monstro da Bagunça. No caminho, a família cumpre desafios divertidos, tenta adivinhar as respostas da criança e usa poderes mágicos. No final, todos enfrentam juntos a Missão Final para abrir o baú.\n\nNinguém perde sozinho e ninguém fica de fora. Ou a família vence junta, ou pede revanche!\n\nMissão Família por R$ 19,90. Uma compra adicional e opcional para criar novas brincadeiras e lembranças juntos. Confira taxas e condições no checkout.\n\nQuero nossa aventura em família: {{checkout_url}}'}
};
function graph(channel,ids,models){
 const nodes=[],edges=[];let serial=0;
 const node=(type,label,config={})=>{const id='p'+serial++;nodes.push({id,type,position:{x:serial*200,y:0},data:{label,config}});return id};
 const edge=(source,target,sourceHandle)=>edges.push({id:'e'+edges.length,source,target,...(sourceHandle?{sourceHandle}:{})});
 const end=()=>node('end','Encerrar');
 const message=(key)=>node('message',key==='thanks'?'Parabéns · compra aprovada':copy[key].button,{channel,templateId:models[key],integrationId:channel==='email'?MAIL:WPP,...(key!=='thanks'?{promotionProductId:ids[key],buttonText:copy[key].button}:{}),...(key==='bundle'?{priorityOffer:true,excludePurchasedProductIds:[ids.priority,ids.color]}:{}),...(key==='four'?{excludePurchasedProductIds:[ids.priority,ids.color]}:{})});
 const wait=(seconds,label)=>node('wait',label,{seconds});
 const missionAfter=(from,seconds)=>{let previous=from;if(seconds){const w=wait(seconds,'Aguardar '+seconds/3600+'h');edge(previous,w);previous=w;}const m=message('mission');edge(previous,m);edge(m,end());};
 const start=node('trigger','Compra aprovada',{event:'payment.approved'}),channelNode=node('condition','Contato disponível',{kind:'channel_available',value:channel});edge(start,channelNode);edge(channelNode,end(),'no');const thanks=message('thanks');edge(channelNode,thanks,'yes');const pause=wait(600,'Aguardar 10 minutos');edge(thanks,pause);
 const priority=node('condition','Já comprou prioridade?',{kind:'product_purchased',productId:ids.priority});edge(pause,priority);
 const colorA=node('condition','Já comprou colorir?',{kind:'product_purchased',productId:ids.color});edge(priority,colorA,'yes');const fastA=wait(1,'Próxima oferta');edge(colorA,fastA,'yes');missionAfter(fastA,0);const color=message('color');edge(colorA,color,'no');missionAfter(color,86400);
 const colorB=node('condition','Já comprou colorir?',{kind:'product_purchased',productId:ids.color});edge(priority,colorB,'no');const fastB=wait(1,'Próxima oferta');edge(colorB,fastB,'yes');missionAfter(fastB,0);
 const bundle=message('bundle');edge(colorB,bundle,'no');const delay=wait(86400,'Aguardar 24 horas');edge(bundle,delay);const four=message('four');edge(delay,four);missionAfter(four,86400);
 return{schemaVersion:1,nodes,edges};
}
async function prepare(apply=false){
 if(!apply)return{mode:'preview',offers,channels:['whatsapp','email'],historicalReplay:false,messages:copy};
 if(process.env.TRAFFICAI_APPLY_POST_PURCHASE!=='20261021')throw Error('APPLY_NOT_AUTHORIZED');
 const [base]=await query('SELECT * FROM aw_products WHERE id=$1 AND source_id=$2',[BASE,SOURCE]);if(!base)throw Error('BASE_MAPPING_MISSING');
 const ids={four:FOUR};for(const[key,o]of Object.entries(offers)){let[p]=await query("SELECT * FROM aw_products WHERE user_id=$1 AND settings->>'post_purchase_key'=$2",[base.user_id,key]);if(!p)[p]=await query(`INSERT INTO aw_products(user_id,name,description,source_id,price,currency,checkout_url,platform,external_product_id,settings) VALUES($1,$2,$3,$4,$5,'BRL',$6,'ticto',$7,$8) RETURNING *`,[base.user_id,o.name,'Oferta pós-compra Historinha',SOURCE,o.price,o.url,o.external,JSON.stringify({post_purchase_key:key,purchase_offer_code:o.offer||null,lifecycle_enabled:false})]);else if(p.external_product_id!==o.external||p.checkout_url!==o.url)throw Error('EXISTING_PRODUCT_CHANGED');ids[key]=p.id;}
 const result=[];for(const channel of ['whatsapp','email']){const name='Historinha · Compra aprovada e escada · '+(channel==='email'?'E-mail':'WhatsApp');const [existing]=await query('SELECT * FROM aw_flows WHERE user_id=$1 AND name=$2',[base.user_id,name]);if(existing?.published_version)throw Error('FLOW_ALREADY_PUBLISHED');const models={};for(const[key,c]of Object.entries(copy)){const body=c.body+(key==='thanks'?'':'\n\nPara não receber mais ofertas: {{unsubscribe_url}}');const t=await saveTemplate(base.user_id,{name:name+' · '+key,channel,purpose:key==='thanks'?'transactional':'marketing',subject:c.subject,body,parameters:['name','checkout_url','unsubscribe_url'],blocks:channel==='email'?[...body.split('\n\n').map(text=>({type:'text',text})),...(c.button?[{type:'button',text:c.button,url:'{{checkout_url}}'}]:[])]:[]});models[key]=t.id;}
 const g=graph(channel,ids,models);if(graphIssues(g,true).length)throw Error('GRAPH_INVALID');const f=await saveFlow(base.user_id,{name,revision:existing?.revision,source_id:SOURCE,product_id:BASE,recovery:false,graph:g,settings:{post_purchase:true,default_whatsapp_connection_id:WPP,max_messages:5,time_zone:'America/Fortaleza',days:[0,1,2,3,4,5,6],allowed_start:9,allowed_end:19}},existing?.id);result.push({id:f.id,name,status:f.status});}
 return{mode:'drafts',flows:result,products:ids,historicalReplay:false};
}
module.exports={prepare,graph,offers,copy};
if(require.main===module)prepare(process.argv.includes('--apply')).then(x=>{console.log(JSON.stringify(x));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)});
