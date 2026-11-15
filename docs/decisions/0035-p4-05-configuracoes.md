# 0035 — P4-05: configurações da plataforma

Data: 2026-11-15 · Fase: P4 · Status: aceita

## D-P4-05-1 — Modelos dos agentes

Contexto: o P4-05 é grande pela regra da [0033](0033-p4-03-testar-agora.md) D-P4-03-1: página nova, rotas novas no BFF e indicador na casca. No P4-04, o perfil intermediário ([0034](0034-p4-04-historico.md) D-P4-04-1) custou ~1,5M tokens equivalentes a sonnet, contra ~3,3M do perfil da 0031 no P4-02, sem bug grave em produção.

Opções:
- **A) Intermediário:** dev opus/high, revisor opus/high, QA sonnet/high enxuto, designer e design QA sonnet/medium.
- B) Enxuto: dev em sonnet.
- C) A 0031 sem desvio.

Escolha: **A**. O intermediário passa a ser a regra para item grande e substitui a 0031 nesse caso.

## D-P4-05-2 — Versão do orquestrador

Contexto: o contrato não expõe a versão. O `"2.0.0"` está fixo no `FastAPI(...)` e só aparece no `/openapi.json` quando a documentação está ligada.

Opções:
- **A) A página sai sem versão, e isso fica registrado como limitação.** Se for preciso, um item FA expõe a versão no `/admin/health`.
- B) Ler `info.version` do `/openapi.json`.
- C) Pausar o P4-05 até sair um FA com a versão.

Escolha: **A**.

## D-P4-05-3 — "Recarregar runtime"

Contexto: o `POST /admin/config/reload` relê o store e troca o runtime, devolvendo `runtime_revision`. Com store YAML, é o único jeito de aplicar uma mudança feita no arquivo. A P4-01 deixou essa ação fora (D-P4-01-1).

Opções:
- **A) Incluir na `/settings`:** botão com confirmação; a rota POST confere Origin; a revisão nova vai ao indicador da casca sem novo request.
- B) Deixar fora.

Escolha: **A**.

## D-P4-05-4 — Status de conexão na navegação

Contexto: a [0019](0019-status-conexao-p4-05.md) deixou o indicador global para este item. A P4-01 já mostra a revisão do runtime no rodapé da navegação, lida uma vez por carga, e mostra "indisponível" quando a leitura falha. O `/admin/health` responde 503 com o corpo inteiro (checks e `runtime_revision`) quando um check falha.

Opções:
- **A) Reusar o indicador, lido uma vez por carga e sem polling, com três estados:** online (revisão N), degradado (503 com corpo) e fora do ar. Os detalhes ficam na `/settings`.
- B) Reusar o indicador como está; o degradado conta como indisponível.
- C) Polling.

Escolha: **A**.

## D-P4-05-5 — Botão "Atualizar" na seção Orquestrador

Contexto: o designer propôs um botão "Atualizar", fora das decisões anteriores. Ele refaz só a leitura de saúde, sem polling, e atualiza o indicador da casca. Sem ele, os checks ficam velhos depois do "Recarregar runtime" e da recarga "não confirmada".

Opções:
- **A) Manter.**
- B) Remover: uma leitura por carga.

Escolha: **A**. Design aprovado na 1ª rodada.

## D-P4-05-6 — Falha do "Recarregar runtime"

Contexto: no orquestrador, `POST /admin/config/reload` não mapeia erro. Uma falha de montagem sobe antes da troca e vira 500 genérico, e o runtime anterior continua servindo. A spec previa um 422 dentro do diálogo (V13), que nunca chegaria.

Opções:
- **A) Tirar o 422.** O 5xx da recarga fecha o diálogo com a faixa "não confirmada" e o botão Atualizar, o padrão das escritas da P4-01. O V13 sai e a falta do 422 fica registrada como limitação. Um item FA pode mapear o erro para 422 depois.
- B) Manter o 422 tratado, que só o fake exercitaria.
- C) Pausar o P4-05 por um FA.

Escolha: **A**.

## D-P4-05-7 a D-P4-05-12 — Contrato do BFF (levantadas pelo dev)

- **D-P4-05-7 A:** `GET /api/orchestrator/runtime` passa a devolver a saúde completa. O provider da casca guarda a leitura, e a `/settings` a lê do contexto, sem request próprio. O "Atualizar" refaz essa leitura. Opções recusadas: B) `/status` novo no lugar do `/runtime`; C) uma rota a mais só para a página, o que daria duas leituras.
- **D-P4-05-8 A:** formato `200 { success, data: { status: 'healthy'|'degraded', revision, responseTimeMs?, checks: { database, memory: { status, usagePercent?, availableGb? }, telemetry } } }`.
  - O 200 do orquestrador vira `healthy`, e o 503 com corpo válido vira `degraded`.
  - O zod exige `runtime_revision` e `checks`.
  - Um check ausente, `error`, `unhealthy` ou desconhecido vira `'error'`.
  - `message` e `provider` não passam, então saem da spec o "Provedor: X", a mensagem da memória e o "degradado sem N".
  - Qualquer outra falha cai em `orchestratorError`, e o indicador mostra "fora do ar".
  - Opções recusadas: B) `provider` filtrado por regex; C) 503 com `data`.
- **D-P4-05-9 A:** `CallOptions.acceptStatus?: number[]` no `callOrchestrator`: os status listados passam pelo schema como 2xx, e o resultado traz o `status`. Só o health usa essa opção. Opção recusada: B) `fetch` próprio no `health.ts`.
- **D-P4-05-10 A:** `POST /api/config/reload`, com o cliente `reloadConfig` em `adminConfig.ts`. Respostas:
  - 200 ⇒ `{ success: true, runtimeRevision }`;
  - 200 sem revisão válida ⇒ 502 `invalid_response`;
  - 5xx ⇒ 502 `not_confirmed`;
  - rede ou prazo ⇒ 503/504;
  - 401/403 do orquestrador ⇒ 502.

  Na UI, `not_confirmed` e `invalid_response` dão a faixa "não confirmada" com Atualizar, e 503/504 dão a faixa de erro. Opções recusadas: B) 200 sem número; C) `/api/orchestrator/reload`.
- **D-P4-05-11 A:** o fake ganha `POST /test/health?mode=healthy|degraded|down`, usado só num spec novo, num projeto Playwright próprio que roda sozinho no fim. Opção recusada: B) `page.route` no browser.
- **D-P4-05-12 A:** a escrita ou o reload trocam só a revisão do indicador. O estado de saúde muda só por leitura (a carga da página ou o Atualizar), então o indicador e a página nunca se contradizem. Opção recusada: B) ir para "online", como a spec previa.

## Rodada 2 — achados menores, QA-1 e R4

Contexto: revisão, QA, revisão dos testes do QA e design QA aprovaram. Restaram:
- os MINOR R1 a R4 do revisor;
- o MINOR Q1 e os NIT Q2 a Q5 da revisão dos testes;
- a divergência QA-1 do design QA.

Os pontos e as escolhas:
- **D-P4-05-QA-1 A:** no Sheet do celular, o indicador ganha alvo de 44 px (`min-h-11`), com o mesmo texto; o desktop fica com 24 px. Opção recusada: B) 24 px.
- **R4 A:** em 401/403, a seção de erro mostra o código do BFF, como diz a spec §4. Opção recusada: B) código fixo como limitação.
- **Escopo A:** corrigir R1 (Recarregar desabilitado durante o Atualizar), R3 (o fake volta a `healthy` no setup e o `/status` fica fora do modo `down`), Q1, N1 e Q2 a Q5.
- Ficam fora: R2, que não se confirmou (o e2e passou 3 vezes fora da CI); N2, porque renomear espalharia a mudança; N3, herdado da P4-01 e sem efeito. Opções recusadas: só QA-1 e R4; fechar sem rodada 2.
