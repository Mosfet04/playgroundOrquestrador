# Playground do Orquestrador

> **[English version below](#english-version)**

Interface web para o [Orquestrador IA Python Agno](https://github.com/Mosfet04/orquestradorIAPythonArgo): configura agentes e tools HTTP, testa no chat e mostra métricas de uso.

> **Baseado no [agno-agi Agent UI](https://github.com/agno-agi/agent-ui)**, adaptado para o orquestrador.

![Interface do playground](https://github.com/user-attachments/assets/7765fae5-a813-46cb-993b-904af9bc1672)

## O que tem hoje

- **Playground de chat** (`/playground`): conversa com agents e teams do orquestrador, com streaming, tool calls (tempo e erro de cada uma), tempo e tokens de cada resposta, histórico de sessões (formato `chat_history` do Agno 2.5 e o legado) e mídia (imagem, áudio, vídeo).
- **Agentes** (`/agents`, `/agents/new`, `/agents/<id>`): criar, editar, desativar/reativar, excluir, buscar e filtrar; modelo, prompt, tools associadas e RAG.
- **Teams** (`/teams`, `/teams/new`, `/teams/<id>`): criar, editar, desativar/reativar, excluir, buscar e filtrar; membros (agents), modo de coordenação, modelo do líder e execução.
- **Tools HTTP** (`/tools`, `/tools/new`, `/tools/<id>`): criar, editar, desativar/reativar e excluir; método, rota com `{param}` ligada aos parâmetros, headers, parâmetros com valor padrão e o preview da requisição.
- **Dashboard** (`/dashboard`): agentes ativos, pico diário de usuários, sessões de agent e de team, tokens, modelos e atividade por dia, com filtro de período (Hoje, 7, 30 e 90 dias, em dias UTC).
- **Primeiros passos** (`/`): guia com atalhos para criar agente, tool e testar.
- Cada seção tem endereço próprio (favoritar, nova aba, voltar do navegador); tema claro/escuro; pt-BR e EN.
- **Login** (`/login`): o playground inteiro (páginas e `/api/*`) só abre com sessão, de um usuário único configurado no servidor. A sessão dura 12 h, sem renovação; "Sair" fica no fim da navegação (no celular, no rodapé do menu).
- Estados de carregando, vazio e erro em todas as telas: com o orquestrador fora, a tela mostra o erro com "Tentar de novo", e um endereço inexistente mostra o 404 dentro do app.

## Como funciona hoje

```mermaid
graph LR
    B[Navegador] -->|gestão, dashboard e chat: /api/*| N[BFF: Next.js API Routes]
    N -->|/admin/config/*, /metrics, /agents, /teams, /sessions, runs| O[Orquestrador / AgentOS]
    O --> M[(Config e sessões do orquestrador)]
```

- **Dashboard**: `/api/dashboard/stats` chama o `GET /metrics` (agregados por dia, em UTC) e o `GET /admin/config/agents` do orquestrador com a chave admin, sem Mongo. Como o `GET /metrics` só lê agregados prontos, o BFF pede antes o recálculo (`POST /metrics/refresh`), no máximo 1 vez por minuto por processo; se o refresh falhar, a leitura segue com o que houver. Sessões, tokens e modelos somam os dias do período; "Máx. usuários/dia" é o pico diário (o orquestrador não conta usuários únicos no período). O consumo de tokens por agente ou team espera as métricas por agente do orquestrador (F8).
- **Gestão** (agentes, teams e tools): as rotas `src/app/api/agents|teams|tools` validam o corpo com zod e chamam a API Admin do orquestrador (`/admin/config/agents|teams|tools`) com a chave admin; o playground não acessa o Mongo. O formulário de hoje é traduzido para o documento snake_case do orquestrador (`factoryIaModel` vira `factory_ia_model`, os campos `rag_*` viram o `rag_config` inteiro: documento, estratégia, embedder, `model_params`, `base_url` e `api_key_ref`; RAG desligado grava `active: false` com os valores, e sem valor nenhum grava `null`). A chave de API (modelo, líder, embedder e headers) é sempre uma referência `env:`/`file:` escolhida num seletor; o valor da chave nunca passa pelo playground. Lista, busca e filtros correm no BFF sobre a lista inteira. A versão lida (`version`) volta no `If-Match` ao salvar e ao excluir: se outra pessoa mudou a config no meio, o salvar falha com o código 412. Salvar um agent troca o documento inteiro, então o BFF lê o atual e sobrescreve só os campos do formulário (o que a tela não mostra, como uma chave futura do orquestrador, fica). O orquestrador valida: o campo que ele recusa (422) aparece no formulário com "Valor recusado pelo orquestrador", sem o valor. "Excluir" apaga de vez (`?hard=true`); "Desativar" é `DELETE /api/<agents|teams|tools>/<id>?soft=true` (qualquer outro valor de `soft` é 400), que chama o orquestrador sem `hard` (grava `active: false`, devolve o documento com a versão nova e recusa com 409 se o agent é membro de team). O orquestrador não guarda datas: a coluna "Atualizado" mostra "—".
- **Chat**: o navegador só fala com o playground. As rotas `src/app/api/playground/**` (BFF) chamam o AgentOS do orquestrador em `ORCHESTRATOR_URL`, com a chave run (excluir sessão usa a admin), e repassam o stream do run sem buffer. O `user_id` das sessões é o usuário do login. Não há endpoint no painel: a URL e as chaves ficam só no servidor.
- **Quando a mudança vale**: o que você cria ou edita aqui fica na config do orquestrador e vale no chat **logo depois de salvar** (a API Admin só grava o que monta e troca o runtime em seguida).

## Formato da config

O playground não lê nem grava o banco: o formato é o da API Admin do orquestrador (documento snake_case com `version`). Exemplo de agent e de tool como o GET devolve:

#### Agent (`/admin/config/agents/<id>`)
```json
{
  "id": "assistant-general",
  "nome": "Assistente Geral",
  "factory_ia_model": "ollama",
  "model": "llama3.2:latest",
  "descricao": "Assistente para tarefas gerais",
  "prompt": "Você é um assistente útil...",
  "active": true,
  "tools_ids": ["weather-api"],
  "rag_config": {
    "active": true,
    "doc_name": "knowledge_base",
    "model": "text-embedding-3-small",
    "factory_ia_model": "openai",
    "search_strategy": "semantic"
  },
  "version": 3
}
```

#### Team (`/admin/config/teams/<id>`)
```json
{
  "id": "suporte",
  "nome": "Suporte",
  "descricao": "Atende o cliente",
  "prompt": "Escolha o melhor membro.",
  "active": true,
  "member_ids": ["assistant-general", "pesquisador"],
  "mode": "route",
  "factory_ia_model": "openai",
  "model": "gpt-4o",
  "user_memory_active": true,
  "summary_active": false,
  "version": 2
}
```

#### Tool (`/admin/config/tools/<id>`)
```json
{
  "id": "weather-api",
  "name": "Weather API",
  "description": "Obtém informações meteorológicas",
  "route": "https://api.openweathermap.org/data/2.5/weather",
  "http_method": "GET",
  "headers": { "X-Conta": "***", "X-Api-Key": "env:OPENWEATHER_API_KEY" },
  "parameters": [
    { "name": "q", "type": "string", "description": "Nome da cidade", "required": true },
    { "name": "units", "type": "string", "description": "Unidade de temperatura", "required": false }
  ],
  "active": true,
  "version": 1
}
```

Tipos de parâmetro aceitos (os do orquestrador): `string`, `integer`, `float`, `boolean`, `object`, `array`. A `description` da tool e de cada parâmetro é obrigatória.

**Headers da tool:** valor em texto volta mascarado (`***`) e o valor gravado nunca chega ao navegador; salvar sem mexer reenvia a máscara e o orquestrador mantém o valor (desde que a origem da rota não mude). Header de credencial (`Authorization`, `Cookie`, `*-Key`, `*-Token`) só aceita referência a segredo (`env:<VARIAVEL>` ou `file:/caminho`), que volta como está.

## Início rápido

**Pré-requisitos:** Node.js 22.18+ ou 24+, pnpm 10.33.0 (só pnpm) e o orquestrador rodando ([README do orquestrador](https://github.com/Mosfet04/orquestradorIAPythonArgo)).

```bash
git clone <este-repositorio>
cd playgroundOrquestrador
pnpm install
```

Crie o `.env.local` com as variáveis abaixo.

### Variáveis de ambiente

| Variável | O que é |
|---|---|
| `ORCHESTRATOR_URL` | URL do orquestrador, `http(s)://` (ex.: `http://localhost:7777`) |
| `ORCHESTRATOR_API_KEY_RUN`, `ORCHESTRATOR_API_KEY_ADMIN` | as chaves `API_KEY_RUN` e `API_KEY_ADMIN` do orquestrador |
| `SESSION_SECRET` | segredo que assina o cookie de sessão, com 32 caracteres ou mais (ex.: `openssl rand -base64 48`) |
| `AUTH_USERNAME` | usuário do login |
| `AUTH_PASSWORD_HASH` | hash scrypt da senha do login, gerado por `pnpm auth:hash` (nunca a senha em claro) |

As variáveis são validadas em `src/server/env.ts` e só existem no servidor: o navegador nunca as recebe. Faltando alguma, o servidor recusa as requisições e o log cita só o nome da variável, nunca o valor (no `pnpm dev`, ao subir; no `pnpm start`, a partir da 1ª requisição, que é quando o Next roda o `src/instrumentation.ts`). A URL e as chaves do orquestrador são usadas só pelo cliente do servidor (`src/server/orchestrator/`): health, o chat (`/api/playground/*`), o dashboard (`/api/dashboard/*`) e a gestão (`/api/agents*`, `/api/teams*`, `/api/tools*`) e as opções dos formulários (`/api/config/schema`).

Para gerar o hash, passe a senha pelo stdin (não fica no histórico do shell):

```bash
read -rs PW && printf '%s' "$PW" | pnpm -s auth:hash; unset PW
# scrypt:<sal>:<hash> -> valor de AUTH_PASSWORD_HASH
```

```env
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

**Dados de exemplo (opcional):** use o seed do orquestrador (`mongo-init/` para o Mongo, `config.example.yaml` para o store YAML; ver o [README do orquestrador](https://github.com/Mosfet04/orquestradorIAPythonArgo)), ou crie pelas telas de Agentes e Tools.

**Produção:** `pnpm build` e `pnpm start` (as variáveis só precisam existir no `start`). Sirva por HTTPS: fora do `pnpm dev` o cookie de sessão é `Secure`. O repositório não tem Dockerfile.

## Como usar

1. Em **Tools → Nova tool**, cadastre a chamada HTTP. Exemplo: ID `weather-api`, método `GET`, rota `https://api.openweathermap.org/data/2.5/weather`, header `X-Api-Key` com `env:OPENWEATHER_API_KEY` (referência a uma variável do orquestrador, ver "Headers da tool"), parâmetros `q` (string, obrigatório) e `units` (string, opcional).
2. Em **Agentes → Novo agente**, escolha provedor e modelo (ex.: Ollama, `llama3.2:latest`), escreva o prompt, marque as tools e, se quiser, ligue o RAG.
3. No **Playground**, escolha o agente e converse (a mudança vale logo depois de salvar).

**Opções dos formulários:** provedores do modelo e do embedding (RAG), métodos HTTP e tipos de parâmetro vêm do `GET /admin/schema` do orquestrador (via `/api/config/schema`, chave admin, sem cache), não de lista no playground; um provedor novo ou plugin aparece depois que o orquestrador reinicia. O provedor aparece pelo nome que o orquestrador usa. Enquanto o schema carrega, os selects ficam desabilitados; se falhar, o formulário mostra a mensagem com "Tentar de novo" e não deixa salvar. Se o orquestrador diz que a config é só leitura (`config_store.writable = false`), o formulário avisa e desabilita campos, salvar e excluir. Um valor gravado que o orquestrador não oferece mais continua selecionado, e o orquestrador decide ao salvar. As chaves dos provedores ficam no orquestrador, não aqui.

**Editor de agent (P3-02):** cobre o documento inteiro do agent. Modelo: provedor, modelo, URL base (aparece e é obrigatória quando o provedor tem `requires_base_url`), referência da chave de API e parâmetros do modelo. A referência é só `env:<PROVEDOR>_API_KEY` ou `file:/caminho` (os formatos vêm do schema); um valor sem esse prefixo é recusado no navegador e nunca sai dele. Parâmetros: linhas nome + valor; o nome é um dos `model_params` do provedor escolhido e o tipo do valor é inferido (número com ponto, `true`/`false` ou texto; não expressa número como texto, ex. `stop: "1"`). Execução: Markdown, data e hora, histórico (com `num_history_runs` na faixa do schema), raciocínio, memória do usuário e resumo da sessão, cada um com o padrão do orquestrador. Salvar envia o documento do formulário: parâmetro removido ou URL base/referência vazia saem do documento; o RAG e chaves que o formulário não conhece são preservados.

**Conflito e desativar (P3-06):** se outra pessoa salvou a mesma config no meio da edição, o salvar (412) abre um diálogo que relê a versão atual pelo BFF e lista os campos do formulário que diferem (o seu valor × o atual; referência de segredo e `***` como estão, valor em texto de header nunca). Saídas: "Voltar ao formulário", "Recarregar a atual" (descarta as suas edições) e "Salvar as minhas por cima" (grava com a versão atual no `If-Match`, preservando o estado ativo dela; outro 412 relê e avisa). O estado ativo saiu do formulário: o cabeçalho mostra o badge Ativo/Inativo e o rodapé tem "Desativar" (com confirmação, a página fica) ou "Reativar" (grava o documento carregado com `active: true`); os dois não gravam as edições do formulário. 412 em Excluir, Desativar ou Reativar mostra um aviso com "Recarregar"; agent membro de team não desativa (o diálogo lista os teams).

**Editor de team (P3-04):** cobre o documento inteiro do team. Membros: os agents do `GET /api/agents` (até 100) como linhas marcáveis, com busca no navegador; ao menos um (senão o formulário não envia) e a ordem gravada se mantém, com os novos no fim; um id gravado que já não existe aparece marcado com aviso até ser desmarcado, e o salvar fica desabilitado enquanto a lista de agents carrega ou falha. Modo: um cartão por valor de `team.mode` do schema, com a descrição; um valor gravado fora da lista é preservado até o usuário trocar. Modelo do líder e Execução reusam as seções do agent (Execução com Markdown, histórico, memória do usuário, ligada por padrão no team, e resumo). Excluir um agent que é membro de team é recusado pelo orquestrador (409 `used_by`): o BFF repassa só os ids dos teams e o diálogo de excluir lista cada um com link para `/teams/<id>`, em nova aba.

## Interface

- **Cores e tema:** só tokens do Design System (`docs/design/design-system.md`): canais HSL em `src/app/globals.css` (`:root` = claro, `.dark` = escuro), mapeados no `tailwind.config.ts` (`bg-background`, `text-foreground`, `bg-primary`…). Nada de hex nem paleta crua do Tailwind nos componentes. O tema (Claro, Escuro ou Sistema, padrão Sistema) vem do `next-themes`, no botão do cabeçalho (no celular, também no rodapé do menu), e fica no `localStorage` (`theme`).
- **Idioma:** pt-BR (padrão) e EN com `next-intl`. Os textos ficam em `messages/pt-BR.json` e `messages/en.json` (mesmas chaves, conferido por `tests/i18n/catalogs.test.ts`); em `src/app`, `src/components/{layout,management,playground}`, `src/hooks` e `src/store.ts` o lint recusa texto literal em JSX, nos atributos e props de texto (`aria-label`, `title`, `label`, `description`…) e em `toast.*()`. O idioma é escolhido no botão `PT`/`EN` do cabeçalho (no celular, na linha "Idioma" do menu), fica no cookie `locale` e não entra na URL; sem cookie, abre em pt-BR. Trocar de idioma não recarrega a página nem perde a conversa. O conteúdo gerado pelos agentes não é traduzido.

## Desenvolvimento

**Stack:** Next.js 15 (App Router) + React 18 + TypeScript, Tailwind + shadcn/ui (Radix), zustand (sessão do chat), nuqs (estado na URL), next-intl, react-hook-form, zod (validação nas rotas da API), recharts.

```
src/
├── app/
│   ├── api/                 # rotas da API (agents, teams, tools, dashboard, auth), validação zod
│   ├── login/               # tela de login (fora da casca)
│   └── (app)/               # rotas com a casca (navegação + cabeçalho): /, /playground,
│                            # /agents[/new|/<id>], /teams[/new|/<id>], /tools[/new|/<id>], /dashboard;
│                            # error.tsx, not-found.tsx e o catch-all do 404
├── components/
│   ├── layout/              # casca, navegação, cabeçalho, tema e idioma
│   ├── management/          # agentes, teams, tools, dashboard e primeiros passos
│   ├── playground/          # chat e painel de sessões
│   └── ui/                  # componentes base (shadcn) e estados (loading.tsx)
├── hooks/                   # stream do chat, sessões, ações do playground
├── i18n/                    # next-intl: idioma pelo cookie (request.ts)
├── lib/                     # utilitários puros (utils.ts, safeUrl.ts...)
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
CI=true pnpm test:e2e
```

O CRUD de agents do e2e roda num projeto próprio (`config-agents`), depois do resto, porque o dashboard conta os agents da mesma config do orquestrador falso. O env do servidor nos testes (usuário, hash, segredo e chaves de teste, nunca reais) fica em `e2e/test-env.ts`: o Vitest e o Playwright o usam, e o projeto `setup` do Playwright entra uma vez pela tela de login e grava a sessão em `e2e/.auth/` para os demais testes. A CI confere que nenhum desses valores aparece em `.next/static`. O build sobrescreve a pasta `.next`: pare qualquer `next dev` do projeto antes e suba o dev de novo depois.

Plano de trabalho em [`docs/roadmap/`](docs/roadmap/README.md), decisões em [`docs/decisions/`](docs/decisions/) e regras do projeto em [`CLAUDE.md`](CLAUDE.md). Para contribuir, veja o [CONTRIBUTING.md](CONTRIBUTING.md).

## Solução de problemas

- **Listas e dashboard com "Não foi possível carregar…"**: confira `ORCHESTRATOR_URL`, `ORCHESTRATOR_API_KEY_ADMIN` e o orquestrador (`curl http://localhost:7777/health`). "código 502": o orquestrador respondeu com erro ou recusou a chave admin.
- **Playground com "Não foi possível conectar ao orquestrador"**: confira `ORCHESTRATOR_URL` e o orquestrador (`curl http://localhost:7777/health`). Chip "offline": o orquestrador não respondeu; "código 502": respondeu com erro ou recusou a chave (confira `ORCHESTRATOR_API_KEY_RUN`).
- **Salvar abre "O agente/team/tool mudou"**: a config mudou depois que você abriu o editor (412); o diálogo mostra o que difere e deixa recarregar a atual ou salvar as suas por cima. Se a leitura da versão atual falhar, use "Tentar de novo".

## Licença e créditos

[MIT](./LICENSE). Agradecimentos ao [agno-agi Agent UI](https://github.com/agno-agi/agent-ui) (projeto base), ao [Orquestrador IA Python](https://github.com/Mosfet04/orquestradorIAPythonArgo), ao [Agno](https://agno.link), ao [Next.js](https://nextjs.org), ao [shadcn/ui](https://ui.shadcn.com) e ao [Tailwind CSS](https://tailwindcss.com).

---

## English version

Web UI for the [Agno Python AI Orchestrator](https://github.com/Mosfet04/orquestradorIAPythonArgo): configure agents and HTTP tools, test them in chat and see usage metrics. Based on the [agno-agi Agent UI](https://github.com/agno-agi/agent-ui).

### What it does today

- **Chat playground** (`/playground`): chat with the orchestrator's agents and teams, with streaming, tool calls (time and error of each), time and tokens of each response, session history (Agno 2.5 `chat_history` and the legacy format) and media.
- **Agents** (`/agents`, `/agents/new`, `/agents/<id>`), **teams** (`/teams`, …) and **HTTP tools** (`/tools`, …): create, edit, delete, search and filter. A team has members (agents), a coordination mode, a leader model and execution settings.
- **Dashboard** (`/dashboard`) and **getting started** guide (`/`).
- **Sign-in** (`/login`): the whole playground (pages and `/api/*`) requires a session for a single user configured on the server; sessions last 12 h, no renewal. "Sign out" is at the end of the navigation.
- Every section has its own URL; light/dark theme; pt-BR and EN. Loading, empty and error states everywhere: with the orchestrator down you get the error with "Try again", and an unknown address shows the in-app 404.

### How it works today

- **Management** (agents, teams, tools, dashboard): the `src/app/api/**` routes validate input with zod and call the orchestrator's Admin API (`/admin/config/*`) and `/metrics` with the admin key; the playground never touches Mongo. The version read goes back in `If-Match` on save, delete and deactivate (code 412 if someone changed it meanwhile; on save, a dialog compares the form with the current version and offers to reload it or overwrite it with your changes); a field the orchestrator rejects (422) is shown on the form without the value; "Delete" removes for good (`?hard=true`); "Deactivate" is `DELETE …?soft=true` (sets `active: false`, returns the document) and "Reactivate" saves the loaded document with `active: true`; tool header values come back masked (`***`) and saving them unchanged keeps the stored value.
- **Form options**: model and embedding providers, HTTP methods and parameter types come from the orchestrator's `GET /admin/schema` (via `/api/config/schema`, admin key, no cache), not from lists in the playground. While it loads the selects are disabled; if it fails the form shows a message with "Try again" and cannot be saved; a read-only config store (`config_store.writable = false`) disables the whole form. A stored value the orchestrator no longer offers stays selected and the orchestrator decides on save.
- **Agent editor**: covers the whole agent document: model (provider, model, base URL when the provider requires it, API key reference, model parameters as name + value rows with the value type inferred), instructions, execution options (Markdown, date and time, history with the schema range, reasoning, user memory, session summary) and tools. The API key is only a reference (`env:` / `file:`); a pasted key is refused in the browser. Saving sends the form's document; the RAG and keys the form doesn't know are preserved.
- **Team editor**: covers the whole team document: members (the agents from `GET /api/agents`, up to 100, as checkable rows with client-side search; at least one, stored order kept, new ones last; a stored id that no longer exists is shown checked with a warning; save is disabled while the agent list loads or fails), coordination mode (one card per `team.mode` value from the schema; a stored value outside the list is kept until changed), the leader model and execution (reused from the agent; user memory defaults to on for a team). Deleting an agent that is a team member is refused by the orchestrator (409 `used_by`): the BFF passes only the team ids and the delete dialog lists each one with a link to `/teams/<id>` in a new tab.
- **Chat**: the browser only talks to the playground. The `src/app/api/playground/**` routes (BFF) call the orchestrator's AgentOS at `ORCHESTRATOR_URL` with the run key (deleting a session uses the admin key) and pass the run stream through unbuffered. The sessions' `user_id` is the logged-in user. There is no endpoint field in the panel: the URL and keys stay on the server.
- **When changes apply**: what you create or edit here is stored in the orchestrator's config and takes effect in chat **right after saving**.

The config format (Admin API documents) is described in the Portuguese section above.

### Quick start

Requirements: Node.js 22.18+ or 24+, pnpm 10.33.0 (pnpm only) and the orchestrator running.

```bash
pnpm install
# .env.local (see "Variáveis de ambiente" above for the table)
#   ORCHESTRATOR_URL=http://localhost:7777
#   ORCHESTRATOR_API_KEY_RUN=<orchestrator API_KEY_RUN>
#   ORCHESTRATOR_API_KEY_ADMIN=<orchestrator API_KEY_ADMIN>
#   SESSION_SECRET=<random secret, 32+ characters>
#   AUTH_USERNAME=admin
#   AUTH_PASSWORD_HASH=<output of: read -rs PW && printf '%s' "$PW" | pnpm -s auth:hash; unset PW>
pnpm dev                                                   # http://localhost:3000
# optional sample data: the orchestrator's seed (mongo-init/, config.example.yaml)
```

Server variables are validated in `src/server/env.ts` and never reach the browser; if one is missing, the server refuses requests and the log names the variable, never its value. Sign-in allows 5 attempts per IP every 15 min (in-memory counter: single replica only); the IP is the last `X-Forwarded-For` entry, so serve it behind a proxy that sets that header, otherwise the limit doesn't hold. Server env is checked at startup in `pnpm dev` and from the first request in `pnpm start`. Rotating `SESSION_SECRET` signs everyone out (there is no server-side revocation).

Production: `pnpm build` and `pnpm start` (variables are only needed at start). Serve over HTTPS: outside `pnpm dev` the session cookie is `Secure`. There is no Dockerfile.

### Usage

1. **Tools → New tool**: register the HTTP call (method, route, headers, parameters). Credential headers (`Authorization`, `*-Key`, `*-Token`) take only a secret reference (`env:<VAR>` or `file:/path`); plain-text values come back masked.
2. **Agents → New agent**: pick provider and model, write the prompt, select tools, optionally enable RAG. Provider API keys live in the orchestrator.
3. **Playground**: pick the agent and chat (changes apply right after saving).

### Development

Stack: Next.js 15 (App Router), React 18, TypeScript, Tailwind + shadcn/ui, zustand, nuqs, next-intl, react-hook-form, zod (API routes), recharts. Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test` (Vitest), `pnpm test:e2e` (Playwright against the fake orchestrator; `CI=true` runs it against a production build), `pnpm build`, `pnpm contract:check` (orchestrator types up to date with the `docs/contracts/orchestrator-openapi.json` snapshot) and `pnpm contract:update` (downloads `/openapi.json` from a local orchestrator in development, `ORCHESTRATOR_URL` or `http://127.0.0.1:7777`, and regenerates the types; if the orchestrator has API keys set, export `ORCHESTRATOR_API_KEY_RUN` first, sent only as the Bearer header). Colors only via Design System tokens; UI text only via the `messages/*.json` catalogs. See [CONTRIBUTING.md](CONTRIBUTING.md).

### Troubleshooting

- Lists/dashboard show "Couldn't load…": check `ORCHESTRATOR_URL`, `ORCHESTRATOR_API_KEY_ADMIN` and `curl http://localhost:7777/health`.
- Playground shows "Couldn't connect to the orchestrator": check `ORCHESTRATOR_URL` and `curl http://localhost:7777/health`; "code 502" means the orchestrator answered with an error or refused the key (check `ORCHESTRATOR_API_KEY_RUN`).
- Save opens "The agent/team/tool changed": the config changed after you opened the editor (412); the dialog shows what differs and lets you reload the current version or overwrite it with yours. If reading the current version fails, use "Try again".

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

**Editor de tool (P3-03):** a rota aceita `{param}` só no caminho e na query (no host o orquestrador recusa). Placeholder sem parâmetro de mesmo nome faz o orquestrador descartar a tool no runtime, então o editor recusa o envio e oferece criar o parâmetro (obrigatório, `string`); parâmetro cujo nome está na rota vai sempre obrigatório. O `default_value` do parâmetro é convertido pelo tipo (número, booleano, JSON) e só serve de exemplo: o orquestrador não o envia na chamada. O card "Requisição" mostra, sem chamar a rota, como o orquestrador monta a chamada (`{x}` pelo valor padrão percent-encoded, demais parâmetros em query para GET/DELETE ou corpo JSON para POST/PUT/PATCH, header em texto mascarado). Header de nome sensível com valor novo em texto é recusado no navegador (a regra de nomes é a do orquestrador, duplicada).
