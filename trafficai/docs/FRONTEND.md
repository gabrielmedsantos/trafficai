# Frontend

Next.js 16 com App Router, TypeScript estrito e componentes client-side primariamente (`'use client'` no topo das páginas).

## Layout

```
frontend/src/
├── app/
│   ├── layout.tsx           — shell global (fontes, theme, container)
│   ├── Providers.tsx        — React context providers (auth, account)
│   ├── AccountContext.tsx   — account selecionada (persistida em localStorage)
│   ├── page.tsx             — landing / redirecionamento
│   ├── dashboard/           — KPIs, charts, alertas recentes
│   ├── campaigns/           — lista e detalhe de campanhas
│   ├── insights/            — deep dive em métricas
│   ├── alerts/              — lista e gerenciamento
│   ├── predictions/         — projeções
│   ├── reports/             — gerar/listar/enviar relatórios
│   ├── report/[token]/      — relatório público
│   ├── creative/            — análise de criativos via IA
│   ├── otimizacoes/         — sugestões de otimização
│   ├── rotina/              — rotina diária do gestor
│   ├── agent/               — chat com agente IA
│   ├── clientes/            — ficha de clientes
│   ├── financeiro/          — cobrança, contratos, receitas
│   ├── team/                — equipe (multi-user)
│   ├── accounts/            — contas Meta (seleção, ativar/inativar)
│   ├── settings/            — config de notificações, IA, Meta
│   └── globals.css          — tokens de design (CSS vars)
├── components/
│   ├── Sidebar.tsx          — navegação lateral
│   └── AccountSelect.tsx    — seletor de conta (header)
└── lib/
    └── api.ts               — cliente HTTP único
```

## Autenticação no cliente

- Token JWT salvo em `localStorage.trafficai_token`
- `api.ts` anexa `Authorization: Bearer {token}` automaticamente
- Redirect para login é responsabilidade de cada página (ou middleware global em `layout.tsx`)

## AccountContext

Arquivo: `app/AccountContext.tsx`

Provê `selectedAccountId` e `setSelectedAccountId`. A lista de contas ativas é carregada uma vez e a seleção é persistida.

Usada em dashboard, insights, relatórios — todos filtram pelo `selectedAccountId`.

## Design tokens (globals.css)

Paleta escura, roxo/azul como primária Alfamax:

```
--primary: #6366f1 (indigo)
--accent:  #8b5cf6 (violeta)
--bg:      #0f172a (slate 900)
--bg-card: #141928
--bg-input:#1a2234
--border:  #1e2744
--text:    #eef2ff
--text-muted: #64748b
--accent-green: #10b981
```

Classes utilitárias em `globals.css`:
- `.card`, `.stats-grid`, `.page-header`, `.table-container`
- `.btn btn-primary`, `.btn btn-secondary`
- `.badge`, `.badge-green`, `.badge-gray`
- `.fade-in`, `.skeleton` (loading)

## Charts

Biblioteca: **Recharts**

Dois tipos no dashboard:
- `AreaChart` — trend linha de gasto diário
- `BarChart` — dupla barra (ex: Cliques + Conversões)

Tooltip customizado com fundo escuro.

## Construção de produção

```bash
npm run build
# Next gera .next/standalone com server.js
```

O Docker usa `output: 'standalone'` em `next.config.ts`, o que minimiza a imagem: só o runtime Node + o código compilado.

## Páginas críticas para o "bug do Matheus"

- `app/dashboard/page.tsx` — antes pegava só 10 campanhas (`.slice(0, 10)`). **Corrigido.** Agora pega todas em lotes paralelos de 8.
- `lib/api.ts` — `getInsights(..., limit = 30)` → agora limit padrão 10000. Sem recortar.

## Conexão com backend

```ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
```

`NEXT_PUBLIC_API_URL` é injetada em build time via `ARG` no Dockerfile. Em prod: `https://api.alfamaxdigital.com.br/api/v1`.

## Boas práticas ao adicionar página nova

1. Criar pasta `app/nova-rota/page.tsx`
2. Usar `'use client'` se precisar de `useState`/efeitos
3. Importar `api` do `lib/api.ts` — **nunca** `fetch` direto
4. Reusar classes de `globals.css` em vez de estilo inline novo
5. Adicionar link no `components/Sidebar.tsx`
