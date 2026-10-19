# Design QA P1-04b — evidências

`next dev` (porta 3100) + fake orchestrator (7790) da árvore staged fc9ebd3, em 2026-10-17. Viewport 1440×900 e 390×844, com `deviceScaleFactor` 1. O endpoint e o tema vêm do `localStorage` e o idioma vem do cookie `locale`. O script ficou no scratchpad, fora do repo.

| PNG | Estado | Critérios |
|---|---|---|
| 01-desktop-light-pt-BR-vazio | chat vazio e sessões vazias | 1, 2, 4 |
| 01-desktop-dark-en-vazio | idem, em EN | 1, 4 |
| 03-desktop-dark-pt-BR-toolcall-erro | raciocínio, tool call e bolha de erro com o detail do orquestrador (`page.route`) | 1, 2, 4 |
| 03b-desktop-dark-en-erro-apos-troca | a mesma bolha depois de trocar para EN | 6 |
| 04-desktop-light-pt-BR-modal-foco | modal "Excluir sessão", foco por Tab em "Excluir" | 2, 7 |
| 04b-toast-exclusao | toast de falha (o fake não tem DELETE: 404) | 4 |
| 05a / 05b-mobile-light-pt-BR | composer com texto e "Enviar"; painel no Sheet | 3 |
| 06a / 06b / 06c-desktop-dark | antes da troca, depois da troca em EN com o stream preso, e stream concluído | 5 |
| 06d / 06e-mobile-dark | Sheet aberto depois da troca; stream concluído com o rascunho mantido | 5 |
| 07a / 07b-mobile-dark-pt-BR | orquestrador fora | 3, 4 |

## Rodada 2 (tree 2da0227)

| PNG | Estado | Resultado |
|---|---|---|
| 08-virgula-1440-light-pt-BR | frase do chat vazio | a vírgula fica depois da marca, sem espaço antes |
| 08b-virgula-1440-zoom-pt-BR | o mesmo em 3x | o `scale-125` não se sobrepõe à vírgula (folga de ~3 px) |
| 08-virgula-390-dark-pt-BR / 08-virgula-390-light-en | 390 px | quebra limpa, vírgula colada na marca no pt-BR, overflowX 0 |
| 08-virgula-1440-dark-en | EN | idêntico à rodada 1: diff de pixels de toda a viewport contra `01-desktop-dark-en-vazio` = vazio |
| 09-modal-en | modal "Delete session" | fechar com o nome "Close"; em pt-BR, "Fechar" (DOM) |

## Rodada 1 — verificado no DOM, sem screenshot
- texto visível e `aria-label`, `placeholder`, `alt` e `title` de cada estado;
- `scrollWidth - innerWidth = 0`;
- tooltips "Raciocínio" e "Chamadas de tool";
- toaster com o rótulo "Notificações alt+T" e toast "Informe uma URL válida";
- nomes acessíveis "Excluir sessão "<título>"" e "Enviar".
