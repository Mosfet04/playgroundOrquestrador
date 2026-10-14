# 0003 — Node mínimo 22.18 (fake orchestrator em TS sem dependência)

Data: 2026-10-14 · Decidido por: usuário (Mateus) · Item: P0-03 (D-P0-03-1)

## Contexto

O fake orchestrator (`e2e/fake-orchestrator/server.ts`) roda com `node` puro no `webServer` do Playwright. O Node executa `.ts` sem flag (type stripping) só a partir da 22.18 / 23.6; o `engines` aceitava 20.19 e 22.13–22.17. O Node 20 saiu de suporte em 30/04/2026.

## Opções

- A) `server.mjs` em JS com `// @ts-check` — roda em todo o `engines`, tipagem mais fraca.
- **B) `engines` = `^22.18.0 || >=24.0.0`** — `.ts` roda com `node`, sem dependência.
- C) `tsx` como devDependency — mais uma dependência para um arquivo.
- D) subir o fake no `globalSetup` do Playwright — sai do `webServer`, não roda à mão.

## Decisão

B. `engines` passa a `^22.18.0 || >=24.0.0`; READMEs atualizados. O fake usa só TS apagável (sem `enum`, sem parameter properties).
