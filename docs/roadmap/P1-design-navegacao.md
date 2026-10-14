# P1 — Design system e navegação

Objetivo: identidade visual única (Design System no Claude Design, tokens claro/escuro), navegação por URL e UI bilíngue, para que as telas de gestão da P3/P4 nasçam sobre uma base consistente. Fase conduzida pelo `ui-ux-designer`: itens com `UI: sim` só vão ao dev depois da aprovação do design pelo usuário.

Princípios (valem para todos os itens):

- Reusar shadcn (`src/components/ui`) antes de criar componente; componente novo só com 2+ usos.
- Nenhuma mudança de dado ou contrato nesta fase (a gestão ainda fala com o Mongo até a P2/P3).
- Cada item com tela tem design QA com screenshots claro/escuro, desktop/celular.

## P1-01 — Design System do playground
UI: sim            Depende (orq.): —
Objetivo: Design System aprovado pelo usuário, referência para todo item com tela.
Escopo: auditoria heurística da UI atual (`docs/design/auditoria.md`: navegação, hierarquia, formulários, feedback, consistência, acessibilidade, com prints); artifact Design System do playground (tokens shadcn para claro e escuro, tipografia, espaçamento, raio, componentes usados: botão, input, select, switch, card, tabela/lista, dialog, toast, badge de status, campo de segredo por referência); `docs/design/design-system.md` com o link e as regras de uso; artifact Design com o novo layout geral (navegação lateral, cabeçalho, área de conteúdo) que servirá à P1-03.
Fora de escopo: implementar tokens (P1-02) e rotas (P1-03).
Critérios de aceite: usuário aprova a direção visual e o layout geral (gate do `/dev-cycle`); `design-system.md` lista cada token com o valor nos dois temas e contraste AA dos pares texto/fundo.
Testes exigidos: — (item só de design; o gate final é o lint/typecheck sem mudança de código).
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
Riscos e dependências: diff grande (muitos textos); quebrar por área se passar de ~600 linhas.

## P1-05 — Estados e documentação
UI: sim            Depende (orq.): —
Objetivo: nenhuma tela em branco ou quebrada; documentação fiel ao que existe.
Escopo: estados vazio/carregando/erro do Design System nas listas, dashboard e chat; `error.tsx` e `not-found.tsx` no layout; README e `GettingStarted` sem as promessas falsas (hot reload, "disponível imediatamente", Zod, Next 14); `README_EN.md`, `README_AGNO_MANAGER.md` e `INTEGRATION.md` consolidados no README (o que sobrar é decisão do usuário); `CONTRIBUTING.md` apontando para o `/dev-cycle`.
Fora de escopo: o realtime de verdade (P4).
Critérios de aceite: orquestrador fora do ar ⇒ mensagem de erro com ação ("tentar de novo"), não tela vazia; rota inexistente ⇒ 404 do app.
Testes exigidos: componente dos três estados por lista; E2E com o fake orchestrator desligado.
Riscos e dependências: —
