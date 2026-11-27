# DESIGN_QA QA1-03 — PASS

Build `.next` da arvore atual (`next start` na 3100) + fake (7790). 1367x889 e 390x844, claro e escuro; EN so em 390 escuro (`09-en-390-dark.png`).
Prefixos: 01 overloaded fechado, 02 aberto, 03 Reenviar com foco, 04 invalidParam, 05 sem resposta, 06 Reenviar aria-disabled, 07 markdown, 08 HTML cru; sufixo `<d|m>-<light|dark>`.

| Critério | Status | Captura | Observação |
|---|---|---|---|
| V1 | PASS | 01-overloaded-closed-* | frase correta, cor destructive (196,40,47 claro / 255,123,114 escuro); "high demand" so no painel |
| V2 | PASS | 02-overloaded-open-* | painel mono 12px, bg muted, borda border, max-height 192px, dentro da largura da bolha |
| V3 | PASS | 04-invalidparam-* | "parâmetro temperature" em mono; pydantic so no painel |
| V4 | PASS | 03-resend-focus-*, 06-resend-disabled-* | anel ring 2px + folga 2 (box-shadow medido nos 4 temas/larguras); aria-disabled="true", title "Aguarde a resposta terminar.", vizinhos no lugar |
| V5 | nao capturado | - | coberto por teste de componente (tests/components/ChatRunError.test.tsx); nao reproduzivel no fake sem hack |
| V6 | PASS | 01/02-*-m-* | ações quebram sem corte, Reenviar 44px, scrollWidth da pagina/main = 390 |
| V7 | PASS | 05-unanswered-* | "sem resposta" (ícone+palavra, muted) + Reenviar, à direita |
| V8 | PASS (e2e) | - | coberto por e2e/chat-run-error.spec.ts; nao recapturado |
| V9 | PASS (obs.) | 07-markdown-* | inline/bloco bg card + borda 1px, link primary, lista ok. Obs.: o bloco aparece como caixas por linha (fundo no `code`), irregular, igual no agente |
| V10 | PASS | 08-html-* | `<b>oi</b>` literal, `x` sem link |
| V11 | PASS | todas, 09-en-390-dark | so tokens; EN sem corte, sem rolagem horizontal |

## Notas
- Bloco de código longo em 390 px quebra na bolha em vez de rolar (spec 3.3): aceito como desvio. Evita rolagem aninhada e a página não rola. Atualizar a spec 3.3 para "quebra linha". Obs.: no agente a linha longa NAO quebra (ultrapassa a coluna, cortada na tela), então "igual no agente" é só parcialmente verdade; é pré-existente e fora do item.
- `br` forçado: sem linha em branco extra nas capturas.
- Divergências bloqueantes: nenhuma. Sugestão opcional: `pre code` como bloco (`block rounded-md p-3`) no MarkdownRenderer para a caixa deixar de ser por linha (decisao visual, nao item).
