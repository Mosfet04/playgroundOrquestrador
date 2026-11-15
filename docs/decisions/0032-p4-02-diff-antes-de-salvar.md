# 0032 — P4-02: diff antes de salvar

Data: 2026-11-04 · Fase: P4 · Status: aceita · Spec: [P4-02](../design/P4-02.md), aprovada na 1ª rodada

Modelos dos agentes no ciclo: mantida a configuração da [0031](0031-p4-itens-p4-01-e-modelos.md) D-P4-2, para ter o 2º ponto de comparação antes da reavaliação no fim da P4.

## D-P4-02-1 — Salvar sem mudança

Contexto: o item pede o Salvar desabilitado sem mudança. O `disabled` nativo tira o botão do Tab e do leitor de tela, e a P4-01 devolve o foco ao Salvar logo depois de gravar.

Opções: A) `disabled` nativo + dica (padrão do projeto; muda o foco aprovado na P4-01); **B) `aria-disabled` + dica visível ligada por `aria-describedby`, com guarda no `onSubmit`**.

Escolha: **B**. Em só leitura e com o schema pendente o Salvar segue `disabled` de verdade, sem dica.

## D-P4-02-2 — Criação

Contexto: criar não tem versão lida, logo não há "antes".

Opções: **A) sem diálogo: valida e envia direto, com Salvar sempre ativo**; B) diálogo com todos os campos preenchidos; C) diálogo só com o que difere dos defaults do schema.

Escolha: **A**.

## D-P4-02-3 — Texto longo no diff

Contexto: a `DiffList` recolhe nas 4 primeiras linhas; se a edição do prompt está depois delas, as duas caixas parecem iguais até "Mostrar tudo". Vale também para o conflito 412, que usa a mesma lista.

Opções: A) como está; **B) janela de 4 linhas a partir da linha anterior à primeira que difere, com "… N linhas iguais acima"; "Mostrar tudo" abre o texto inteiro (varredura do prefixo comum, O(n), sem dependência nem token)**; C) diff por palavra com realce (algoritmo próprio ou dependência nova, tokens novos).

Escolha: **B**. Muda o conteúdo das células longas do conflito da P3-06; a aparência é a mesma.

## D-P4-02-4 — `tools_ids` e `member_ids` na comparação

Contexto: `idsRow` trata a mesma lista em outra ordem como diferença. A UI são caixas de seleção, então marcar e desmarcar reordena a lista e acenderia o Salvar sem mudança real. O orquestrador repassa a ordem recebida (`team_factory_service._resolve_members`), mas nenhuma tela permite escolhê-la.

Opções: **A) comparar como conjunto: só conta item adicionado ou removido, e o tipo de célula `order` sai**; B) manter a ordem.

Escolha: **A**. No conflito 412, uma diferença só de ordem cai no aviso "sem diferenças visíveis", que já existe.

## D-P4-02-5 — Trecho igual dentro da janela

Contexto: a revisão mostrou que a janela da D-P4-02-3 conta linhas lógicas e o corte conta linhas visuais (cerca de 120 caracteres na coluna de 228 px). Em prompt em parágrafos, a mudança caía na linha visual 7 a 9 e as caixas pareciam iguais até "Mostrar tudo".

Opções: A) manter e corrigir a limitação no roadmap; **B) manter a janela e, com mais de ~40 caracteres iguais antes da 1ª diferença dentro dela, cortar esse trecho nas duas caixas com "…"**; C) tirar só a linha de contexto quando ela for longa (não resolve prompt de uma linha).

Escolha: **B**.

## R6 da revisão — X do diálogo de conflito

Contexto: a spec da P3-06 pede o X desabilitado ao salvar por cima; ele segue ativo, sem efeito. O P4-02 criou `closeDisabled` em `ui/dialog.tsx`, e a spec do item dizia que o `ConflictDialog` não mudava.

Opções: **A) incluir neste item (`closeDisabled={saving}`)**; B) deixar fora.

Escolha: **A**.

## D-P4-02-6 — Resposta do 200 diferente do enviado

Contexto: o BFF apara o texto e o orquestrador preenche defaults, mas agent e team não refaziam o formulário depois do 200, ao contrário da tool. Com um espaço no fim do nome, ou com o histórico vazio e desligado, o Salvar ficava aceso sem saída depois de gravar. A spec dizia que a diferença "fica assim"; o QA mostrou que isso fere o critério de listar exatamente os campos alterados.

Opções: **A) agent e team refazem o formulário com o documento salvo, e a comparação apara o que o BFF apara**; B) só aparar na comparação (o histórico vazio continua); C) manter a spec.

Escolha: **A**. O campo de histórico vazio volta a mostrar o valor salvo.

## P4-02-B3 — `\r\n` na comparação

Contexto: o textarea normaliza `\r\n` para `\n` ao sair do campo, e um prompt gravado com `\r\n` passava a contar como alterado sem edição.

Opções: **A) a comparação de texto trata `\r\n` e `\n` como iguais**; B) aceitar e documentar.

Escolha: **A**. Junto de outra edição, o PUT pode enviar `\n` sem listar essa troca; o sentido do prompt não muda.

## Fechamento — bugs menores abertos

Contexto: o item chegou ao limite de 3 rodadas com revisão, QA e design QA aprovados, e a reexecução do QA achou B6, B7 e B8 ([relatório](../qa/P4-02.md)), nenhum gravando dado errado.

Opções: **A) commitar e deixar pendência, com os testes de falha esperada**; B) corrigir só o B7 antes; C) corrigir os três antes (as duas passam do limite de rodadas).

Escolha: **A**. As pendências estão na linha `Resultado:` do item.

## Fechamento — tempo dos testes no gate

Contexto: no gate final, 2 de 2038 testes estouraram os 5 s padrão do Vitest na suíte inteira, e os mesmos arquivos passavam sozinhos (cerca de 2 s por teste). O teste que falhava mudava entre as execuções, e testes anteriores ao item também passavam de 5 s com 119 arquivos em paralelo.

Opções: **A) `testTimeout` de 15 s em `vitest.config.mts`**; B) limitar os workers; C) `{ timeout }` por teste nos lentos (cerca de 35 testes em 18 arquivos); D) repetir até passar.

Escolha: **A**. O custo real dos testes lentos continua lá; um teste que trave demora 15 s para falhar.
