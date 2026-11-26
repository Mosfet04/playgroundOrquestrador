# 0037 — Correções do QA visual e de UX de 23/11/2026

Data: 2026-11-23 · Fase: QA1 · Status: aceita

Origem: relatório de QA manual no deploy do Vercel, com 32 achados (5 P1, 12 P2, 15 P3) e 3 pontos "a confirmar". Itens em [docs/roadmap/QA1-correcoes.md](../roadmap/QA1-correcoes.md).

## D-QA1-0-1 — Como tocar os achados

Opções: **A) fase QA1 com itens agrupados por causa, cada um no `/dev-cycle`**; B) P1 no ciclo e P2/P3 direto em lotes, sem designer nem revisor; C) só escrever os itens.

Escolha: **A**. 11 itens, P1 primeiro. Perfil enxuto, com o intermediário no QA1-05 (mexe nos três formulários).

## D-QA1-02-1 — Status de conexão depois do cold start (#5)

Contexto: a [0035](0035-p4-05-configuracoes.md) D-P4-05 fixou uma leitura por carga, sem polling. Depois de um cold start o indicador fica "fora do ar" com o orquestrador respondendo.

Opções: **A) reler só fora do ar ou degradado, com backoff (5 s, 15 s, 30 s, depois 60 s) e na volta do foco**; B) reler quando outra chamada ao BFF dá 2xx; C) os dois.

Escolha: **A**. Revoga em parte a D-P4-05: online continua sem leitura extra.

## D-QA1-02-2 — Ancoragem do chat com poucas mensagens (#7)

Escolha: **embaixo, perto do composer** (padrão de chat), e não no topo.

## D-QA1-03-1 — Erro do modelo no chat (#6)

Contexto: o orquestrador não grava o run que falhou, então o erro some ao reabrir a sessão.

Opções: **A) só no playground: mensagem amigável por código, detalhes num colapsável, Reenviar, e a pergunta sem resposta marcada ao reabrir**; B) esperar um item FA que grave o erro no histórico.

Escolha: **A**. Gravar o erro no orquestrador fica para um item FA futuro.

## D-QA1-09-1 — Coluna "Atualizado" (#13)

Contexto: a API Admin devolve só o documento + `version` (`_body` em `src/presentation/routes/admin_config.py`); o `updated_at` existe no Mongo e não sai na resposta.

Opções: **A) item FA-08 no orquestrador põe `updated_at` na lista e no GET; até lá a coluna sai**; B) remover a coluna.

Escolha: **A**. O QA1-09 tem `Depende (orq.): FA-08`.

## D-QA1-06-1 — Vírgula decimal nos parâmetros do modelo (#3)

Opções: **A) a inferência converte `0,7` no número `0.7`; nome numérico conhecido com valor não numérico dá erro inline**; B) recusar a vírgula com erro inline.

Escolha: **A**.

## D-QA1-06-2 — Formato do ID (#14)

Contexto: o orquestrador aceita qualquer id.

Opções: **A) só no playground, na criação: `^[a-z0-9_-]+$` com erro inline; id existente fora do padrão continua editável**; B) A + item FA para o orquestrador recusar com 422.

Escolha: **A**.

## D-QA1-06-3 — Memória do usuário por padrão

Contexto: a criação de team começa com a memória ligada ([teamFormValues.ts](../../src/components/management/teams/teamFormValues.ts)) e a de agente, desligada.

Escolha: **desligada nos dois**.

## D-QA1-0-4 — Pontos "a confirmar"

- Markdown na mensagem do usuário: **entra** (QA1-03), com o mesmo renderer seguro do agente.
- Lembrar a aba Agente/Team no reload: **entra** (QA1-02), na URL pelo nuqs.

## D-QA1-0-5 — Modelos dos subagentes por risco

Contexto: a regra por tamanho ([0033](0033-p4-03-testar-agora.md)) punha item com vários módulos no perfil cheio (QA opus, revisor xhigh), mesmo sem risco, e item pequeno com corrida assíncrona no dev sonnet.

Opções: **A) classificar por risco: estado assíncrono, auth/segurança, rota/BFF ou `src/server` novo ⇒ dev opus/high; senão dev sonnet/high. Revisor fixo em opus/high, QA em sonnet/high (QA enxuto), revisão dos testes do QA sonnet/medium; xhigh sai do revisor**; B) manter a regra por tamanho.

Escolha: **A** (2026-11-23). Vale do QA1-02 em diante; tabela em `.claude/skills/dev-cycle/SKILL.md`. Frontmatter: revisor `effort: high`, QA `model: sonnet`.

## D-QA1-02-3 — Horário da sessão na resposta do BFF (#4)

Contexto: para a lista mostrar o horário novo de uma sessão existente, o BFF precisa devolver o `updated_at` do orquestrador. A 1ª versão do QA1-02 mandava esse valor no campo `created_at`.

Opções: **A) renomear o campo da resposta do BFF para `updated_at` (com fallback para o `created_at` do orquestrador) e o cliente ler esse nome**; B) manter `created_at` com o valor de `updated_at`.

Escolha: **A** (2026-11-24). Contrato só browser↔BFF; nada muda no orquestrador.

## D-QA1-03-0 — Designer em item de risco

Contexto: na revisão dos modelos ao abrir o QA1-03, a tabela da D-QA1-0-5 subia o designer para `sonnet/high` em item de risco, mas o risco (stream, estado do chat, segurança) está no código, não no visual.

Opções: **A) designer e design QA sempre `sonnet/medium`, reaproveitando mockups; o resto da tabela fica**; B) manter a tabela; C) perfil enxuto do roadmap (dev sonnet) no QA1-03.

Escolha: **A** (2026-11-24). O QA1-03 roda como item de risco: dev opus/high, revisor opus/high, QA sonnet/high enxuto, revisão dos testes do QA sonnet/medium (ou o orquestrador, se o delta for pequeno), designer/DQA sonnet/medium.

## D-QA1-03-2 — Quando o Reenviar aparece

Contexto: o roadmap só pede o botão; quais erros o mostram é escolha de produto. Reenviar uma pergunta órfã de sessão reaberta grava a mensagem de novo no orquestrador.

Opções: **A) todo erro com mensagem enviada, exceto cancelado pela pessoa, sem entidade e sessão de outro usuário; `aria-disabled` com motivo durante um stream; o Reenviar substitui a bolha de erro sem duplicar a pergunta**; B) todo erro, inclusive cancelado; C) só os transitórios (`overloaded`, `network`, `unavailable`, `interrupted`).

Escolha: **A** (2026-11-24), aceitando a mensagem repetida no histórico do orquestrador ao reenviar uma pergunta órfã. Design do QA1-03 aprovado na 1ª rodada ([docs/design/QA1-03.md](../design/QA1-03.md)).

## D-QA1-03-3 — Evento de erro do run no contrato BFF→browser

Contexto: para o texto cru do provedor não chegar ao browser, o BFF reescreve o evento SSE `RunError`/`TeamRunError` no stream do run.

Opções: **A) o evento vira só `{event, session_id, error: {kind: overloaded|invalidParam|other, param?, detail?}}`, com `detail` saneado; `content`, `error_type` e `additional_data` saem; os outros eventos passam byte a byte; classificação em `src/server/orchestrator/runError.ts`**; B) A mantendo também o `content` saneado.

Escolha: **A** (2026-11-24). Contrato só browser↔BFF; nada muda no orquestrador. Também aceito o desvio: o Reenviar pela marca "sem resposta" leva a pergunta para o fim da conversa, onde a resposta chega (a ordem que o orquestrador grava).

## D-QA1-03-4 — Corrida da troca de sessão e falso "sem resposta" (revisão do QA1-03)

Contexto: corrida anterior ao item, que o Reenviar piora. Clicar outra sessão deixa as mensagens da anterior na tela até o GET do histórico voltar; um envio nessa janela vai para a sessão nova, e o histórico atrasado sobrescreve o stream ao vivo. À parte, o loader descarta resposta com `content` vazio (só mídia ou tool) e a marca "sem resposta" acusa um falso órfão.

Opções: **A) corrigir no QA1-03: `getSession` não grava durante um stream e a troca de sessão esvazia a conversa ou mostra carregamento antes do GET; a marca considera a resposta gravada, não só a exibida**; B) registrar como limitação ou item novo.

Escolha: **A** nos dois (2026-11-24).

## D-QA1-03-5 — Resposta só de tool call no histórico

Contexto: com a D-QA1-03-4, um assistant sem texto conta como resposta. O agno 3 grava a mensagem de tool call (`content` vazio) do run que falha depois de uma tool, e a pergunta desse run perdia a marca "sem resposta" ao reabrir (critério 3).

Opções: **A) o BFF descarta o assistant sem texto que só tem `tool_calls`; com mídia ou sem nada continua contando; o formato da resposta do BFF não muda**; B) voltar ao filtro antigo (sem texto não conta); C) manter e aceitar a falta da marca.

Escolha: **A** (2026-11-24).

## D-QA1-03-6 — 4ª rodada para os bugs do QA (B1, B2)

Contexto: o QA do QA1-03 deu PASS com dois MINOR em `it.fails`. B1: o histórico pedido antes de um envio que chega depois do fim do run apaga a rodada nova da tela. B2: `x-goog-api-key: AIza…` e `Authorization: Basic …` não são redigidos no `detail`. O ciclo estava no limite de 3 rodadas.

Opções: **A) 4ª rodada para corrigir os dois**; B) corrigir só o B2 e registrar o B1; C) registrar os dois.

Escolha: **A** (2026-11-24).

## D-QA1-04-0 — Revisão dos modelos ao abrir o QA1-04

Contexto: pedido de revisar custo × benefício dos subagentes. Nos itens simples anteriores (QA1-01, P4-04, P4-05) a revisão aprovou na 1ª rodada só com MINOR; o custo que sobra está em chamadas que não mudam o resultado.

Opções: A) revisão dos testes do QA pelo orquestrador quando o delta for pequeno (≤ ~150 linhas), senão `sonnet/medium`; B) designer em item simples sem tela ou fluxo novo só com spec em texto e critérios mensuráveis, reaproveitando o artifact existente, sem mockup novo, e DQA só com as capturas dos critérios; C) revisor `opus/medium` em item simples; D) QA `sonnet/medium` em item simples.

Escolha: **A e B** (2026-11-24). O revisor fica em `opus/high` e o QA em `sonnet/high` (C e D recusados: perderiam achado sutil). O QA1-04 roda como item simples: designer/DQA sonnet/medium só spec, dev sonnet/high, revisor opus/high, QA sonnet/high enxuto. Tabela em `.claude/skills/dev-cycle/SKILL.md`.

## D-QA1-04-1 — Placeholder da Rota/URL (#32)

Contexto: o texto da spec (`https://api.exemplo.com/clima`, 29 caracteres) não cabe em 390 px: o input mono usa 16 px no celular (~10 px/caractere), 290 px de texto para 266 px úteis.

Opções: **A) `https://exemplo.com/api` / `https://example.com/api` (23 caracteres), cabe nas duas larguras**; B) outro texto curto; C) manter o da spec mudando fonte ou layout do campo.

Escolha: **A** (2026-11-24).

## D-QA1-05-0 — Modelos do QA1-05

Contexto: o roadmap marcava o QA1-05 como intermediário (dev opus) por mexer nos três formulários, marca anterior à regra por risco (D-QA1-0-5). Pela regra ele é simples: sem estado assíncrono, auth, BFF nem `src/server`; já existe um `FieldError` comum para consolidar.

Opções: **A) item simples: designer/DQA sonnet/medium só spec em texto, dev sonnet/high, revisor opus/high, QA sonnet/high enxuto, revisão dos testes do QA pelo orquestrador se ≤ ~150 linhas; 2+ MAJOR de regressão na 1ª revisão ⇒ dev opus na correção**; B) intermediário (dev opus/high); C) A com revisor sonnet/high.

Escolha: **A** (2026-11-25).

## D-QA1-05-1 — Altura única dos controles (#18)

Contexto: o Input tem 40 px, o Select 46 px (`p-3`) e as telas da tool forçam 36 px no desktop. O DS (regra 9, [0008](0008-design-system-direcao-visual.md)) pede 36 px a partir de `md` e 40 px abaixo; o Button padrão é `h-9`.

Opções: **A) `h-10` em todas as larguras**; **B) `h-10 md:h-9` na base de Input e SelectTrigger, apagando os overrides locais**.

Escolha: **B** (2026-11-25). O Input de agent e team passa de 40 para 36 px no desktop. Spec do QA1-05 aprovada na 1ª rodada ([docs/design/QA1-05.md](../design/QA1-05.md)).

## D-QA1-05-2 — Espaço de erro nos switches (revisão do QA1-05)

Contexto: a spec (§ 2) reserva o slot de erro (`min-h-5`) em todo campo que pode receber erro do servidor. Os 8 switches da Execução e o "Habilitar RAG" só recebem erro do 422 do orquestrador; o dev montou o slot deles só com erro.

Opções: **A) aceitar: switches sem espaço reservado; o 422 num switch empurra o conteúdo uma vez, depois do Salvar**; B) slot sempre montado também nos switches (~28 px de vão por linha).

Escolha: **A** (2026-11-25). Exceção registrada no critério do item.

## D-QA1-06-0 — Modelos do QA1-06

Contexto: validação, ID e memória são simples; o #15 (guardar a navegação com rascunho: Voltar do browser, links do shell, `beforeunload`) mexe com `popstate` e corrida de navegação no App Router, sem bloqueio nativo, e não pode quebrar o "Testar agora" (P4-03). Nos itens simples anteriores o dev sonnet trouxe 2 (QA1-04) e 4 (QA1-05) MAJOR na 1ª revisão.

Opções: **A) item de risco: dev opus/high; revisor opus/high; QA sonnet/high enxuto; designer/DQA sonnet/medium só spec em texto, reaproveitando os Dialogs existentes; revisão dos testes do QA pelo orquestrador se ≤ ~150 linhas**; B) simples com escalada (dev sonnet; 2+ MAJOR ⇒ opus); C) dois devs (sonnet para validação, opus para o #15).

Escolha: **A** (2026-11-25). Também adotado para os próximos itens: delta de correção só de MINOR/NIT e ≤ ~80 linhas é conferido pelo orquestrador, sem chamar o revisor; com BLOCKER/MAJOR, o revisor é retomado por `SendMessage` (mantém o contexto e o modelo). Tabela em `.claude/skills/dev-cycle/SKILL.md`.

## D-QA1-06-4 — O que conta como rascunho não salvo (#15)

Contexto: o aviso de rascunho precisa de um critério de "sujo". Hoje só a edição tem baseline (`hasChanges` em `useSaveReview`); a criação não tem.

Opções: **A) sujo = valores diferentes dos iniciais (entidade lida na edição; padrões na criação), comparação por valor; digitar e apagar volta a limpo; `/new` intocado não avisa**; B) `isDirty` do RHF (listas do `useFieldArray` podem ficar sujas depois de desfazer); C) qualquer digitação, sem voltar a limpo.

Escolha: **A** (2026-11-25). Spec do QA1-06 aprovada na 1ª rodada ([docs/design/QA1-06.md](../design/QA1-06.md)), só texto, sem artifact novo.

## D-QA1-06-5 — "Sair" com rascunho e node_modules defasado (revisão do QA1-06)

Contexto: (R1) o "Sair" fazia o POST de logout antes do `beforeunload`; ficar na página deixava a pessoa sem sessão, com o botão preso em "Saindo…". (R3) o `node_modules` tinha next 15.2.3, e o lockfile fixa 15.2.8; o guard do Voltar depende do interno do Next.

Escolhas (2026-11-25): **R1: o "Sair" passa pelo aviso de rascunho antes do POST** (alternativa recusada: aceitar como limitação). **R3: `pnpm install --frozen-lockfile`** (sem dependência nova, lockfile inalterado) e gates/e2e do guard de novo contra 15.2.8.

## D-QA1-06-6 — Bugs do QA do QA1-06

Contexto: QA PASS com dois MINOR em `test.fail`. QA-1: logout que falha depois de "Descartar e sair" deixa o guard desarmado (`leaving` fica `true`), e o rascunho se perde no próximo link. QA-2: dois `history.back()` na mesma tarefa JS (só com tempo sintético) deixam a URL em `/agents` com o formulário na tela.

Opções: **A) corrigir o QA-1 na 3ª rodada (rearmar o guard quando a saída não descarrega a página) e aceitar o QA-2 como limitação**; B) corrigir os dois; C) registrar os dois.

Escolha: **A** (2026-11-25).

## D-QA1-06-7 — Mensagem de ID inválido (design QA do QA1-06, 4ª rodada)

Contexto: o design QA reprovou o V8. A mensagem `common.idInvalid` (62 caracteres) quebra em 2 linhas na coluna do ID em 1367 e 390 px, e o campo seguinte desce 20 px. A regra já está na ajuda (`common.idHelp`), que também entra no `aria-describedby`. O ciclo estava no limite de 3 rodadas.

Opções: **A) 4ª rodada só de texto: "ID fora do padrão." / "ID doesn't match the format."**; B) slot do ID com 2 linhas reservadas na criação (`min-h-10`); C) aceitar o desvio e ajustar o V8.

Escolha: **A** (2026-11-25).

## D-QA1-07-0 — Modelos do QA1-07

Contexto: o item mexe com referência de segredo em header e com a regra de host confiável do orquestrador, além do mapeamento do 422 no BFF e do fake. Nos itens simples, o dev sonnet trouxe 2 MAJOR (QA1-04) e 4 MAJOR (QA1-05) na 1ª revisão. O dev opus do QA1-06 passou na 1ª revisão só com MINOR.

Opções: **A) item de risco: dev opus/high; revisor opus/high; QA sonnet/high enxuto; designer/DQA sonnet/medium só com spec em texto; delta só de MINOR com até ~80 linhas e testes do QA com até ~150 linhas conferidos pelo orquestrador**; B) simples com escalada (dev sonnet; 2+ MAJOR ⇒ opus); C) A com dev opus como padrão em todo item.

Escolha: **A** (2026-11-25). A tabela do `SKILL.md` fica como está.

## D-QA1-07-1 — Segredo em header só para host confiável (#10)

Contexto: na leitura do orquestrador (`_check_tool` em `config_admin_use_case.py`), um header com referência `env:`/`file:` volta 422 `headers` quando o host da rota não está na `TOOL_ROUTE_ALLOWLIST`. Isso impede que o segredo vá para um host de terceiro. O fake não tem essa regra.

Opções: **A) manter a regra: o fake ganha a mesma regra, com uma allowlist de teste; o playground explica no grupo de headers e no toast que o segredo só vale para host confiável do orquestrador; o cenário do relatório salva com o host na allowlist**; B) relaxar no orquestrador com um FA novo (segredo para qualquer host público); C) decidir depois do teste vermelho.

Escolha: **A** (2026-11-25), com a causa confirmada antes por teste vermelho. Se a causa for outra, o dev devolve um DECISAO.

## D-QA1-07-2 — Quando o modo passa sozinho para Segredo

Contexto: digitar um nome sensível troca o modo da linha para Segredo, e a troca de modo limpa o valor. A pessoa pode estar editando o nome de uma linha que já tem valor em Texto.

Opções: **A) trocar só com a linha em Texto, não oculta, sem valor, e uma vez por linha; a volta manual para Texto não é desfeita; nos outros casos fica o erro `headerSensitive` com "Usar segredo"**; B) trocar sempre que o nome vira sensível, limpando o valor.

Escolha: **A** (2026-11-25). Spec de design do QA1-07 aprovada na 1ª rodada (só texto, V1–V11).

## D-QA1-07-3 — Largura do alvo da referência na linha do header

Contexto: medido pelo dev. Em 1367 px, com a Requisição ao lado, a coluna Valor deixa 92 px ao alvo, e o placeholder precisa de 176 a 192 px. Em 390 px, sobram 173 px para 214 a 234 px de texto. V2 e V3 da spec falham.

Opções: **A) em Segredo, o par formato+alvo vai para uma 2ª linha, na largura toda, no desktop; no celular fica lado a lado, e os placeholders perdem o "ex.:" (`OPENAI_API_KEY`, `/secrets/key`, também em agent/team); V2 em 390 vira ≥ 170 px**; B) 2ª linha nas duas larguras (no celular, formato em cima e alvo embaixo); C) manter o layout.

Escolha: **A** (2026-11-25).

## D-QA1-07-4 — Salto de layout na troca de modo

Contexto: a troca de modo mexe na altura do slot da linha. Sai a faixa "Usar segredo" e entra "Gravada como", e entra o aviso da troca automática. A linha seguinte se move de 48 a 68 px. A troca manual já faz isso desde o P3-05.

Opções: **A) aceitar; V4 e V10 passam a medir só que nada se move enquanto o modo fica o mesmo (erro aparecendo ou sumindo)**; B) altura fixa reservada no slot.

Escolha: **A** (2026-11-25).

## D-QA1-07-5 — Troca automática no prefixo sensível

Contexto: levantada pelo revisor. A troca dispara no prefixo sensível de um nome maior (`X-Api-Key-Id`, `X-Token-Type`). Quando o nome deixa de ser sensível, o aviso some, e a linha fica em Segredo, com o valor vazio.

Opções: **A) manter (spec e D-QA1-07-2): a pessoa volta a Texto à mão**; B) linha trocada automaticamente, ainda vazia, volta a Texto quando o nome deixa de ser sensível.

Escolha: **A** (2026-11-25). Rever se o uso real reclamar.

## D-QA1-07-6 — Design QA do QA1-07: salto do 422 e título "Valor"

Contexto: o design QA passou de V1 a V9 e no V11. O V10 falhou só no 422: o erro do grupo, com 2 a 3 linhas, empurra a 1ª linha de header 20 px em 1367 e 40 px em 390; ao editar, o erro some e a linha volta. Além disso, no desktop, o título de coluna "Valor" fica sobre a coluna vazia das linhas em Segredo, por causa da D-QA1-07-3.

Opções: **A) aceitar: o erro do grupo pode crescer o slot, porque só aparece depois de Salvar e leva o foco e a rolagem até ele; o V10 é emendado; o título "Valor" fica**; B) reservar a altura do slot do erro do grupo (40 px em 1367, 60 px em 390) e esconder o título com tudo em Segredo.

Escolha: **A** (2026-11-25). O design QA vira PASS com a emenda.

## D-QA1-08-0 — Modelos do QA1-08

Contexto: o item é simples pela regra de risco (dashboard e horário do `/settings`; sem estado assíncrono, auth, BFF nem `src/server`). Com o dev sonnet, a 1ª revisão trouxe 2 MAJOR (QA1-04) e 4 MAJOR (QA1-05), todos de CSS ou layout, pegos pelo revisor opus. Com o dev opus, QA1-06 e QA1-07 passaram só com MINOR.

Opções: **A) simples com escalada: designer/DQA sonnet/medium só com spec em texto, reaproveitando o artifact existente; dev sonnet/high; revisor opus/high; QA sonnet/high enxuto; 2+ MAJOR na 1ª revisão ⇒ dev opus na correção**; B) A com dev opus/high desde o começo; C) a tabela atual, sem escalada.

Escolha: **A** (2026-11-25). Item pequeno e localizado: o revisor opus segura a qualidade, e uma rodada extra de delta custa menos que um dev opus do começo ao fim.

## D-QA1-08-1 — Legenda do donut "Sessões por tipo" (#11)

Contexto: os rótulos externos do donut ficam cortados em 1367 px e 390 px e saem do gráfico.

Opções: **A) legenda HTML própria abaixo do donut, centralizada, igual em desktop e mobile**; B) à direita em lg+ e abaixo no mobile; C) `<Legend/>` nativa do recharts.

Escolha: **A** (2026-11-25).

## D-QA1-08-2 — Série zerada na "Atividade por tempo" (#11)

Contexto: a série de team, com valor 0, é desenhada por último e cobre o traço do agente, e a cor parece trocada.

Opções: **A) série sem valor no período não é desenhada nem entra na legenda, como no donut**; B) desenhar por baixo e manter na legenda.

Escolha: **A** (2026-11-25).

## D-QA1-08-3 — Formato do "Lido em" (#12)

Contexto: o "Lido em" do `/settings` herda o fuso do servidor; o Histórico usa o do navegador.

Opções: **A) só trocar para o fuso do navegador, mantendo a hora com segundos (`timeStyle: 'medium'`)**; B) igual ao Histórico (data média + hora curta); C) data curta + hora com segundos.

Escolha: **A** (2026-11-25).

## D-QA1-08-4 — Descrição do card "Sessões por tipo" (revisão do QA1-08)

Contexto: a V2 diz que, com 0 sessões de team, o texto "team" não aparece no card; a descrição estática é "Distribuição de sessões entre agentes e teams".

Opções: **A) texto neutro na chave existente: "Distribuição das sessões por tipo" / "Session distribution by type"**; B) manter, lendo a V2 só como dado de série.

Escolha: **A** (2026-11-25).
