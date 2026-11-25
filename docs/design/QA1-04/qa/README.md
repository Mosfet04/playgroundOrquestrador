# DESIGN_QA QA1-04: textos longos truncados

Spec: `docs/design/QA1-04.md` (V1-V11). Capturas só dos critérios (D-QA1-04-0), nome de 110 caracteres, PNG quantizado em 48 cores. As medições em px estão no e2e `e2e/long-names.spec.ts`; aqui a conferência é visual. Dados via `page.route`; o app subiu com o fake orchestrator.

VEREDITO: PASS

| Critério | Captura | Status | Observação |
|---|---|---|---|
| V1 trigger do seletor | `playground-1367-claro.png`, `playground-1367-escuro.png`, `playground-390-claro.png` | PASS | Nome termina em "…", chevron inteiro e dentro do trigger; avatar sem encolher. Anel de foco do composer não cortado. |
| V2 nome e provider/model truncados | mesmas | PASS | "Assistente de relacion…" e "ollama/modelo-com-nome…" param antes do chevron. `title` só pelo e2e. |
| V3 dropdown | `playground-dropdown-1367-claro.png` | PASS | Lista com a largura do trigger; item longo com "…" e id mono cortado ("en…"); itens com a mesma altura; check visível. |
| V4 composer | `playground-1367-claro.png`, `playground-1367-escuro.png`, `chat-vazio-390-claro.png` | PASS | "Mensagem para Assistente de relacionam…" em 1 linha; chip "para entidade-longa" abaixo, sem sobreposição, em 1367 e 390. |
| V5 tabela de agents | `agents-tabela-1367-claro.png`, `agents-tabela-1367-escuro.png` | PASS | Colunas alinhadas entre linha curta e longa; nome com "…", id mono na linha de baixo; chip do modelo "ollama/modelo-com-nome-mu…" dentro da coluna. |
| V6 breadcrumb / cabeçalho | `team-membros-1367-claro.png` (trilha), `chat-vazio-390-claro.png` (cabeçalho mobile) | PASS | Trilha com o nome longo cabe inteira em 1367 e fica antes dos controles; header de 56 px. O corte com "…" no `<p>` mobile e no 1367 estreito só pelo e2e (sem captura dedicada na §8). |
| V7 cards de membros | `team-membros-1367-claro.png` | PASS | Duas colunas, cards da mesma linha com altura igual (3 linhas de conteúdo ao lado de 1 linha); nome com "…" em 14 px; badge "Inativo" dentro do card, sem empurrar. |
| V8 estado vazio | `chat-vazio-390-claro.png` (e `playground-1367-*.png` para 1367) | PASS | "Converse com Assistente de relaci…" em 1 linha com margem lateral; 1367 também com "…". |
| V9 chip do parâmetro | `tool-preview-1367-claro.png` | PASS | Chip `{parametro_longo_...}` em 1 linha; o BOX do preview corta e rola por dentro (borda tracejada cortada à direita é o comportamento esperado). Botões "Criar parâmetro" quebram sem vazar do card. |
| V10 placeholder da Rota | `tool-rota-placeholder.png` (extra, sem nome longo) | PASS | `https://exemplo.com/api` inteiro, sem reticências, com folga (desvio D-QA1-04-1 aceito). |
| V11 sem rolagem horizontal da página | todas | PASS (visual) | Nenhuma captura mostra barra ou corte horizontal da página; medição em px no e2e. |
| Tokens e temas | pares claro/escuro de playground e agents | PASS | Só tokens (primary, muted, border, ring); contraste do texto truncado e do placeholder mantido no escuro. |

## Observações (não bloqueiam)

- `playground-390-claro.png`: a §8 pede seletor + composer, mas o Sheet cobre o composer; o composer em 390 está em `chat-vazio-390-claro.png`. Ajuste de redação da spec, não do código.
- Capturas de 1367 mostram a lista de sessões e o status "runtime" em skeleton: o fixture mocka só a lista de entidades, o estado é incidental e fora do escopo do item.
- `tool-preview-1367-claro.png` aparece com o erro de "rota usa parâmetros sem parâmetro obrigatório" porque o fixture só preencheu a rota; é a validação existente, não regressão.
- `tool-rota-placeholder.png` é captura extra (V10 pede o placeholder vazio; o nome longo não se aplica).

## Arquivos

`agents-tabela-1367-claro.png`, `agents-tabela-1367-escuro.png`, `chat-vazio-390-claro.png`, `playground-1367-claro.png`, `playground-1367-escuro.png`, `playground-390-claro.png`, `playground-dropdown-1367-claro.png`, `team-membros-1367-claro.png`, `tool-preview-1367-claro.png`, `tool-rota-placeholder.png`.
