// Conteúdo adaptado da biblioteca PADRÃO: W0–W5 e E0–E6.
const SOURCE='fb8d4d3b-2603-4c55-8655-51ca086f3091';
const WPP='eace897e-6392-4fd7-a7fb-413f8e7a6f3d',MAIL='9f42c852-f0df-4e1e-b023-29095941aebd';
const configs=[
 {key:'historinha',label:'Historinha',source:'bcad48f8-de1f-4501-8dea-4810dc3b248d',external:'121023',price:9.90,sales:'https://historinha.alfamaxdigital.com.br/',checkout:'https://payment.ticto.app/OD9CA0E4C',offers:{OD9CA0E4C:'https://payment.ticto.app/OD9CA0E4C',O97B9CEC1:'https://payment.ticto.app/O97B9CEC1'}},
 {key:'clube-pedagogia',label:'Clube da Pedagogia',source:SOURCE,external:'121790',price:10,sales:'https://pedagogia.alfamaxdigital.com.br/',checkout:'https://payment.ticto.app/OAF7221C7',offers:{OAF7221C7:'https://payment.ticto.app/OAF7221C7',O8B0DAEB8:'https://payment.ticto.app/O8B0DAEB8',O08E7DA50:'https://payment.ticto.app/O08E7DA50'}}
];
const copy={
 historinha:{
 order:[
 ['Faltou concluir o pedido da sua historinha','Seu pedido de {{product}} ainda não foi concluído. Ficou alguma dúvida sobre o pagamento? Confira as condições disponíveis e continue por aqui:'],
 ['Uma aventura com o nome da sua criança','Na Historinha, o nome e as características da criança fazem parte da personalização. A proposta é transformar a leitura em uma aventura da qual ela participa. Quer continuar seu pedido?'],
 ['O que você recebe na Historinha','Você está adquirindo um livro digital personalizado. Não é um livro físico enviado pelos Correios. Confira os detalhes e as condições da oferta antes de finalizar:'],
 ['Dúvida sobre a personalização?','Não sabe como preencher algum detalhe da criança ou qual opção escolher? Responda esta mensagem e conte onde parou. Para retomar o pedido:'],
 ['Vamos conferir seu pagamento?','Se houve dificuldade ao pagar, confira as opções disponíveis no checkout. Se você já pagou e ainda precisa de ajuda, fale com o atendimento antes de tentar outra compra:'],
 ['Ainda quer criar essa lembrança?','Se a ideia de ler uma história personalizada com sua criança combina com o que você procura, você pode continuar pelo link. Se preferir esclarecer uma dúvida primeiro, responda por aqui:'],
 ['Último lembrete sobre a sua historinha','Este é o último lembrete desta sequência sobre {{product}}. Se ainda quiser concluir, confira o pedido pelo link. Se este não for o momento, tudo bem:']
 ],
 quiz:[
 ['Vamos continuar a personalização?','Você começou a personalização da Historinha e autorizou nosso contato. Ficou alguma dúvida no caminho? Para voltar ao quiz e conferir suas opções:'],
 ['A criança faz parte da aventura','O livro pode ser personalizado com o nome e as características da criança. Você escolhe as opções no quiz, passo a passo. Quer continuar?'],
 ['Qual detalhe falta na sua historinha?','Se travou na escolha das características ou do cenário, responda esta mensagem. Podemos ajudar você a entender as opções. Para voltar à personalização:'],
 ['Uma leitura para compartilhar com sua criança','A proposta é criar uma aventura personalizada para vocês lerem juntos. O produto é digital; confira o conteúdo e as condições ao terminar o quiz:'],
 ['Você pode conferir tudo antes de comprar','Concluir o quiz não obriga você a comprar. Continue a personalização, veja as opções apresentadas e decida com clareza:'],
 ['Quer ajuda para continuar?','Se ainda tiver interesse na Historinha, volte pelo link ou responda com sua dúvida. Se não for a hora, tudo bem:'],
 ['Último convite para continuar o quiz','Este é o último lembrete desta sequência. Se quiser continuar a personalização da sua historinha, acesse o quiz. Obrigado pelo interesse:']
 ]},
 'clube-pedagogia':{order:[
 ['Faltou concluir seu acesso ao Clube da Pedagogia','Seu pedido de {{product}} ainda não foi concluído. Ficou alguma dúvida sobre o conteúdo ou o pagamento? Confira a oferta que você escolheu e continue por aqui:'],
 ['Materiais educativos sem começar do zero','O Clube da Pedagogia reúne mais de 37 mil materiais digitais, incluindo atividades de alfabetização, matemática e jogos educativos. Confira o conteúdo do seu plano antes de concluir:'],
 ['Como funciona a licença de revenda?','Os planos incluem licença de revenda conforme o termo entregue com o acesso. Você pode organizar seus próprios kits para oferecer a professores, escolas e famílias, respeitando essas condições. Quer tirar alguma dúvida?'],
 ['Básico ou Premium: confira seu plano','O Básico dá acesso ao acervo com licença de revenda. O Premium acrescenta kits prontos, atualizações, suporte pelo WhatsApp e os três bônus apresentados na oferta. O link mantém a oferta identificada no seu pedido:'],
 ['É um produto digital, sem frete','Os materiais são digitais. Não há envio de peças físicas ou estoque de impressos. Você organiza o uso e a divulgação conforme a licença; resultados de vendas dependem do seu trabalho e não são garantidos. Confira os detalhes:'],
 ['O que falta para você decidir?','Se a dúvida é sobre os arquivos, a licença ou o acesso, responda esta mensagem. Se for sobre pagamento, confira as opções no checkout. Se já pagou, fale com o atendimento antes de tentar outra compra:'],
 ['Último lembrete sobre o Clube da Pedagogia','Este é o último lembrete desta sequência. Se os materiais combinam com seu objetivo, confira as condições e continue seu pedido. Se este não for o momento, tudo bem:']
 ]}
};
function plans(){
 const result=[];
 for(const product of configs)for(const journey of product.key==='historinha'?['order','quiz']:['order'])for(const channel of ['whatsapp','email']){
  const entries=copy[product.key][journey];
  const indexes=channel==='email'?[0,1,2,3,4,5,6]:[0,1,2,3,4,6];
  const suffix=channel==='email'?'E-mail':'WhatsApp';
  const name=`${product.label} · ${journey==='quiz'?'Quiz interrompido':'Recuperação de compra'} · ${suffix}`;
  result.push({product,journey,channel,name,event:journey==='quiz'?'quiz.abandoned':'checkout.recovery',integrationId:channel==='email'?MAIL:WPP,
   delays:channel==='email'?[10800,86400,86400,86400,86400,86400,86400]:[3600,82800,86400,172800,86400,172800],
   messages:indexes.map((index,n)=>({name:`${name} · ${n+1}`,subject:channel==='email'?entries[index][0]:'',body:`Olá, {{name}}!\n\n${entries[index][1]}\n\n{{checkout_url}}\n\nPara não receber mais mensagens desta jornada: {{unsubscribe_url}}`}))});
 }
 return result;
}
function graph(plan,ids){
 const nodes=[{id:'start',type:'trigger',position:{x:0,y:0},data:{label:plan.journey==='quiz'?'Quiz interrompido':'Compra não concluída',config:{event:plan.event}}},{id:'contact',type:'condition',position:{x:220,y:0},data:{label:'Contato disponível no canal',config:{kind:'channel_available',value:plan.channel}}},{id:'no-contact',type:'end',position:{x:440,y:250},data:{label:'Sem contato neste canal',config:{}}}];
 const edges=[{id:'start',source:'start',target:'contact'},{id:'no',source:'contact',target:'no-contact',sourceHandle:'no'},{id:'yes',source:'contact',target:'wait0',sourceHandle:'yes'}];
 plan.messages.forEach((_,n)=>{
  nodes.push({id:'wait'+n,type:'wait',position:{x:440+n*440,y:0},data:{label:'Aguardar '+plan.delays[n]/3600+'h',config:{seconds:plan.delays[n]}}},{id:'message'+n,type:'message',position:{x:660+n*440,y:0},data:{label:'Contato '+(n+1),config:{channel:plan.channel,templateId:ids[n],integrationId:plan.integrationId,buttonText:plan.journey==='quiz'?'Continuar personalização':'Continuar meu pedido'}}});
  edges.push({id:'send'+n,source:'wait'+n,target:'message'+n},{id:'next'+n,source:'message'+n,target:n===plan.messages.length-1?'end':'wait'+(n+1)});
 });
 nodes.push({id:'end',type:'end',position:{x:440+plan.messages.length*440,y:0},data:{label:'Encerrar',config:{}}});
 return{schemaVersion:1,nodes,edges};
}
module.exports={configs,plans,graph,SOURCE,WPP,MAIL};
