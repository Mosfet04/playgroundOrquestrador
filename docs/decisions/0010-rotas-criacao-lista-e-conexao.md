# 0010 — P1-03: rota de criação, escopo da lista e status da conexão

Data: 2026-10-15 · Decidido por: usuário (Mateus) · Item: P1-03 (D-P1-03-1..3)

Contexto completo, prós e contras: `docs/design/P1-03.md` (seção Decisões). Spec do P1-03 aprovada na 1ª rodada, sem artifact novo (reusa o layout da P1-01).

| Decisão | Opções | Escolha |
|---|---|---|
| D-P1-03-1 rota de criação | A) `/agents/new` e `/tools/new` ("new" vira id reservado, validado no P3); B) `?novo=1` na lista; C) criação em estado interno | **A** |
| D-P1-03-2 tabela/linhas da lista (V11/V12) e excluir no editor | A) entram no P1-03; B) no P1-03 só nome e "Editar" viram links, o resto vai para o P1-05 junto com V13 | **B** |
| D-P1-03-3 status da conexão no rodapé da navegação | A) agora, pelo store do playground; B) rodapé sem status até o BFF expor a saúde (P2-03/P4-05) e sem host em V1 | **B** (o host sai de V1 de vez) |
