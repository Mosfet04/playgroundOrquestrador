# 0034 — P4-04: histórico e restaurar versão

Data: 2026-11-14 · Fase: P4 · Status: aceita

## D-P4-04-1 — Modelos dos agentes neste item

Contexto: o P4-04 é grande pela regra da [0033](0033-p4-03-testar-agora.md) D-P4-03-1 (6 rotas novas no BFF, fake e painel novo no editor), o que levaria à 0031: dev e QA em opus e revisor em opus/xhigh. Com esse perfil, o P4-02 custou ~3,3M tokens equivalentes a sonnet. O P4-03, enxuto, custou ~650k, e o revisor em opus/high achou o bug grave.

Opções: **A) intermediário: dev opus/high (BFF com sessão, Origin e If-Match), revisor opus/high, QA sonnet/high enxuto, designer e design QA sonnet/medium**; B) enxuto, como o P4-03 (dev em sonnet); C) a 0031 sem desvio.

Escolha: **A**, só neste item. Medir tokens e rodadas no fechamento para decidir se o perfil intermediário vira regra para item grande.

## D-P4-04-2 — Restaurar com edição não salva

Contexto: restaurar opera sobre a versão salva, e o editor passa ao documento restaurado.

Opções: **A) o diálogo avisa "Você tem edições não salvas no formulário. Restaurar as descarta." e restaura**; B) bloquear Restaurar até salvar ou cancelar; C) mesclar as edições sobre o restaurado.

Escolha: **A**.

## D-P4-04-3 — Restaurar em entidade inativa

Contexto: o documento antigo pode ter `active` diferente do atual, então restaurar pode reativar ou desativar a entidade.

Opções: **A) permitir; o diff do diálogo mostra a linha de ativação**; B) bloquear Restaurar em entidade inativa.

Escolha: **A**.

## D-P4-04-4 — 412 no restaurar

Contexto: o "Salvar por cima" do `ConflictDialog` (P3-06) salvaria o formulário, não a restauração.

Opções: **A) modo restaurar no `ConflictDialog`: "O seu valor" é a versão escolhida, "Atual" é a versão corrente, e a única ação é "Recarregar a versão atual" (a pessoa reabre o histórico e restaura de novo)**; B) "Restaurar por cima" reenviando com o ETag novo; C) reusar o `ConflictDialog` sem mudar.

Escolha: **A**: restaurar por cima desfaria o trabalho de outra pessoa sem revisão.

## D-P4-04-5 — Formato da entrada do histórico no BFF

Contexto: o orquestrador devolve por entrada o `diff` de topo (`before`/`after`) e o `document`. A spec mostra linhas no formato do formulário (Temperatura, Prompt com janela de texto).

Opções: **A) o BFF devolve `document` e `previous` no formato do formulário, sem o diff cru; a tela reusa `diffAgent/Team/Tool` (payload ~2× o prompt por entrada, até 20 por página)**; B) repassar o diff cru de topo e o `document`; a tela mostra campos de topo.

Escolha: **A**.

## D-P4-04-6 — Versão em que só mudou valor oculto de header

Contexto: os dois lados chegam com `***` e o formulário não vê diferença. A spec não cobre o caso.

Opções: **A) a linha mostra "A mudança não aparece no formulário (por exemplo, o valor oculto de um cabeçalho).", sem chips nem "Ver alterações"; Restaurar continua**; B) chip com o nome do campo e "valor oculto alterado", lendo também o diff cru.

Escolha: **A**.

## D-P4-04-7 — Badge da versão no editor

Contexto: o mockup aprovado mostra "vN" ao lado do título do editor, atualizado ao restaurar (V11); o editor não mostrava a versão.

Opções: **A) badge neutro "vN" ao lado do título nos três editores, atualizado no Salvar e no Restaurar**; B) sem badge; V11 vale só para o `ApplyStatus`.

Escolha: **A**.

## Rodada 2 — achados menores e QA-1

Contexto: revisão, QA e design QA aprovaram. A revisão curta dos testes do QA achou o Q1 (MAJOR): o diário do fake nunca é limpo, e os e2e com id fixo quebram na 2ª execução local com o fake reaproveitado. O R2 da revisão tem a mesma causa. Restavam os MINOR R1 (lista retida com o Sheet fechado) e Q2–Q8, e a observação QA-1: restaurar uma entidade excluída em outra aba dá 404, com a mensagem de versão fora do histórico, porque o orquestrador devolve o mesmo 404 nos dois casos.

Opções: **A) a rodada 2 corrige Q1, R1–R4 e Q2–Q8**; B) só o Q1. Para o QA-1: **A) registrar como limitação**; B) mensagem genérica.

Escolha: **A** e **A**.
