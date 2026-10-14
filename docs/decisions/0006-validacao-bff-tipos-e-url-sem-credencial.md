# 0006 — BFF valida tipos, não valores; endpoint sem credencial

Data: 2026-10-14 · Decidido por: usuário (Mateus) · Item: P0-05 (D-P0-05-1, R5 da revisão)

## Contexto

O P0-05 valida o corpo das rotas `src/app/api/{agents,tools}/**` com zod ("tipos e allowlist de campos"). A primeira versão também restringia valores: `factoryIaModel`/`rag_factoryIaModel` aos providers do form e `http_method`/`method` a 5 métodos em maiúsculas. O orquestrador aceita mais (`openai_compatible`, aliases, plugins, maiúsculas indiferentes), então configs válidas deixavam de salvar pelo form.

Separadamente, `isValidUrl` passou a usar `new URL()` (decisão 0002) e com isso aceita `http://user:pass@host`; o endpoint escolhido fica no localStorage.

## Opções

D-P0-05-1 (valores no BFF):
- **A) Só tipos nesses campos**; enum só em `parameters[].type` (pedido pelo item). Sem regressão; validar valores fica com a API Admin (P2/P3).
- B) Enums alinhados ao orquestrador, normalizando maiúsculas — lista duplicada, não cobre plugins, normalização regrava o valor.
- C) Manter os enums — regressão em configs válidas.

R5 (credencial na URL do endpoint):
- **A) `isValidUrl` recusa URL com `username` ou `password`.**
- B) Aceitar, seguindo só o WHATWG URL.

## Decisão

D-P0-05-1 = A; R5 = A (recusar credenciais).
