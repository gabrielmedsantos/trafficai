# Funis de Quiz

O módulo atende vários quizzes por fonte de tracking. Cada funil tem identificador, domínio, etapas, campos de resposta e marcos de conclusão/checkout próprios. Landing pages, pixel, UTMs e relatórios de vendas continuam nas rotas existentes.

## Configuração

1. Aplique `backend/src/database/migrations/083_quiz_sessions.sql` no banco do TrafficAI pelo procedimento de migrations existente, antes de ativar as novas rotas. Garanta que `ENCRYPTION_KEY` esteja configurada; use a chave existente e mantenha seu backup.
2. Compile e publique backend e frontend.
3. Abra **Vendas → Funis de Quiz**, selecione a fonte e clique **Novo quiz**. Para o produto atual, use **Modelo Mamãe, quero historinha**.
4. Configure o domínio HTTPS, o identificador e as etapas na ordem real. Os nomes dos campos precisam corresponder às propriedades enviadas pelo quiz.
5. Salve e selecione o funil. O painel mostra a configuração e o código de instalação. Para alterar a sequência de um funil que já recebeu respostas, use um novo identificador; isso preserva o significado dos dados históricos.

O domínio é por funil: vários quizzes podem usar a mesma fonte, em sites diferentes. `localhost` e `127.0.0.1` aceitam HTTP para desenvolvimento. A prévia `file://` não envia respostas. Não use token de login nem `ENCRYPTION_KEY` no frontend; `sourceToken` é o token público da fonte.

## Integração de qualquer quiz

```html
<script src="https://api.alfamaxdigital.com.br/api/v1/track/quiz/sdk.js"></script>
<script>
const quiz = TrafficAIQuiz.create({
  apiBase: 'https://api.alfamaxdigital.com.br/api/v1',
  sourceToken: 'TOKEN_PUBLICO_DA_FONTE',
  funnelId: 'identificador-do-quiz'
});
const respostas = quiz.restored || {};
quiz.record('inicio', 'view', respostas);

// No botão Continuar, depois da validação:
function avancar(respostaValidada) {
  respostas.resposta1 = respostaValidada;
  quiz.record('pergunta1', 'complete', respostas);
  quiz.record('oferta', 'view', respostas);
  // Mostre a próxima tela do quiz aqui.
}
// Para atualizar uma resposta sem avançar:
// quiz.record('pergunta1', 'save', respostas);
</script>
```

`view` registra a tela exibida; `complete` registra um avanço validado; `save` atualiza o rascunho. Cada chamada envia o conjunto atual de respostas. Aceita textos, booleanos, números finitos e listas de textos, somente nos campos configurados. Nunca envie senhas ou dados de cartão. Use `quiz.restored` para preencher a interface quando o visitante atualizar a página.

O SDK serializa os envios, mantém uma fila em sessionStorage e tenta novamente após falhas de rede. Eventos têm IDs para deduplicação e revisões para evitar que um envio atrasado sobrescreva respostas mais recentes. A fila é limitada à sessão do navegador e expira localmente depois de 24h sem atualização. Não espere o envio para animar a próxima tela. Desabilite a captura nas ferramentas de prévia/editor do seu quiz.

## Mamãe, quero historinha

O quiz já contém as chamadas por etapa, respostas de personalização, contato, perguntas durante a preparação, desconto e adicionais. Preencha seu `config.js` com os dados do painel e gere novamente o HTML com `node scripts/build.mjs`. O token fica vazio na prévia entregue, pois ainda é necessário cadastrar sua fonte/domínio no ambiente publicado.

## Checkout e geração do livro

`quiz.checkoutParams()` devolve UTMs, `sck` e `quiz_session_id`. Acrescente esses parâmetros ao link de checkout, preservando os que já existirem. Ele não inclui respostas nem a chave de escrita da sessão.

Até a integração específica com a plataforma de pagamento, associe um pedido real pelo campo **Vincular pedido** no detalhe da sessão. A API verifica que pedido e quiz pertencem à mesma fonte. Os relatórios leem o status atual de `tracking_orders`; reembolso/chargeback deixam de contar como pagamento aprovado. Um evento do navegador nunca confirma pagamento.

Quando a plataforma for escolhida, o webhook deverá usar `quiz_session_id` para associar o pedido automaticamente e disparar a geração somente após aprovação confirmada. O endpoint autenticado de detalhe já fornece as respostas para esse processamento. Esta entrega armazena os dados; não gera PDF, envia livro ou processa cobrança.

## Dados e verificações

Respostas são criptografadas em repouso com AES-256-GCM. Só o painel autenticado da conta proprietária lê as respostas; não existe endpoint público de leitura. A ingestão exige domínio cadastrado e chave de escrita aleatória por sessão. UTMs têm uma lista permitida separada. Respostas não passam pelo Meta CAPI. Configure retenção e exclusão conforme a política do produto antes de operar com clientes reais.

Backend: `npm test` executa build TypeScript e testes HTTP com PostgreSQL embarcado (PGlite), sem tocar no banco da VPS. Frontend: `npm run build`; lint da página: `npx eslint src/app/vendas/quizzes/page.tsx`.
