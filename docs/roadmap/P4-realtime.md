# P4 — UX realtime

A config salva entra no ar sem restart (FA-04) e chega às outras réplicas pelo poll (FA-05); a UI passa a mostrar isso e a usar o histórico. Contrato: `../orquestradorIAPythonArgo/docs/roadmap/FA-admin-config.md` (FA-04 e FA-05 concluídos). Decisão da fase: [0031](../decisions/0031-p4-itens-p4-01-e-modelos.md).

Gates: os da P2 (lint, typecheck, test, contract:check, build, test:e2e, testes de segurança do BFF, nenhum segredo em `.next/static`).

Contrato usado: header `Runtime-Revision` (inteiro, revisão do processo que respondeu) em `POST`/`PUT`/`DELETE` de `/admin/config/{agents,teams,tools}`; `GET /admin/health` (chave admin) com `runtime_revision` no corpo (não tipado no OpenAPI: zod no BFF); recusa de montagem ⇒ 422 `{"detail": "Configuração não monta no runtime", "error_type"}`, sem `field`; falha depois de gravar (troca, registro) ⇒ 500, config gravada e runtime anterior no ar até a próxima escrita ou `POST /admin/config/reload`. A revisão é por processo: com várias réplicas, cada uma tem a sua.

## P4-01 — Status de aplicação e revisão do runtime
UI: sim            Depende (orq.): FA-04, FA-05
Objetivo: depois de salvar, o usuário sabe se a mudança está no ar ("Aplicada na revisão N") ou não ("Não aplicada: <motivo>", com a versão anterior ainda servindo); a casca mostra a revisão do runtime em vigor.
Escopo: BFF de agents, teams e tools: toda escrita (criar, salvar, excluir, desativar/reativar) lê `Runtime-Revision` (inteiro ≥ 0; ausente ou inválido ⇒ omitido, sem falhar a escrita) e devolve `runtimeRevision` no corpo de sucesso. 422 sem campo com `error_type` ⇒ 422 `{ success: false, error: 'not_applied', errorType? }`, com `errorType` só quando casa com `^[A-Za-z_][A-Za-z0-9_.]{0,79}$` (D-P4-01-2), nunca o `detail`; 422 com campo segue como na P2-06. 5xx do orquestrador numa escrita ⇒ 502 `not_confirmed` (a config pode ter sido gravada sem entrar no ar). `GET /api/orchestrator/runtime` (`runtime = 'nodejs'`): `/admin/health` com a chave admin pelo módulo de `src/server/orchestrator` (zod só de `runtime_revision`, inteiro ≥ 0; resto ignorado) ⇒ `{ success, data: { revision } }`, falha mapeada como nas outras rotas. Casca: contexto React no `AppShell` com `{ revision, setRevision }` (D-P4-01-3); o indicador busca a rota ao montar e mostra a revisão, carregando ou indisponível; escrita bem-sucedida chama `setRevision` com o `runtimeRevision` da resposta (sem request extra). Editores de agent, team e tool: salvar uma edição com sucesso mantém o editor (o formulário vira o documento salvo, com a versão nova) e criar segue voltando à lista com a revisão no toast (D-P4-01-4); status persistente perto do Salvar, depois da escrita: aplicada (com N), não aplicada (texto i18n + `errorType` como detalhe técnico, versão anterior no ar), não confirmada (recarregar a entidade para conferir); some na próxima edição. Excluir e desativar/reativar mostram o mesmo resultado no toast que já existe. Fake orchestrator: `Runtime-Revision` incrementado a cada escrita aceita, `runtime_revision` no `/admin/health` e um gatilho determinístico para o 422 de montagem e para o 500 depois de gravar.
Fora de escopo: botão "Recarregar runtime" (`POST /admin/config/reload`) e polling do indicador (D-P4-01-1); revisão por réplica; status de conexão do orquestrador (P4-05); diff antes de salvar (P4-02).
Critérios de aceite: salvar agent, team e tool ⇒ "Aplicada na revisão N" com o N do header e o indicador da casca com o mesmo N, sem novo request ao `/api/orchestrator/runtime` (e2e); 422 de montagem ⇒ "Não aplicada" com o tipo e a indicação de que a versão anterior segue no ar, indicador inalterado; `error_type` fora da regex ou `detail` nunca chegam ao browser; 5xx na escrita ⇒ "não confirmada"; header ausente ou inválido ⇒ escrita com sucesso sem número e indicador inalterado; indicador carregando e indisponível (orquestrador fora ⇒ 503/504) sem quebrar a casca; excluir e desativar atualizam o indicador; chave admin e URL do orquestrador fora das respostas e de `.next/static`; status anunciado a leitor de tela (região viva) e copy em pt-BR e EN.
Testes exigidos: BFF (header válido, ausente e inválido em cada verbo de escrita; 422 de montagem com `error_type` válido, inválido e ausente; 5xx ⇒ `not_confirmed`; rota do runtime: chave admin, 401 sem sessão, corpo inválido ⇒ 502, orquestrador fora ⇒ 503/504); componente (status do editor nos três resultados e a limpeza na edição; indicador carregando, valor e indisponível; atualização pelo contexto sem fetch); e2e (salvar agent contra o fake e ver status e indicador iguais).
Riscos e dependências: a revisão é por processo, então com réplicas o número do editor e o do indicador podem ser de processos diferentes depois de recarregar a página (aceito, sem polling); o 5xx não diz se gravou, por isso "não confirmada" e não "gravada".
Resultado: o cliente (`src/server/orchestrator/client.ts`) lê `Runtime-Revision` (`^\d{1,15}$`; outro valor some) no sucesso e, no 422 com `error_type`, marca `notBuildable` e só repassa o tipo que casa com a regex da D-P4-01-2; `adminConfig.ts` troca o 5xx das escritas por `not_confirmed` (a leitura que o PUT de agent/team faz antes segue `server_error`). `respond.ts`: `written()` devolve `{ success, data?, runtimeRevision? }` nas 4 escritas dos 3 tipos, e `configError` dá 422 `not_applied` (com `errorType` só quando veio válido) e 502 `not_confirmed`; 422 sem `error_type` segue `invalid_config`. `GET /api/orchestrator/runtime` (`health.ts`, zod só de `runtime_revision`). Casca: `RuntimeRevisionProvider` no `AppShell` lê a rota uma vez por carga, com valor e setter em contextos separados (quem grava não re-renderiza e a casca não re-renderiza); `RuntimeRevision` no rodapé da navegação e do Sheet, acima de Sair; `useApplyRevision` grava a revisão da resposta sem request (a escrita que chega antes da leitura vale). Editores: `ApplyStatus` + `useApplyStatus` (`common/`) com região viva sempre montada; a edição salva fica no editor (`controls.set`; a tool também faz `reset` para o documento salvo, que volta o header em texto a `***`), o status some pela mudança de valor do formulário (comparada aos valores de quando apareceu, para o `reset` não contar), por tool marcada, por novo Salvar e pelo início de uma ação (`onStart` do `EntityActions`); criar volta à lista com a revisão no toast; Excluir/Desativar/Reativar com a revisão, `not_applied` (sem o código, com o detalhe técnico) e `toast.warning` no `not_confirmed`. `rejectedField` passou a receber o corpo já lido (`errorBody`). Fake: revisão incremental no header, `runtime_revision` no `/admin/health` e gatilhos no nome (`[nao-monta]`, `[nao-monta-sem-tipo]`, `[falha-apos-gravar]`, `[sem-revisao]`). i18n: chave `common.sentence` (`{text}.`) para o ponto depois de `saved` (a regra de literais não aceita `.`). Limitações: `/admin/health` degradado (503 com `runtime_revision` no corpo) aparece como indisponível; timeout/queda numa escrita segue 504/503 (não vira "não confirmada").

## P4-02 — Diff antes de salvar
UI: sim            Depende (orq.): —
Objetivo: antes de enviar, o usuário vê o que muda em relação à versão lida.
Escopo: diálogo de confirmação no Salvar dos editores de agent, team e tool com os campos alterados (antes × depois) calculados no cliente a partir do documento lido e do formulário, reaproveitando a comparação do conflito 412 (P3-06); segredo nunca exibido (referência como está, `***` mantido); sem mudança ⇒ Salvar desabilitado.
Fora de escopo: diff de versões do histórico (P4-04); diff no servidor.
Critérios de aceite: o diálogo lista exatamente os campos alterados, em ordem estável; cancelar não envia request; nenhum valor de segredo no diálogo.
Testes exigidos: lib pura do diff; componente do diálogo nos três editores; e2e de editar e confirmar.
Riscos e dependências: campos com default do schema não devem aparecer como alterados.

## P4-03 — "Testar agora"
UI: sim            Depende (orq.): —
Objetivo: depois de salvar, abrir o playground com a entidade recém-salva numa sessão nova.
Escopo: ação "Testar agora" no status de aplicada (P4-01) de agent e team, que navega ao playground com a entidade selecionada por URL (nuqs) e sessão nova; entidade inativa ou não aplicada ⇒ ação ausente.
Fora de escopo: tool (não roda sozinha); manter a conversa anterior.
Critérios de aceite: a ação abre o playground com a entidade e sem histórico de sessão (e2e); voltar retorna ao editor.
Testes exigidos: componente da ação; e2e salvar → testar.
Riscos e dependências: P4-01.

## P4-04 — Histórico e restaurar versão
UI: sim            Depende (orq.): FA-05
Objetivo: ver quem mudou o quê e quando, e voltar a uma versão.
Escopo: BFF `GET /api/{agents,teams,tools}/[id]/history` (paginado) e `POST .../history/[version]/restore` com `If-Match` e `Origin`; aba ou painel de histórico no editor com versão, ator, data e diff mascarado; restaurar com confirmação e o resultado de aplicação da P4-01; store YAML ⇒ histórico vazio e restaurar indisponível (409).
Fora de escopo: diff entre duas versões quaisquer; retenção do histórico.
Critérios de aceite: histórico do fake listado com diff; restaurar aplica e mostra a revisão nova; 412 abre o conflito da P3-06; 404 de versão fora do histórico; nenhum valor de header no histórico.
Testes exigidos: BFF das duas rotas (sessão, Origin, If-Match, 404, 409, 412); componente; e2e de restaurar.
Riscos e dependências: P4-01; o histórico guarda prompt inteiro (aceito pelo FA-05).

## P4-05 — Configurações da plataforma
UI: sim            Depende (orq.): FA-03, FA-04
Objetivo: uma página `/settings` com o que a plataforma oferece e a saúde do orquestrador.
Escopo: providers de chat e embedder (do `/admin/schema`), config store e se é só leitura, versão e saúde do orquestrador, status de conexão na navegação (D-P2-03-1, decisão 0019); avaliar aqui o "Recarregar runtime" deixado fora da P4-01.
Fora de escopo: editar a config da plataforma.
Critérios de aceite: página com os dados do fake; orquestrador fora ⇒ estado de erro sem quebrar a casca.
Testes exigidos: BFF, componente, e2e.
Riscos e dependências: a versão do orquestrador pode não estar exposta no contrato (conferir no início do item).
