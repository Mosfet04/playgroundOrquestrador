# Playground do Orquestrador

> **[English version below](#english-version)**

Interface web para o [Orquestrador IA Python Agno](https://github.com/Mosfet04/orquestradorIAPythonArgo): configura agentes e tools HTTP, testa no chat e mostra métricas de uso.

> **Baseado no [agno-agi Agent UI](https://github.com/agno-agi/agent-ui)**, adaptado para o orquestrador.

![Interface do playground](https://github.com/user-attachments/assets/7765fae5-a813-46cb-993b-904af9bc1672)

## O que tem hoje

- **Playground de chat** (`/playground`): conversa com agents e teams do orquestrador, com streaming, tool calls (tempo e erro de cada uma), tempo e tokens de cada resposta, histórico de sessões (formato `chat_history` do Agno 2.5 e o legado) e mídia (imagem, áudio, vídeo).
- **Agentes** (`/agents`, `/agents/new`, `/agents/<id>`): criar, editar, excluir, buscar e filtrar; modelo, prompt, tools associadas e RAG.
- **Tools HTTP** (`/tools`, `/tools/new`, `/tools/<id>`): método, URL, endpoint, headers e parâmetros.
- **Dashboard** (`/dashboard`): agentes ativos, pico diário de usuários, sessões de agent e de team, tokens, modelos e atividade por dia, com filtro de período (Hoje, 7, 30 e 90 dias, em dias UTC).
- **Primeiros passos** (`/`): guia com atalhos para criar agente, tool e testar.
- Cada seção tem endereço próprio (favoritar, nova aba, voltar do navegador); tema claro/escuro; pt-BR e EN.
- **Login** (`/login`): o playground inteiro (páginas e `/api/*`) só abre com sessão, de um usuário único configurado no servidor. A sessão dura 12 h, sem renovação; "Sair" fica no fim da navegação (no celular, no rodapé do menu).
- Estados de carregando, vazio e erro em todas as telas: com o orquestrador ou o MongoDB fora, a tela mostra o erro com "Tentar de novo", e um endereço inexistente mostra o 404 dentro do app.

## Como funciona hoje

```mermaid
graph LR
    B[Navegador] -->|gestão: /api/agents, /api/tools| N[Next.js API Routes]
    N --> M[(MongoDB do orquestrador)]
    B -->|dashboard: /api/dashboard| N
    N -->|/metrics, /admin/config/agents| O
    B -->|chat: /agents, /teams, /sessions, runs| O[Orquestrador / AgentOS]
    O --> M
```

- **Dashboard**: `/api/dashboard/stats` chama o `GET /metrics` (agregados por dia, em UTC) e o `GET /admin/config/agents` do orquestrador com a chave admin, sem Mongo. Como o `GET /metrics` só lê agregados prontos, o BFF pede antes o recálculo (`POST /metrics/refresh`), no máximo 1 vez por minuto por processo; se o refresh falhar, a leitura segue com o que houver. Sessões, tokens e modelos somam os dias do período; "Máx. usuários/dia" é o pico diário (o orquestrador não conta usuários únicos no período). O consumo de tokens por agente ou team espera as métricas por agente do orquestrador (F8).
- **Gestão** (agentes e tools): as rotas `src/app/api/**` leem e gravam direto no MongoDB do orquestrador, com validação zod na entrada.
- **Chat**: o navegador só fala com o playground. As rotas `src/app/api/playground/**` (BFF) chamam o AgentOS do orquestrador em `ORCHESTRATOR_URL`, com a chave run (excluir sessão usa a admin), e repassam o stream do run sem buffer. O `user_id` das sessões é o usuário do login. Não há endpoint no painel: a URL e as chaves ficam só no servidor.
- **Quando a mudança vale**: o orquestrador monta agentes e tools ao iniciar. O que você cria ou edita aqui fica gravado no MongoDB e passa a valer no chat **depois de reiniciar o orquestrador**. A aplicação a quente pela API Admin do orquestrador é o plano das fases P2–P4 ([roadmap](docs/roadmap/README.md)).

## Dados no MongoDB

#### `agents_config`
```json
{
  "id": "assistant-general",
  "nome": "Assistente Geral",
  "model": "llama3.2:latest",
  "factoryIaModel": "ollama",
  "descricao": "Assistente para tarefas gerais",
  "prompt": "Você é um assistente útil...",
  "active": true,
  "tools_ids": ["weather-api"],
  "rag_config": {
    "active": true,
    "doc_name": "knowledge_base",
    "model": "text-embedding-3-small",
    "factoryIaModel": "openai"
  },
  "created_at": "2025-08-17T10:00:00.000Z",
  "updated_at": "2025-08-17T10:00:00.000Z"
}
```

#### `tools`
```json
{
  "id": "weather-api",
  "name": "Weather API",
  "description": "Obtém informações meteorológicas",
  "http_config": {
    "base_url": "https://api.openweathermap.org",
    "method": "GET",
    "endpoint": "/data/2.5/weather",
    "headers": { "API-Key": "<valor-do-header>" },
    "parameters": [
      { "name": "q", "type": "string", "description": "Nome da cidade", "required": true },
      { "name": "units", "type": "string", "description": "Unidade de temperatura", "required": false }
    ]
  },
  "created_at": "2025-08-17T10:00:00.000Z",
  "updated_at": "2025-08-17T10:00:00.000Z"
}
```

Tipos de parâmetro aceitos (os do orquestrador): `string`, `integer`, `float`, `boolean`, `object`, `array`. A `description` da tool e de cada parâmetro é obrigatória.

> **Atenção:** o valor dos headers fica em texto no MongoDB e aparece no editor da tool. Até a referência a segredo (`env:`/`file:`) chegar (P2+), não guarde ali uma chave que não possa ser lida por quem acessa o banco ou o playground.

#### `agno_sessions` e `agno_memories`
Sessões (agents e teams) e memórias de usuário do Agno. Até a v2.4 se chamavam `storage` e `user_memories`.

## Início rápido

**Pré-requisitos:** Node.js 22.18+ ou 24+, pnpm 10.33.0 (só pnpm) e o orquestrador rodando com o MongoDB dele ([README do orquestrador](https://github.com/Mosfet04/orquestradorIAPythonArgo)).

```bash
git clone <este-repositorio>
cd playgroundOrquestrador
pnpm install
```

Crie o `.env.local` com as variáveis abaixo.

### Variáveis de ambiente

| Variável | O que é |
|---|---|
| `MONGO_CONNECTION_STRING`, `MONGO_DATABASE_NAME` | o mesmo MongoDB do orquestrador (`src/lib/mongodb.ts`; também no build) |
| `ORCHESTRATOR_URL` | URL do orquestrador, `http(s)://` (ex.: `http://localhost:7777`) |
| `ORCHESTRATOR_API_KEY_RUN`, `ORCHESTRATOR_API_KEY_ADMIN` | as chaves `API_KEY_RUN` e `API_KEY_ADMIN` do orquestrador |
| `SESSION_SECRET` | segredo que assina o cookie de sessão, com 32 caracteres ou mais (ex.: `openssl rand -base64 48`) |
| `AUTH_USERNAME` | usuário do login |
| `AUTH_PASSWORD_HASH` | hash scrypt da senha do login, gerado por `pnpm auth:hash` (nunca a senha em claro) |

As variáveis do servidor (todas menos `MONGO_*`) são validadas em `src/server/env.ts` e só existem no servidor: o navegador nunca as recebe. Faltando alguma, o servidor recusa as requisições e o log cita só o nome da variável, nunca o valor (no `pnpm dev`, ao subir; no `pnpm start`, a partir da 1ª requisição, que é quando o Next roda o `src/instrumentation.ts`). A URL e as chaves do orquestrador são usadas só pelo cliente do servidor (`src/server/orchestrator/`): health, o chat (`/api/playground/*`) e o dashboard (`/api/dashboard/*`).

Para gerar o hash, passe a senha pelo stdin (não fica no histórico do shell):

```bash
read -rs PW && printf '%s' "$PW" | pnpm -s auth:hash; unset PW
# scrypt:<sal>:<hash> -> valor de AUTH_PASSWORD_HASH
```

```env
MONGO_CONNECTION_STRING=mongodb://localhost:27017
MONGO_DATABASE_NAME=agno
ORCHESTRATOR_URL=http://localhost:7777
ORCHESTRATOR_API_KEY_RUN=<API_KEY_RUN do orquestrador>
ORCHESTRATOR_API_KEY_ADMIN=<API_KEY_ADMIN do orquestrador>
SESSION_SECRET=<segredo aleatório de 32+ caracteres>
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH=<saída do pnpm auth:hash>
```

O login aceita 5 tentativas por IP a cada 15 min (a 6ª recebe 429; entrar com a senha certa zera a contagem). O contador fica na memória do processo: vale para uma réplica só e zera ao reiniciar. O IP é o último do `X-Forwarded-For`: **sirva o playground atrás de um proxy que grave ou acrescente esse header** (nginx, Caddy, o balanceador da nuvem). Sem ele, o cliente escolhe o valor e o limite por IP não se sustenta.

A sessão é só o cookie assinado com `SESSION_SECRET`: não há revogação no servidor. Trocar o `SESSION_SECRET` derruba todas as sessões abertas (todos entram de novo).

```bash
pnpm dev          # http://localhost:3000
```

O `/playground` usa o orquestrador de `ORCHESTRATOR_URL`; para trocar, mude a variável e reinicie o playground.

**Dados de exemplo (opcional):** os scripts são do `mongosh` e usam o banco `agno`.

```bash
mongosh "mongodb://localhost:27017" sample-data.js          # 3 agentes e 4 tools de exemplo
mongosh "mongodb://localhost:27017" cleanup-sample-data.js  # remove os exemplos
```

**Produção:** `pnpm build` e `pnpm start` (as variáveis `MONGO_*` precisam existir também no build; as do servidor, só no `start`). Sirva por HTTPS: fora do `pnpm dev` o cookie de sessão é `Secure`. O repositório não tem Dockerfile.

## Como usar

1. Em **Tools → Nova tool**, cadastre a chamada HTTP. Exemplo: ID `weather-api`, método `GET`, URL base `https://api.openweathermap.org`, endpoint `/data/2.5/weather`, header `API-Key` (o valor fica em texto no MongoDB, ver o aviso em "Dados no MongoDB"), parâmetros `q` (string, obrigatório) e `units` (string, opcional).
2. Em **Agentes → Novo agente**, escolha provedor e modelo (ex.: Ollama, `llama3.2:latest`), escreva o prompt, marque as tools e, se quiser, ligue o RAG.
3. Reinicie o orquestrador para ele carregar o que mudou.
4. No **Playground**, escolha o agente e converse.

**Provedores no formulário de agente:** Ollama, OpenAI, Anthropic, Google Gemini, Groq e Azure OpenAI; no RAG: Ollama, OpenAI, Google Gemini e Azure OpenAI. As chaves dos provedores ficam no orquestrador, não aqui. Para oferecer outro provedor, inclua-o em `modelProviders` ou `ragProviders` (`src/components/management/agents/AgentForm.tsx`), com um valor que o orquestrador aceite.

## Interface

- **Cores e tema:** só tokens do Design System (`docs/design/design-system.md`): canais HSL em `src/app/globals.css` (`:root` = claro, `.dark` = escuro), mapeados no `tailwind.config.ts` (`bg-background`, `text-foreground`, `bg-primary`…). Nada de hex nem paleta crua do Tailwind nos componentes. O tema (Claro, Escuro ou Sistema, padrão Sistema) vem do `next-themes`, no botão do cabeçalho (no celular, também no rodapé do menu), e fica no `localStorage` (`theme`).
- **Idioma:** pt-BR (padrão) e EN com `next-intl`. Os textos ficam em `messages/pt-BR.json` e `messages/en.json` (mesmas chaves, conferido por `tests/i18n/catalogs.test.ts`); em `src/app`, `src/components/{layout,management,playground}`, `src/hooks` e `src/store.ts` o lint recusa texto literal em JSX, nos atributos e props de texto (`aria-label`, `title`, `label`, `description`…) e em `toast.*()`. O idioma é escolhido no botão `PT`/`EN` do cabeçalho (no celular, na linha "Idioma" do menu), fica no cookie `locale` e não entra na URL; sem cookie, abre em pt-BR. Trocar de idioma não recarrega a página nem perde a conversa. O conteúdo gerado pelos agentes não é traduzido.

## Desenvolvimento

**Stack:** Next.js 15 (App Router) + React 18 + TypeScript, Tailwind + shadcn/ui (Radix), zustand (sessão do chat), nuqs (estado na URL), next-intl, react-hook-form, zod (validação nas rotas da API), recharts.

```
src/
├── app/
│   ├── api/                 # rotas da API (agents, tools, dashboard, auth), validação zod
│   ├── login/               # tela de login (fora da casca)
│   └── (app)/               # rotas com a casca (navegação + cabeçalho): /, /playground,
│                            # /agents[/new|/<id>], /tools[/new|/<id>], /dashboard;
│                            # error.tsx, not-found.tsx e o catch-all do 404
├── components/
│   ├── layout/              # casca, navegação, cabeçalho, tema e idioma
│   ├── management/          # agentes, tools, dashboard e primeiros passos
│   ├── playground/          # chat e painel de sessões
│   └── ui/                  # componentes base (shadcn) e estados (loading.tsx)
├── hooks/                   # stream do chat, sessões, ações do playground
├── i18n/                    # next-intl: idioma pelo cookie (request.ts)
├── lib/                     # utilitários (mongodb.ts, utils.ts...)
├── server/                  # só servidor ('server-only'): env validado, sessão, senha, rate limit,
│                            # cliente do orquestrador (orchestrator/)
├── middleware.ts            # sessão obrigatória em páginas e /api/*, Origin nas mutações
└── types/
```

```bash
pnpm lint          # ESLint
pnpm typecheck     # TypeScript
pnpm test          # Vitest + Testing Library + MSW (tests/)
pnpm test:watch
pnpm test:e2e      # Playwright (Chromium) contra o orquestrador falso (e2e/fake-orchestrator)
                   # 1ª vez: pnpm exec playwright install chromium
pnpm build
pnpm format        # Prettier (checagem)
pnpm contract:check   # tipos do orquestrador em dia com o snapshot do contrato
pnpm contract:update  # baixa o snapshot de um orquestrador local e regenera os tipos
```

A CI (`.github/workflows/ci.yml`) roda `lint`, `typecheck`, `contract:check`, `test`, `build` e `test:e2e` em push na `main` e em todo PR.

**Contrato do orquestrador.** O BFF fala com o orquestrador só por `src/server/orchestrator/client.ts` (chave `run` ou `admin` por chamada, timeout e erro com código próprio; a resposta é validada com zod). Os tipos (`src/server/orchestrator/openapi.d.ts`, gerado pelo `openapi-typescript`; não edite) vêm do snapshot versionado `docs/contracts/orchestrator-openapi.json`. Quando o orquestrador mudar a API, suba-o local em development (só lá existe o `/openapi.json`) e rode `ORCHESTRATOR_URL=http://127.0.0.1:7777 pnpm contract:update` (sem a variável, usa essa URL). Se o orquestrador estiver com `API_KEY_RUN`/`API_KEY_ADMIN`, a rota pede a chave run: exporte `ORCHESTRATOR_API_KEY_RUN` no shell antes (vai só no header; sem ela, ou com a errada, o script para com HTTP 401 e diz isso); revise o diff do snapshot e commite os dois arquivos. O snapshot atual foi gerado com a config vazia (`CONFIG_STORE=yaml` e um YAML sem agents, teams e tools), que já traz as rotas do AgentOS.

Sem `CI`, o `pnpm test:e2e` sobe o app com `next dev` (prazos maiores por causa da compilação sob demanda). Com `CI=true`, roda `next build` + `next start`, como na CI:

```bash
CI=true MONGO_CONNECTION_STRING=mongodb://127.0.0.1:1/ci-fake MONGO_DATABASE_NAME=ci-fake pnpm test:e2e
```

Os valores `MONGO_*` são de mentira (porta 1, sem Mongo): o build só precisa que existam. O env do servidor nos testes (usuário, hash, segredo e chaves de teste, nunca reais) fica em `e2e/test-env.ts`: o Vitest e o Playwright o usam, e o projeto `setup` do Playwright entra uma vez pela tela de login e grava a sessão em `e2e/.auth/` para os demais testes. A CI confere que nenhum desses valores aparece em `.next/static`. O build sobrescreve a pasta `.next`: pare qualquer `next dev` do projeto antes e suba o dev de novo depois.

Plano de trabalho em [`docs/roadmap/`](docs/roadmap/README.md), decisões em [`docs/decisions/`](docs/decisions/) e regras do projeto em [`CLAUDE.md`](CLAUDE.md). Para contribuir, veja o [CONTRIBUTING.md](CONTRIBUTING.md).

## Solução de problemas

- **Listas e dashboard com "Não foi possível carregar…"**: confira o MongoDB e o `.env.local`:
  ```bash
  mongosh "mongodb://localhost:27017/agno" --eval "db.getCollectionNames()"
  mongosh "mongodb://localhost:27017/agno" --eval "db.agents_config.countDocuments()"
  curl http://localhost:3000/api/agents
  ```
- **Playground com "Não foi possível conectar ao orquestrador"**: confira `ORCHESTRATOR_URL` e o orquestrador (`curl http://localhost:7777/health`). Chip "offline": o orquestrador não respondeu; "código 502": respondeu com erro ou recusou a chave (confira `ORCHESTRATOR_API_KEY_RUN`).
- **Agente criado não aparece no chat**: reinicie o orquestrador (ver "Quando a mudança vale").

## Licença e créditos

[MIT](./LICENSE). Agradecimentos ao [agno-agi Agent UI](https://github.com/agno-agi/agent-ui) (projeto base), ao [Orquestrador IA Python](https://github.com/Mosfet04/orquestradorIAPythonArgo), ao [Agno](https://agno.link), ao [Next.js](https://nextjs.org), ao [shadcn/ui](https://ui.shadcn.com) e ao [Tailwind CSS](https://tailwindcss.com).

---

## English version

Web UI for the [Agno Python AI Orchestrator](https://github.com/Mosfet04/orquestradorIAPythonArgo): configure agents and HTTP tools, test them in chat and see usage metrics. Based on the [agno-agi Agent UI](https://github.com/agno-agi/agent-ui).

### What it does today

- **Chat playground** (`/playground`): chat with the orchestrator's agents and teams, with streaming, tool calls (time and error of each), time and tokens of each response, session history (Agno 2.5 `chat_history` and the legacy format) and media.
- **Agents** (`/agents`, `/agents/new`, `/agents/<id>`) and **HTTP tools** (`/tools`, …): create, edit, delete, search and filter.
- **Dashboard** (`/dashboard`) and **getting started** guide (`/`).
- **Sign-in** (`/login`): the whole playground (pages and `/api/*`) requires a session for a single user configured on the server; sessions last 12 h, no renewal. "Sign out" is at the end of the navigation.
- Every section has its own URL; light/dark theme; pt-BR and EN. Loading, empty and error states everywhere: with the orchestrator or MongoDB down you get the error with "Try again", and an unknown address shows the in-app 404.

### How it works today

- **Management** (agents, tools, dashboard): the `src/app/api/**` routes read and write the orchestrator's MongoDB directly, validating input with zod.
- **Chat**: the browser only talks to the playground. The `src/app/api/playground/**` routes (BFF) call the orchestrator's AgentOS at `ORCHESTRATOR_URL` with the run key (deleting a session uses the admin key) and pass the run stream through unbuffered. The sessions' `user_id` is the logged-in user. There is no endpoint field in the panel: the URL and keys stay on the server.
- **When changes apply**: the orchestrator builds agents and tools at startup, so what you create or edit here takes effect in chat **after restarting the orchestrator**. Hot apply through the orchestrator's Admin API is planned for phases P2–P4 ([roadmap](docs/roadmap/README.md)).

The MongoDB collections (`agents_config`, `tools`, `agno_sessions`, `agno_memories`) are described in the Portuguese section above.

### Quick start

Requirements: Node.js 22.18+ or 24+, pnpm 10.33.0 (pnpm only) and the orchestrator running with its MongoDB.

```bash
pnpm install
# .env.local (see "Variáveis de ambiente" above for the table)
#   MONGO_CONNECTION_STRING=mongodb://localhost:27017
#   MONGO_DATABASE_NAME=agno
#   ORCHESTRATOR_URL=http://localhost:7777
#   ORCHESTRATOR_API_KEY_RUN=<orchestrator API_KEY_RUN>
#   ORCHESTRATOR_API_KEY_ADMIN=<orchestrator API_KEY_ADMIN>
#   SESSION_SECRET=<random secret, 32+ characters>
#   AUTH_USERNAME=admin
#   AUTH_PASSWORD_HASH=<output of: read -rs PW && printf '%s' "$PW" | pnpm -s auth:hash; unset PW>
pnpm dev                                                   # http://localhost:3000
mongosh "mongodb://localhost:27017" sample-data.js         # optional sample data (database "agno")
mongosh "mongodb://localhost:27017" cleanup-sample-data.js # removes it
```

Server variables are validated in `src/server/env.ts` and never reach the browser; if one is missing, the server refuses requests and the log names the variable, never its value. Sign-in allows 5 attempts per IP every 15 min (in-memory counter: single replica only); the IP is the last `X-Forwarded-For` entry, so serve it behind a proxy that sets that header, otherwise the limit doesn't hold. Server env is checked at startup in `pnpm dev` and from the first request in `pnpm start`. Rotating `SESSION_SECRET` signs everyone out (there is no server-side revocation).

Production: `pnpm build` and `pnpm start` (`MONGO_*` must be set at build time too; server variables only at start). Serve over HTTPS: outside `pnpm dev` the session cookie is `Secure`. There is no Dockerfile.

### Usage

1. **Tools → New tool**: register the HTTP call (method, base URL, endpoint, headers, parameters). Header values are stored as plain text in MongoDB and shown in the editor until secret references arrive (P2+).
2. **Agents → New agent**: pick provider and model, write the prompt, select tools, optionally enable RAG. Provider API keys live in the orchestrator.
3. Restart the orchestrator so it loads the changes.
4. **Playground**: pick the agent and chat.

### Development

Stack: Next.js 15 (App Router), React 18, TypeScript, Tailwind + shadcn/ui, zustand, nuqs, next-intl, react-hook-form, zod (API routes), recharts. Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test` (Vitest), `pnpm test:e2e` (Playwright against the fake orchestrator; `CI=true` runs it against a production build), `pnpm build`, `pnpm contract:check` (orchestrator types up to date with the `docs/contracts/orchestrator-openapi.json` snapshot) and `pnpm contract:update` (downloads `/openapi.json` from a local orchestrator in development, `ORCHESTRATOR_URL` or `http://127.0.0.1:7777`, and regenerates the types; if the orchestrator has API keys set, export `ORCHESTRATOR_API_KEY_RUN` first, sent only as the Bearer header). Colors only via Design System tokens; UI text only via the `messages/*.json` catalogs. See [CONTRIBUTING.md](CONTRIBUTING.md).

### Troubleshooting

- Lists/dashboard show "Couldn't load…": check MongoDB and `.env.local` (`curl http://localhost:3000/api/agents`).
- Playground shows "Couldn't connect to the orchestrator": check `ORCHESTRATOR_URL` and `curl http://localhost:7777/health`; "code 502" means the orchestrator answered with an error or refused the key (check `ORCHESTRATOR_API_KEY_RUN`).
- New agent missing in chat: restart the orchestrator.

License: [MIT](./LICENSE).

---

## Changelog

### v1.1.0 — Agno 2.5 (2026-02-23)

#### Novas funcionalidades
- **Suporte a Teams**: playground, dashboard e sessões agora funcionam com Teams além de Agents
- **Dashboard aprimorado**: métricas separadas para Agent Sessions e Team Sessions, gráficos de área empilhados, gráfico de pizza por tipo de sessão
- **Consumo de tokens por entidade**: tabela de tokens agora mostra agents e teams com identificação de tipo
- **Sessões unificadas**: carregamento de sessões compatível com formato `chat_history` (Agno 2.5) e formato legado (`runs`/`memory.runs`)

#### Alterações de API
- Rotas do Agno atualizadas: removido prefixo `/v1/playground/` — endpoints agora em `/agents`, `/teams`, `/sessions`
- Sessões unificadas via query params (`?type=agent|team&component_id=...`)
- Endpoint padrão alterado de `http://localhost:7777/playground` para `http://localhost:7777`
- Modo padrão alterado de `team` para `agent`

#### Banco de dados
- Collection `storage` renomeada para `agno_sessions`
- Collection `user_memories` renomeada para `agno_memories`
- Dashboard agora coleta modelos a partir de `agent_data`/`team_data` nas sessões do Agno

#### Melhorias técnicas
- `useAIStreamHandler`: fallback quando IP não pode ser obtido, timeout de 3s na requisição de IP
- `useAIStreamHandler`: flag `monitor: true` enviada automaticamente para runs de Teams
- `useSessionLoader`: suporte ao formato `chat_history` do Agno 2.5 com fallback para formato legado
- `useChatActions`: prioridade para agents sobre teams no carregamento inicial
- `layout.tsx`: `viewport` exportado separadamente conforme recomendação do Next.js
- Correção de keys duplicadas no dashboard (`model.name` → chave composta com provider e index)
- Adicionados `eslint-disable` para supressões necessárias de `@typescript-eslint/no-explicit-any`
