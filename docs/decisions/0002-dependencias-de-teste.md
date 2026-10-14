# 0002 — Dependências de teste (P0-02)

Data: 2026-10-14 · Decidido por: usuário (Mateus)

| Decisão | Escolha | Alternativas descartadas |
|---|---|---|
| D-P0-02-1 `@testing-library/dom` (peer obrigatório de `@testing-library/react` 16 e `user-event` 14) | Declarado em devDependencies, versão exata | Deixar resolvido pelo `auto-install-peers` do pnpm |
| D-P0-02-2 `vite` 8.3.4 transitivo do `vitest` 4.1.11 (menos de 2 semanas) e aviso de peer `@types/node ^20.19` | Aceitar o vite fixado no lockfile, sem override; subir `@types/node` para 20.19.x exato | Override para vite antigo; deixar o aviso |
| D-P0-02-3 BUG-P0-02-1: ReDoS na regex de `isValidUrl` (`src/lib/utils.ts`) | Corrigir no P0-05 (hardening), trocando a regex por `new URL()` + protocolo http(s) | Item próprio; corrigir dentro do P0-02 |
| D-P0-02-4 alerta de DoS do `source-map-js` 1.2.1 (jsdom > css-tree), só no ambiente de teste | Subir o transitivo para 1.2.2 (`pnpm update source-map-js`) | Deixar e registrar |
