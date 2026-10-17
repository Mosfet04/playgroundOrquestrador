# 0012 — i18n do playground: aria-label do Toaster

Data: 2026-10-17 · Item: P1-04b

## D-P1-04b-1 — aria-label do Toaster global

Contexto: o `<Toaster>` (`src/components/ui/sonner.tsx`, fora do escopo do P1-04b) expõe o aria-label padrão do sonner, "Notifications alt+T", em inglês em todas as rotas; herança do P1-04 que conflita com o critério V-P1-04b-1.

Opções:
- A) Corrigir no P1-04b: prop `containerAriaLabel` + uma chave nos catálogos (2 linhas). Fecha o V-P1-04b-1 sem exceção.
- B) Deixar para o P1-05: escopo estrito; exceção conhecida no design QA.

Escolha: **A**. Reversibilidade alta.

## D-P1-04b-2 — toast fixo em `src/api/playground.ts` (BUG-P1-04b-1)

Contexto: com `GET /agents` falhando, `src/api/playground.ts` (fora do escopo do item) dispara `toast.error` fixo em inglês com o `statusText` do servidor e devolve `[]`; os toasts do catálogo (`agentsLoadError`, `sessionsLoadError`) nunca aparecem, contrariando o V-P1-04b-1.

Opções:
- A) Corrigir no P1-04b: tirar os toasts de `src/api` e relançar o erro para o hook mostrar a frase do catálogo; virar o `it.fails` em `it`.
- B) Deixar para o P1-05 (estados de erro), com `it.fails` registrado.

Escolha: **A**. Reversibilidade alta.

## D-P1-04b-3 — sr-only "Close" do Dialog

Contexto: o design QA reprovou o V-P1-04b-1 porque `src/components/ui/dialog.tsx` (primitivo fora do escopo) tem `<span className="sr-only">Close</span>` fixo em inglês; afeta o modal "Excluir sessão" do playground e o `DeleteConfirmDialog` da gestão.

Opções:
- A) Corrigir no P1-04b: chave `common.close` + tradução no `DialogContent`.
- B) Exceção conhecida, corrigir no P1-05.

Escolha: **A** (mesmo critério da D-P1-04b-1). Reversibilidade alta.
