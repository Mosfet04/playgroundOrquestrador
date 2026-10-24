# 0023 — Dashboard pelo `/metrics` do AgentOS

Data: 2026-10-24 · Item: P2-05 · Status: aceita

Contexto comum: o `GET /metrics` do orquestrador (chave admin) devolve agregados por dia (`DayAggregatedMetrics`: sessões e runs de agent/team, `users_count` único do dia, `token_metrics`, `model_metrics`). Não há granularidade de hora nem quebra por agente.

## D-P2-05-1 — Card "Tokens por agente/team"

Opções: **A) esconder até a F8 do orquestrador (métricas por agente)**; B) manter o card com aviso de indisponível; C) somar tokens das runs com uma chamada por agente/team (N chamadas, lento).

Escolha: **A**. Sai também a rota `/api/dashboard/tokens`, que só alimentava o card.

## D-P2-05-2 — Filtro de período

Opções: **A) granularidade de dia (Hoje, 7d, 30d, 90d; sai 1h), valendo para todos os cards de período via `starting_date`**; B) sem filtro, janelas fixas (hoje e 7 dias).

Escolha: **A**.

## D-P2-05-3 — "Usuários únicos"

Opções: **A) pico diário no período ("máx. usuários/dia")**; B) soma dos dias ("usuários-dia", conta a mesma pessoa várias vezes); C) esconder o card.

Escolha: **A**: não infla o número.

## D-P2-05-4 — Modelo do dev

O usuário pediu o modelo de menor gasto que mantenha a qualidade máxima dos dados e do código. Aplicada a regra da [0021](0021-modelos-dev-sonnet-qa-enxuto.md): o item reescreve rotas existentes (nenhuma nova) e cria um módulo em `src/server`, então o dev roda em sonnet, e a revisão em opus/xhigh continua como rede de segurança do mapeamento de dados e da chave admin.

## D-P2-05-5 — Agregados do `/metrics` defasados

Contexto (revisão): no agno 2.5.8 o `GET /metrics` só lê a coleção de agregados; o recálculo existe só em `POST /metrics/refresh` (chave admin), e nada no orquestrador o chama. Sem refresh, "Hoje" fica em 0 e os outros períodos param no último recálculo; o dashboard Mongo antigo era ao vivo.

Opções: **A) o BFF chama `POST /metrics/refresh` antes do GET, no máximo 1x/min por processo; falha do refresh não impede a leitura**; B) mostrar `updated_at` e botão "Atualizar" (UI e rota novas); C) refresh periódico num item FA novo do orquestrador (números velhos até lá).

Escolha: **A**. O GET do BFF passa a ter efeito colateral idempotente no orquestrador (upsert por data); o limite de frequência contém o custo.
