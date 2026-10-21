# Padrão TrafficAI para páginas, quizzes e checkouts

## O que é automático

O pixel passa a compartilhar o mesmo módulo de atribuição do SDK de quiz. Instale o pixel da mesma fonte em todas as páginas do percurso. Ele guarda apenas as cinco UTMs e os identificadores fbclid/gclid/wbraid/gbraid, mantém a sessão e decora links de navegação e links de checkout reconhecidos. As respostas ficam no transporte separado do quiz; não passam ao CAPI.

Sites em domínios diferentes precisam dos parâmetros na URL. Links externos de navegação devem ser explicitamente marcados `data-tai-link`. Checkouts em domínio próprio ou fora da lista devem ser marcados `data-tai-checkout`. Links `download`, âncoras locais e `data-tai-ignore` não são decorados. Não há leitura automática de formulários nem identificação automática de respostas: o site chama `record` após validar a resposta.

A lista de domínios reconhecidos cobre Kiwify, Hotmart, Eduzz, Monetizze, Cakto, Hub.la, PerfectPay, Braip, Ticto, Greenn, Payt, PushinPay, Zouti e Cooud. Reconhecer um link não equivale a ter adaptador de webhook para a plataforma.

## Páginas de vendas

```html
<script async src="https://api.alfamaxdigital.com.br/api/v1/track/pixel/TOKEN_PUBLICO.js"></script>
<a href="https://checkout.exemplo.com/comprar" data-tai-checkout>Comprar</a>
<a href="https://outro-dominio.exemplo.com/oferta" data-tai-link>Ver oferta</a>
```

Para redirecionamento controlado por JavaScript, use `TrafficAI.checkoutUrl(url)` depois que o pixel estiver carregado. Não concatene strings com `?` manualmente. A função preserva os parâmetros já definidos no destino, para não sobrescrever afiliação ou roteamento do checkout.

Em páginas sem pixel, é possível usar somente atribuição:

```html
<script src="https://api.alfamaxdigital.com.br/api/v1/track/quiz/sdk.js"></script>
<script>
const pagina = TrafficAIQuiz.page({sourceToken:'TOKEN_PUBLICO'});
// pagina.decorate(url), pagina.diagnose()
</script>
```

## Novo quiz

1. Cadastre a fonte e o funil em Vendas → Funis de Quiz. Defina origem HTTPS, etapas e campos permitidos. Não existe criação automática de funis por visitantes anônimos.
2. Use o modelo genérico fornecido pelo painel. Registre a etapa depois da validação, usando IDs e campos iguais aos cadastrados.
3. Marque o botão de checkout ou chame `decorateUrl` no redirecionamento. O SDK decora os links HTML conhecidos e os marcados automaticamente.

```html
<script src="https://api.alfamaxdigital.com.br/api/v1/track/quiz/sdk.js"></script>
<script>
const quiz = TrafficAIQuiz.createStandard({
  apiBase:'https://api.alfamaxdigital.com.br/api/v1',
  sourceToken:'TOKEN_PUBLICO',
  funnelId:'meu-quiz',
  answerKeys:['objetivo'],
  includePersonalData:false
});
const respostas=quiz.restored||{};
quiz.record('inicio','view',respostas);
// Depois que a pessoa respondeu e a interface validou:
function responder(valor){
  respostas.objetivo=valor;
  quiz.record('pergunta1','complete',respostas);
  quiz.record('oferta','view',respostas);
}
async function irParaOferta(){
  // Aguardar a fila é opcional: não prenda a navegação por falha de tracking.
  await Promise.race([quiz.flush(),new Promise(r=>setTimeout(r,1200))]);
  location.href=quiz.decorateUrl('https://site.exemplo.com/oferta');
}
</script>
```

`createStandard` aceita somente os campos de `answerKeys` e remove campos conhecidos de nome, telefone e e-mail por padrão, inclusive de rascunhos locais antigos. Para coletar contato é necessária configuração explícita com `includePersonalData:true` e campos cadastrados. Senhas, CPF e dados de cartão não são aceitos pelo modelo padrão. Isso não substitui a responsabilidade de não colocar dados pessoais em campos com nomes genéricos. O bloqueio também impede a captura automática de formulários pelo pixel enquanto esse quiz padrão está ativo. Contatos de checkout continuam sendo tratados pelo adaptador de pedidos conforme o dado que a plataforma entrega.

`TrafficAIQuiz.create` continua disponível para compatibilidade com integrações existentes. Não altera os campos coletados por quizzes antigos. A migração exige trocar para `createStandard` e informar os campos permitidos. URLs usam só UTMs e identificadores opacos: nunca respostas, nomes, telefones, chave de escrita do quiz ou credenciais.

## Contrato de atribuição de pedidos

Para ligar uma venda a uma sessão o checkout precisa devolver `quiz_session_id` (ou `s1`) ou `sck`. O servidor só liga uma sessão exata da mesma fonte. Não faz correspondência por nome, valor ou horário.

Os adaptadores existentes continuam responsáveis por status e unidade monetária de cada provedor. A normalização compartilhada reconhece os campos de atribuição em `tracking`, `TrackingParameters`, `metadata`, `utm`, `url_params.query_params`, `data` e no nível principal. Ela não substitui valores específicos já normalizados pelo adaptador.

Uma plataforma sem adaptador pode usar um intermediário próprio que transforme seu webhook no contrato abaixo. `value` é em reais neste contrato; o webhook nativo da PushinPay usa centavos e é convertido pelo adaptador específico.

```json
{
  "event":"order",
  "platform":"meu-checkout",
  "order_id":"identificador-unico-real",
  "status":"approved",
  "value":9.90,
  "currency":"BRL",
  "payment_method":"pix",
  "tracking":{
    "quiz_session_id":"UUID_DA_SESSAO",
    "sck":"UUID_DA_NAVEGACAO",
    "utm_campaign":"Campanha|ID_NUMERICO"
  }
}
```

A autenticação do webhook existente continua obrigatória. A chave fica na integração servidor-servidor, nunca no script público. Somente um webhook autenticado com status aprovado gera compra; cliques e respostas não confirmam pagamento. Os IDs determinísticos do pedido/evento preservam a deduplicação existente.

## Diagnóstico e teste

- Na página: `TrafficAI.integrationStatus()` retorna nomes dos parâmetros presentes, sem valores pessoais ou IDs completos.
- No quiz padrão: `quiz.status()` informa fila pendente, criação da sessão, último erro de transporte e o diagnóstico da atribuição.
- Na central de diagnóstico: novos pedidos dos adaptadores compartilhados geram um aviso `SESSION_ID_MISSING` quando chegam sem sessão. O aviso não impede que a venda seja registrada. Não significa que o checkout perdeu os dados: pode ser uma compra que não passou pelo quiz.
- `webhookVerified:false` no diagnóstico local é intencional: JavaScript no navegador não pode provar que o webhook devolveu os parâmetros.

Teste com UTMs conhecidas, conclua o quiz e inspecione o URL de checkout sem pagar. Depois valide um webhook em ambiente de teste. Para venda real, confirme recebimento, valor/status, vínculo da sessão e status do envio à Meta. Não marque uma plataforma como totalmente compatível apenas porque o URL contém UTMs. A PushinPay ainda exige validação do retorno dos identificadores no webhook real.

## Limites

Páginas sem script, redirecionamentos de terceiros que descartam parâmetros, iframes de outro domínio, links montados exclusivamente em JavaScript sem usar a API e plataformas que não devolvem rastreamento precisam de integração explícita. Essa implementação não promete identificação universal em qualquer plataforma.

Nenhuma migration, alteração de pedidos históricos ou mensagem é necessária para publicar este padrão. Backup dos fontes antes da alteração, build/testes e autorização para reiniciar backend/frontend continuam obrigatórios.
