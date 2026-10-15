# Design QA — P1-02 (Tokens claro/escuro)

Data: 2026-10-15. Build de produção (`pnpm build` + `next start -p 3100`, Mongo falso) e fake orchestrator em `:7790`, sem rede externa (`page.route`). Gestão com fixtures em `/api/agents*`, `/api/tools*`, `/api/dashboard/*` (script de captura fora do repo). `desktop-` = 1440×900, `mobile-` = 390×844; `-light-`/`-dark-` = tema gravado; `*-01-inicio` = primeira visita (Sistema). Todos os PNG desta pasta são da rodada 2.

## Resultado

| Rodada | Veredito | Resumo |
|---|---|---|
| 1 | FAIL | DQ1 (alta): `border` sem cor caía no gray-200 do Tailwind (`rgb(229,231,235)`) em Card, Badge e header do ToolForm, nos dois temas; no escuro, contorno quase branco. DQ2 (baixa): CardTitle 18/600 em Agentes/Tools. D-P1-02-5: h1 com −0,025em (`tracking-tight` padrão) contra −0,01em do DS |
| 2 | **PASS** | Correções: `* { @apply border-border }` em `globals.css`; `text-lg` removido dos CardTitle; D-P1-02-5 = A (`letterSpacing.tight -0.01em`, `widest 0.08em`, decisão 0009) |

Medições da rodada 2 (início, dashboard, agentes, tools, nos dois temas): bordas só em `--border` (claro `rgb(221,226,234)`, escuro `rgb(31,37,50)`) e `--input`, nenhuma em gray-200; CardTitle 16/600; h1 24/600 com `letter-spacing -0.24px` (= −0,01em); KPI Plex Mono 30/500.

## Critérios

| Critério | Status | Evidência |
|---|---|---|
| V-P1-02-1, 2, 4/5/6 (troca, recarga, sem flash), 17, 18, 19, 20; anel do 1º Tab; contraste AA | PASS (automático) | e2e `tokens.spec.ts`, `theme.spec.ts`, grep. Confirmado aqui: trigger 40 px e textarea 16 px no celular; aurora só no escuro (`desktop-dark-01-inicio.png`) |
| V-P1-02-3 seletor | PASS | `desktop-*-01-inicio.png`, `desktop-*-02-seletor-tema.png`, `mobile-*-02-seletor-tema.png` |
| V-P1-02-4 toast no escuro | PASS | `desktop-dark-06-agentes-erro.png` |
| V-P1-02-7 sem bloco preto/branco | PASS (r2) | `desktop-*-05-agentes.png`, `desktop-*-08b-form-tool-header.png`, `desktop-*-09c-dashboard-tooltip.png`, `desktop-*-01-inicio.png` (selo "0 de 3") |
| V-P1-02-8 Selects | PASS | `desktop-*-07-form-select-provider.png` |
| V-P1-02-9 botão primário | PASS | medido: claro `#2b57d9`/branco, escuro `#7397ff`/`rgb(6,11,28)`, `shadow-glow` no hover; `desktop-*-05-agentes.png` |
| V-P1-02-10 foco | PASS | `desktop-*-12a4-tab-gestao.png`; medido anel 2 px `ring` + offset 2 px em nav, Select e botão; Input e textarea com borda `primary` + glow |
| V-P1-02-11 tipografia | PASS (r2) | medições acima; `desktop-*-05-agentes.png`, `desktop-*-09c-dashboard-tooltip.png` |
| V-P1-02-12 StatusBadge e chips | PASS | `desktop-*-05-agentes.png` |
| V-P1-02-13 ícones/avatares | PASS | `desktop-*-03-playground.png` |
| V-P1-02-14 raios | PASS | medido: só 6 px e 8 px |
| V-P1-02-15 dialogs | PASS | `desktop-*-10-dialog-agente.png` (o de sessão tem o mesmo padrão; visto na rodada 1) |
| V-P1-02-16 gráficos | PASS | `desktop-*-09c-dashboard-tooltip.png` |
| V-P1-02-21 layout | PASS | comparado com `P1-01/auditoria/`: mesma estrutura, ordem e posições. Os cards de Agentes ficaram uns 24 px mais baixos (título 18 → 16 px), efeito esperado da tipografia |

## Evidência guardada (21 PNG)

`desktop-{light,dark}-`: `01-inicio`, `02-seletor-tema`, `03-playground`, `05-agentes`, `07-form-select-provider`, `08b-form-tool-header`, `09c-dashboard-tooltip`, `10-dialog-agente`, `12a4-tab-gestao`; `desktop-dark-06-agentes-erro`; `mobile-{light,dark}-02-seletor-tema`.

## Fora do critério (não bloqueia)

- Eixo Y do gráfico de tokens corta números grandes; já era assim (P2-05).
- No celular, o botão do menu cobre o início do h1 e o "Sidebar" do chat; o X cobre o logo no menu aberto; igual à auditoria (P1-03).
- Ícone do toast de sucesso em `foreground` (padrão do sonner).

## Não verificado

- Tela 13 (`prefers-reduced-motion`) e troca ao vivo: cobertas pelo e2e.
- Ícones de reasoning/referências e logos de provedor: o fake não gera esses casos.
- Sidebar do playground aberta no celular: só vista atrás do dialog de sessão na rodada 1 (captura não guardada).
