# Design QA — P1-04 (i18n do shell e da gestão)

- Spec: [`../../P1-04.md`](../../P1-04.md) · Rodada 1 (2026-10-17): **FAIL** (F1, F2) · Rodada 2 (2026-10-17): **PASS**
- Como foi rodado: `next dev -p 3200` com `MONGO_CONNECTION_STRING=mongodb://127.0.0.1:1/ci-fake`, Chromium do `@playwright/test`. Os dados de `/api/agents*`, `/api/tools*` e `/api/dashboard*` vieram de `page.route`, com os mesmos dados de `e2e/i18n.qa.spec.ts`. O idioma veio do cookie `locale`, e o tema de `colorScheme` (tema "Sistema"). Larguras de 1440×900 e 390×844. As medidas (lang, title, caixas, foco, rolagem) foram tiradas do DOM no mesmo script.

## Telas

| # | Arquivo | Rota · largura · tema · idioma |
|---|---|---|
| 1 | `01-agents-1440-{light,dark}-ptBR.png` | `/agents` · 1440 · claro/escuro · pt-BR (sem cookie) |
| 2 | `02-agents-1440-{dark,light}-en-menu.png` | `/agents` com o menu do idioma aberto · 1440 · EN |
| 3 | `03a-agents-new-1440-light-ptBR.png` → `03b-…-{light,dark}-en.png`, `03c-…-en-bottom.png` | `/agents/new` preenchido, antes e depois da troca pt-BR → EN |
| 4 | `04-dashboard-1440-dark-en.png`, `04-…-activity.png`, `04b-…-light-en.png` | `/dashboard` · EN |
| 5 | `05-dashboard-1440-light-pt-BR.png`, `05-…-activity.png`, `05b-…-dark-pt-BR.png` | `/dashboard` · pt-BR |
| 6 | `06a-agents-390-dark-en.png`, `06-sheet-390-dark-en.png`, `06b-sheet-390-light-en.png` | cabeçalho e Sheet em 390 · EN |
| 7 | `07{,b}-sheet-390-{light,dark}-pt-BR-focus.png`, `07{,b}-…-pt-BR-menu.png` → `07{,b}-…-after-switch-en.png` | Sheet em 390, Tab até o idioma e troca pelo teclado |
| + | `08-header-focus-1440-{light,dark}-en.png` | recorte do cabeçalho com foco de teclado no trigger (V-11 no desktop) |

## Critérios

| Critério | Status | Evidência | Correção sugerida |
|---|---|---|---|
| V-P1-04-1 lang | PASS | DOM: `pt-BR` sem cookie (01, 07), `en` com cookie (02, 04, 06). Na tela 3, depois da troca, `lang=en` sem recarregar (sentinela em `window` mantida) | — |
| V-P1-04-2 botão no cabeçalho | PASS | 01, 02, 04: `PT`/`EN` em mono, 36×36 em x=1340, e o tema 36×36 em x=1380, no mesmo y. Mesmo ghost nos dois temas | — |
| V-P1-04-3 opções e selecionado | PASS (rodada 2) | 02: "Português (Brasil)" e "English" nessa ordem, com `lang` em cada item e check no atual (`aria-selected`). Em 07, o trigger do Sheet mostra "Português (Brasi", cortado | F1 |
| V-P1-04-4 celular | PASS (rodada 2) | 06a: cabeçalho sem seletor (menu, título e tema). 06, 06b, 07: linha "Idioma"/"Language" abaixo de "Tema", alinhada (x=135, w=144 nas duas), mas o nome do idioma não cabe em `w-36` | F1 |
| V-P1-04-5 um idioma por tela | PASS | 01–07 sem mistura. A varredura do texto do `body` em 01 não achou termos EN. Os casos de toast e dialog estão no `e2e/i18n.qa.spec.ts` (verde) | — |
| V-P1-04-6 glossário | PASS | 01, 03, 05: "Excluir", "Provedor"/"Provider" conforme o idioma, sem "Deletar" nem "ferramenta", títulos em caixa de frase ("Informações básicas", "Agentes ativos") | — |
| V-P1-04-7 formatos | PASS (rodada 2) | 04/05: totais `1,234,567` / `1.234.567` e eixo do dia `Oct 14 · Oct 15` / `14 de out. · 15 de out.` (o dia bate com a chave, então o UTC está certo). Os eixos numéricos não passam pelo formatador: `1200` sem separador nos dois idiomas, e `0.75 · 1.5 · 2.25` com ponto decimal em pt-BR (`05-…-activity.png`) | F2 |
| V-P1-04-8 título da aba | PASS | DOM: `Agentes · Playground do Orquestrador`, `Agents · Orchestrator Playground`, `New agent · Orchestrator Playground`, `Dashboard · …` | — |
| V-P1-04-9 EN não quebra o layout | PASS | 02, 03b, 03c, 04, 06: navegação em uma linha (nenhum item com overflow), "Cancel"/"Save" com 36 px de altura sem quebra, sem rolagem horizontal em 1440 e 390 | — |
| V-P1-04-10 troca mantém o estado | PASS | 03a → 03b: rota `/agents/new`, valores `agente-qa` / `Agente QA` / `texto digitado` mantidos, foco no trigger. Durante a troca, `aria-busy=true` e `aria-disabled=true`, sem `disabled`. 07 → 07-after-switch: Sheet aberto e foco em `#language-select` | — |
| V-P1-04-11 foco | PASS | 08 (desktop) e 07/07b (Sheet): `box-shadow` com anel `ring` de 2 px sobre folga de 2 px de `background`, nos dois temas. No desktop a ordem do Tab é: pular › nav › idioma › tema | — |

A coluna Evidência acima descreve a rodada 1; o resultado da rodada 2 está na seção seguinte.

## Rodada 2

Foram refeitas só as telas afetadas, com os screenshots substituídos: Sheet em 390 nos dois temas (`06`, `06b`, `07`, `07b`, mais `07{,b}-…-menu.png`) e `/dashboard` em 1440 em pt-BR e EN (`04`, `04b`, `05`, `05b` e `…-activity.png`). O mock de tokens agora preenche `agentName`, por isso aparecem barras.

| Critério | Status | Evidência |
|---|---|---|
| V-P1-04-3 | PASS | `07b-sheet-390-dark-pt-BR-menu.png`: "Português (Brasil)" e "English" nessa ordem, com `lang` `pt-BR`/`en` e check (`aria-selected=true`) no atual. O trigger mostra "Português (Brasil)" inteiro (`07-…-focus.png`) |
| V-P1-04-4 | PASS | `06`, `06b`, `07`, `07b`: "Tema" e "Idioma" com trigger de 176 px (`w-44`) em x=103 nas duas linhas e sem texto cortado (`scrollWidth ≤ clientWidth`), nos dois temas e nos dois idiomas. Sem rolagem horizontal. Depois da troca pelo teclado, o Sheet continua aberto e o foco fica em `#language-select` (`07{,b}-…-after-switch-en.png`) |
| V-P1-04-7 | PASS | `04-…-activity.png` / `05-…-activity.png`: eixo de tokens `0 · 300 · 600 · 900 · 1,200` (EN) e `1.200` (pt-BR); eixo de sessões só com inteiros `0 · 1 · 2 · 3 · 4`; dias `Oct 14 · Oct 15` / `14 de out. · 15 de out.`; totais `1,234,567` / `1.234.567` |
| N1 (plural) | resolvido | "2 agents · 1 team · 3 in the period" / "2 agentes · 1 team · 3 no período" |

## Achados da rodada 1

**F1 (resolvido na rodada 2) — o nome do idioma é cortado no Sheet (V-3, V-4; telas 7 e 7b).** Em pt-BR, o trigger `w-36` mostra "Português (Brasi" sem reticências, e a escolha atual fica ilegível. A largura veio da spec, e a spec foi corrigida. Correção: `w-44` no `SelectTrigger` de `src/components/layout/LanguageSelect.tsx:94` e também no de `src/components/layout/ThemeSelect.tsx:99`, para os dois continuarem com a mesma largura. Cabe no Sheet: 296 − 32 de padding − rótulo ≈ 200 px livres.

**F2 (resolvido na rodada 2) — os eixos numéricos dos gráficos não são formatados (V-7, seção Formatos; telas 4 e 5).** O eixo Y de "Consumo de tokens" mostra `1200`, quando deveria ser `1,200` / `1.200`. O de "Atividade" mostra `0.75 · 1.5 · 2.25` em pt-BR, e contagem de sessões nem deveria ter fração. Correção em `src/components/management/dashboard/Dashboard.tsx`:
- `tickFormatter={(v) => format.number(v)}` nos `YAxis`;
- `allowDecimals={false}` no `YAxis` de atividade (e no de tokens, se fizer sentido).

A spec explicita isso agora no V-7.

## Fora do critério (não bloqueia)

- N1 (resolvido na rodada 2): `sessionsBreakdown` mostra "1 teams" nos dois idiomas (cartão "Sessões criadas"). Correção: plural ICU em `messages/{pt-BR,en}.json`: `{teams, plural, one {# team} other {# teams}}`, e o mesmo para `agents`.
- N2: o rótulo da pizza ("Agent sessions: 2" / "Sessões de agente: 2") sai cortado no topo do card. Vem de antes do item e é da P1-05.

## Não verificado

- O tooltip dos gráficos (precisa de hover; os eixos e as barras foram verificados na rodada 2).
- Toasts e `DeleteConfirmDialog` em screenshot: cobertos por texto no `e2e/i18n.qa.spec.ts`, não fotografados.
- O tema fixo Claro/Escuro pelo seletor: usei o tema Sistema com `colorScheme`, que cai nos mesmos tokens.
