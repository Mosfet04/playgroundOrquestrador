# P1 — Design system e navegação

Objetivo: identidade visual única (Design System no Claude Design, tokens claro/escuro), navegação por URL e UI bilíngue, para que as telas de gestão da P3/P4 nasçam sobre uma base consistente. Fase conduzida pelo `ui-ux-designer`: itens com `UI: sim` só vão ao dev depois da aprovação do design pelo usuário.

Princípios (valem para todos os itens):

- Reusar shadcn (`src/components/ui`) antes de criar componente; componente novo só com 2+ usos.
- Nenhuma mudança de dado ou contrato nesta fase (a gestão ainda fala com o Mongo até a P2/P3).
- Cada item com tela tem design QA com screenshots claro/escuro, desktop/celular.

## P1-01 — Design System do playground
UI: sim            Depende (orq.): —
Objetivo: Design System aprovado pelo usuário, referência para todo item com tela.
Escopo: auditoria heurística da UI atual (`docs/design/auditoria.md`: navegação, hierarquia, formulários, feedback, consistência, acessibilidade, com prints); artifact Design System do playground (tokens shadcn para claro e escuro, tipografia, espaçamento, raio, componentes usados: botão, input, select, switch, card, tabela/lista, dialog, toast, badge de status, campo de segredo por referência); `docs/design/design-system.md` com o link e as regras de uso; artifact Design com o novo layout geral (navegação lateral, cabeçalho, área de conteúdo) que servirá à P1-03; fontes self-hosted (sai `next/font/google`, decisão [0004](../decisions/0004-stream-runcontent-e-fontes.md)).
Fora de escopo: implementar tokens (P1-02) e rotas (P1-03).
Critérios de aceite: usuário aprova a direção visual e o layout geral (gate do `/dev-cycle`); `design-system.md` lista cada token com o valor nos dois temas e contraste AA dos pares texto/fundo.
Testes exigidos: a parte de código é só a fonte (decisão 0008): IBM Plex em `src/app/fonts/` com `OFL.txt` via `next/font/local`; regra de lint que barra `next/font/google`; build e e2e verdes sem requisição ao Google (V16).
Riscos e dependências: tool `Artifact` indisponível no subagente ⇒ fallback do agente (mockup HTML + publicação pela thread principal).

## P1-02 — Tokens claro/escuro
UI: sim            Depende (orq.): —
Objetivo: todo o app usa os tokens do Design System, com troca de tema.
Escopo: CSS vars do shadcn em `src/app/globals.css` para `:root` e `.dark`; `tailwind.config.ts` mapeando os tokens (hoje hex fixos em `tailwind.config.ts:28-42` e tokens como `text-muted-foreground` sem definição); `ThemeProvider` do `next-themes` (já instalado; `ui/sonner.tsx` já chama `useTheme`) e seletor de tema; trocar cores fixas (`bg-black`, `border-white`, hex) por tokens; remover CSS específico de aparelho (`globals.css`, `tailwind.config.ts:10`) em favor dos breakpoints padrão.
Fora de escopo: mudar layout ou fluxo.
Critérios de aceite: `git grep -nE "#[0-9a-fA-F]{3,6}\b|bg-black|text-white|border-white" src` só em exceções justificadas; tema persiste entre recargas; contraste AA nos pares da spec.
Testes exigidos: componente (seletor de tema troca a classe); E2E com screenshot nos dois temas (design QA).
Riscos e dependências: diff grande; se passar de ~600 linhas, quebrar por área (playground / gestão).

## P1-03 — Navegação por URL
UI: sim            Depende (orq.): —
Objetivo: cada seção tem URL própria, com deep link, voltar do navegador e recarga preservando a tela.
Escopo: rotas do App Router `/` (primeiros passos), `/playground`, `/agents`, `/agents/[id]`, `/tools`, `/tools/[id]`, `/dashboard`; layout `(app)` com a navegação do Design System; `src/app/page.tsx` deixa de trocar seção por `useState`; remover os listeners de resize de `page.tsx` e `AgentManagement.tsx` (usar breakpoints); `/teams` e `/settings` entram como itens de navegação só quando suas telas existirem (P3-04, P4-05).
Fora de escopo: reescrever os formulários (P3); mover para `src/features/` além do necessário para as rotas.
Critérios de aceite: abrir `/agents/<id>` direto mostra o editor do agente; voltar do navegador retorna à lista; parâmetros do chat (`?agent=`, `?session=`) continuam funcionando em `/playground`.
Testes exigidos: E2E de navegação (deep link, voltar, recarga); componente da navegação (item ativo, teclado).
Riscos e dependências: páginas de gestão ainda dependem do Mongo; o E2E dessas rotas usa o fake orchestrator só a partir da P3 (até lá, cobrir com teste de componente).

## P1-04 — i18n pt-BR e EN
UI: sim            Depende (orq.): —
Objetivo: toda a UI em pt-BR (padrão) e EN, sem texto fixo em componente.
Escopo: escolher a biblioteca (**decisão do usuário** no início do item; recomendação: `next-intl`); catálogos `messages/pt-BR.json` e `messages/en.json`; seletor de idioma; `lang` correto no `<html>` (hoje `lang="en"` e título "Agent UI" em `layout.tsx`); unificar a UI hoje misturada (gestão em português, chat em inglês); formatos de data/número pelo idioma (hoje `pt-BR` fixo).
Fora de escopo: traduzir conteúdo gerado pelos agentes ou campos do orquestrador.
Critérios de aceite: `git grep` de textos literais em JSX vazio (regra de lint, se a biblioteca oferecer); troca de idioma sem recarregar a sessão do chat; nenhuma chave faltando entre os dois catálogos (teste).
Testes exigidos: teste de paridade dos catálogos; E2E trocando o idioma.
Riscos e dependências: diff grande (muitos textos); quebrado em dois pela decisão [0011](../decisions/0011-i18n-next-intl-cookie.md): `next-intl`, idioma em cookie sem prefixo na URL, pt-BR sem cookie. Este item entrega a infraestrutura (lib, provider, seletor, `lang`, formatos, paridade, regra de lint) e migra shell, navegação, `GettingStarted` e gestão (agents, tools, dashboard); o playground fica no P1-04b.

## P1-04b — i18n do playground
UI: sim            Depende (orq.): —
Objetivo: o `/playground` (chat, sessões, seletores, hooks e toasts) sem texto fixo, na infraestrutura do P1-04.
Escopo: `src/components/playground/**`, `src/hooks/**` e mensagens de `src/store.ts` para os catálogos; regra de lint de texto literal estendida a essas pastas.
Fora de escopo: conteúdo gerado pelos agentes; visual do chat (P1-06).
Critérios de aceite: os do P1-04 valendo para o playground; trocar de idioma no meio de uma conversa mantém mensagens e stream.
Testes exigidos: E2E trocando o idioma com sessão aberta; paridade dos catálogos continua verde.
Riscos e dependências: P1-04. Ao estender a regra de lint, fechar as lacunas que a revisão do P1-04 deixou (R8): template literal com texto em ternário, ternário em `aria-label`/`placeholder`/`title`/`alt` e literal a mais de 2 níveis.

## P1-05 — Estados e documentação
UI: sim            Depende (orq.): —
Divisão (D-P1-05-2, [0014](../decisions/0014-estados-escopo-e-contadores.md)): a tabela da lista, o excluir no editor e os contadores (V6/V7 da spec) saem para o P1-05b.
Objetivo: nenhuma tela em branco ou quebrada; documentação fiel ao que existe.
Escopo: estados vazio/carregando/erro do Design System nas listas, dashboard e chat; `error.tsx` e `not-found.tsx` no layout; README e `GettingStarted` sem as promessas falsas (hot reload, "disponível imediatamente", Zod, Next 14); `README_EN.md`, `README_AGNO_MANAGER.md` e `INTEGRATION.md` consolidados no README (o que sobrar é decisão do usuário); `CONTRIBUTING.md` apontando para o `/dev-cycle`.
Fora de escopo: o realtime de verdade (P4).
Critérios de aceite: orquestrador fora do ar ⇒ mensagem de erro com ação ("tentar de novo"), não tela vazia; rota inexistente ⇒ 404 do app.
Testes exigidos: componente dos três estados por lista; E2E com o fake orchestrator desligado.
Riscos e dependências: herdado do P1-04b — os estados "Endpoint desconectado", "sem agente" e "sem storage" do painel de sessões existem no catálogo mas a UI não os alcança (`Sidebar.tsx`: `isEndpointActive &&` esconde Modo e Sessões com o orquestrador fora); lacunas conhecidas da regra de lint (prop de componente próprio e `action.label`/`cancel.label` de toast) registradas em `tests/lint/jsxLiterals.test.ts`.

## P1-05b — Tabela da lista e excluir no editor
UI: sim            Depende (orq.): —
Objetivo: as listas de agents e tools no layout aprovado (V11/V12 do P1-01), herdado da decisão [0010](../decisions/0010-rotas-criacao-lista-e-conexao.md) D-P1-03-2.
Escopo: V6 e V7 de `docs/design/P1-05.md`: tabela no desktop, linhas de 64 px no celular sem editar/excluir na linha; "Excluir" no rodapé do editor `/agents/<id>` e `/tools/<id>`; chips de total e por status com `limit=100` contado no cliente e "Mostrando 100 de N" acima do teto (D-P1-05-1, [0014](../decisions/0014-estados-escopo-e-contadores.md)).
Fora de escopo: paginação e contagem no servidor (P3).
Critérios de aceite: V6 e V7 no design QA nos dois temas, desktop e celular; os estados do P1-05 continuam valendo no layout novo.
Testes exigidos: componente da tabela (chips, nota de teto) e do excluir no editor; e2e de exclusão.
Riscos e dependências: P1-05. Observações do design QA do P1-05 (cosméticas) a tratar aqui: no celular, bloco de erro/404 com o ícone acima do título e conteúdo na largura do card (`EmptyState`, ramo com ícone); 404 de detalhe com o ícone da entidade em vez de Compass.

## P1-06 — Chat no visual do Design System
UI: sim            Depende (orq.): —
Objetivo: o `/playground` com a cara aprovada no P1-01 (decisão [0008](../decisions/0008-design-system-direcao-visual.md)).
Escopo: critérios V14 e V15 de `docs/design/P1-01.md` em `src/components/playground`: painel de sessões (Agente | Team, cartão da entidade, sessões), bolhas do usuário e do agente com métricas, chip de tool call (ok/erro), indicador de stream e composer.
Fora de escopo: chat via BFF (P2-03); markdown seguro (P2-04).
Critérios de aceite: V14 e V15 verificados no design QA nos dois temas, desktop e celular; o stream do P0-06 continua passando.
Testes exigidos: componente do chip de tool call e do indicador de stream; e2e do chat atual verde.
Riscos e dependências: P1-02 (tokens) e P1-03 (layout). Limitação herdada LIM-P1-03-1 (`tests/components/PlaygroundSessionUrl.test.tsx`, `it.fails`): com o orquestrador fora ao abrir `/playground?agent=&session=`, `initializePlayground` zera `?agent=` e a sessão não recarrega após o refresh; corrigir aqui ou na P2-03 e virar o teste em `it`. Observações do design QA do P1-05 a tratar aqui: ponto do Endpoint neutro/`signal` durante "Conectando…" (hoje já sai `destructive`); ícones distintos na caixa de sessões (tomada, tomada desligada, robô); conteúdo do Sheet a 390 px encostado na borda esquerda (herdado da P1-03); iniciais no avatar da conversa vazia.

## P1-07 — E2E contra o build de produção
UI: não            Depende (orq.): —
Objetivo: e2e estável na CI, sem a classe de instabilidade do `next dev` sob carga (compilação sob demanda, reload por HMR entre abas). Decisão [0011](../decisions/0011-i18n-next-intl-cookie.md) D-P1-04-8.
Escopo: `playwright.config.ts` com `next build` + `next start` na CI (local pode seguir no dev); ajuste do workflow da CI; remover prazos de 15 s/`test.slow()` que só existem por causa do dev, onde deixarem de ser necessários.
Fora de escopo: testes novos de produto.
Critérios de aceite: suíte e2e completa verde 5× seguidas na CI; tempo total da CI medido e registrado antes/depois.
Testes exigidos: a própria suíte.
Riscos e dependências: o build passa a ser pré-requisito do e2e (tempo de CI); env de build com o Mongo fake.
Resultado: local com `CI=true`, e2e de ~110 s (dev, 1 falha em 2) para ~48 s (build + start, 7/7 verdes); confirmação no Actions pendente do push. Limite aceito (D-P1-07-3): sem `suppressHydrationWarning` no `<html>` só o e2e local (dev) acusa, porque o React de produção não compara atributos.

