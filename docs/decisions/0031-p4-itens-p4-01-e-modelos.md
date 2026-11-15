# 0031 — P4 em itens, recorte da P4-01 e modelos dos agentes

Data: 2026-10-28 · Fase: P4 · Status: aceita · Ajusta [0021](0021-modelos-dev-sonnet-qa-enxuto.md)

## D-P4-1 — Como rodar a P4

Contexto: a P4 só existia em nível de fase (um parágrafo em `P2-P5.md`); FA-04 e FA-05 estão concluídos.

Opções: **A) arquivo `P4-realtime.md` com P4-01 a P4-05 no molde, um ciclo e um commit por item**; B) detalhar só a P4-01.

Escolha: **A**. Itens em [P4-realtime.md](../roadmap/P4-realtime.md).

## D-P4-01-1 — Escopo da P4-01

Contexto: o orquestrador devolve a revisão no header `Runtime-Revision` das escritas e em `runtime_revision` do `/admin/health` (chave admin); 422 sem campo com `error_type` = configuração não monta, runtime anterior no ar; 5xx depois de gravar = gravada sem troca (o `POST /admin/config/reload` recupera).

Opções: **A) enxuto: `runtimeRevision` nas escritas, códigos próprios para "não aplicada" e "não confirmada", status no editor e indicador global lido por `GET /api/orchestrator/runtime` na abertura e depois de cada escrita, sem polling**; B) A + botão "Recarregar runtime" (`POST /admin/config/reload`); C) A + polling do indicador.

Escolha: **A**. Recarregar e polling ficam fora (o reload pode entrar na P4-05).

## D-P4-01-2 — Motivo da falha

Contexto: o orquestrador não dá motivo legível: `detail` fixo e `error_type` (nome da exceção da montagem).

Opções: **A) mensagem própria (i18n) + `error_type` como detalhe técnico, só se for identificador (`^[A-Za-z_][A-Za-z0-9_.]{0,79}$`); nunca o `detail`**; B) só a mensagem própria.

Escolha: **A**.

## D-P4-01-3 — Revisão da escrita até a casca

Opções: **A) contexto React no `AppShell` com `{ revision, setRevision }`: o indicador busca a rota ao montar e o editor grava o `runtimeRevision` da resposta, sem request extra**; B) mesmo contexto expondo só `refresh()` (rebusca após a escrita); C) server component no layout + `router.refresh()`.

Escolha: **A** (dois usos reais: casca e editores).

## D-P4-2 — Modelos e prompts dos agentes

Contexto: com o dev em sonnet as rodadas subiram (P3-01..06: 1, 1, 2, 3, 3, 3) e o revisor opus/xhigh achou 1–2 MAJOR reais em quase todo item; o QA sonnet não achou bug de produção de P2-04 a P3-06. Nenhum prompt citava performance. O usuário pede dev especialista, QA crítico e revisor criterioso, com qualidade acima do custo.

Opções: **A) dev opus/high em item com UI ou BFF de porte (sonnet só em item pequeno sem UI, sem exceção por item); QA opus/high crítico e adversarial, com as regras de enxugamento da 0021; revisor opus/xhigh; designer e design QA em sonnet; os princípios (sem over-engineering, clean code, arquitetura, performance) nos três prompts e autorrevisão do dev antes do HANDOFF**; B) só dev opus; C) só prompts.

Escolha: **A**. Frontmatter de `.claude/agents/` e tabela do `.claude/skills/dev-cycle/SKILL.md` atualizados; reavaliar ao fim da P4 com os tokens e as rodadas por item.

## D-P4-01-4 — Editor depois de salvar

Contexto: salvar com sucesso volta à lista (P1-05b); o status "aplicada" persistente no editor e o "Testar agora" da P4-03 exigem o editor na tela depois do 200.

Opções: **A) a edição fica no editor (formulário vira o documento salvo, com a versão nova, status "aplicada", foco no Salvar); a criação segue voltando à lista, com a revisão no toast**; B) A + a criação também fica (`router.replace` para o editor da entidade nova, status atravessando a rota); C) sempre volta à lista ("aplicada" só no toast).

Escolha: **A**. Design da P4-01 aprovado na 1ª rodada ([spec](../design/P4-01.md)).
