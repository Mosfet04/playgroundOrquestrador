# QA1 — Correções do QA visual e de UX de 23/11/2026

Origem: relatório de QA manual em `https://playground-orquestrador.vercel.app` (Chrome desktop 1367×889, mobile 390×844, claro/escuro, pt-BR/EN), com 32 achados numerados (#1–#32) e 3 pontos "a confirmar". Decisões em [0037](../decisions/0037-qa1-correcoes.md). Ordem: P1 primeiro. Todo defeito começa com um teste vermelho que o reproduz.

Perfil de modelos ([0033](../decisions/0033-p4-03-testar-agora.md) D-P4-03-1 e [0035](../decisions/0035-p4-05-configuracoes.md) D-P4-05-1): **enxuto** (designer/DQA sonnet/medium, dev sonnet/high, revisor opus/high, QA sonnet/high) salvo onde o item diz **intermediário** (dev opus/high).

| Item | Achados | UI | Perfil |
|---|---|---|---|
| QA1-01 | #1, #29, #30 | não | enxuto |
| QA1-02 | #4, #5, #7, aba lembrada | não | enxuto |
| QA1-03 | #6, markdown do usuário | sim | enxuto |
| QA1-04 | #2, #16, #22, #24, #32 | sim | enxuto |
| QA1-05 | #8 (erro de campo), #9, #18, #19, #31 | sim | intermediário |
| QA1-06 | #3, #14, #15, memória | sim | enxuto |
| QA1-07 | #10 | sim | enxuto |
| QA1-08 | #11, #12 | sim | enxuto |
| QA1-09 | #13 | não | enxuto |
| QA1-10 | #8 (lista), #17, #20, #21, #25 | sim | enxuto |
| QA1-11 | #23, #26, #27, #28 | sim | enxuto |

## QA1-01 — Shell fixo: só o conteúdo rola
UI: não            Depende (orq.): —
Objetivo: header e sidebar nunca saem da tela; só `main#conteudo` rola (#1, P1).
Escopo:
- [AppShell.tsx](../../src/components/layout/AppShell.tsx): `main#conteudo` com `relative`, para os inputs nativos ocultos do Radix (`<select aria-hidden>` do Select, `<input aria-hidden>` do Switch, `position:absolute`) terem o `main` como containing block. `html`/`body` travados na altura da viewport (`h-dvh overflow-hidden`), sem rolagem do documento.
- Header mobile opaco (#29): fundo por token, sem translucidez que deixe o conteúdo rolado aparecer por baixo.
- Navegação com feedback (#30): `loading.tsx` nas rotas do `(app)` usando o skeleton que já existe, para o clique na sidebar mostrar carregamento na hora.
Fora de escopo: layout interno das páginas.
Critérios de aceite:
- Em `/tools/new` com parâmetro criado pela rota (`/anything/{order_id}` → Criar parâmetro), em `/agents/new` ligando "Habilitar RAG" e numa tool que volta 422: `window.scrollY === 0` e `document.documentElement.scrollHeight === innerHeight`; header e sidebar visíveis; Salvar/Cancelar alcançáveis rolando o `main`.
- Header mobile em 390 px sem conteúdo visível por baixo, nos dois temas.
- Clique num item da sidebar mostra o indicador de carregamento antes da página nova.
Testes exigidos: e2e (Playwright) dos três cenários de rolagem em 1367×889 e 390×844 (vermelho antes); e2e do indicador de carregamento com resposta atrasada do fake.
Riscos e dependências: Sheet, Dialog e Popover do Radix usam portal no `body`; conferir que continuam posicionados e roláveis com o `body` travado.

## QA1-02 — Playground: sessões, status de conexão, ancoragem e aba
UI: não            Depende (orq.): —
Objetivo: a lista de sessões e o status refletem o estado real sem recarregar (#4, #5, P1), as mensagens ficam perto do composer (#7) e a aba Agente/Team sobrevive ao reload.
Escopo:
- #4: depois de enviar (sessão existente ou nova, agente ou team), a lista de sessões continua com a sessão ativa destacada e o horário atualizado. Hoje ela esvazia ("Nenhuma sessão ainda…") até o reload. Achar a causa com teste vermelho; a lista é estado do servidor, não duplicar no zustand.
- #5 (D-QA1-02-1): com o status fora do ar ou degradado, o indicador relê `/api/orchestrator/runtime` com backoff (5 s, 15 s, 30 s, depois a cada 60 s) e na volta do foco da aba. Online: nenhuma leitura extra. Revoga em parte a D-P4-05 da 0035.
- #7 (D-QA1-02-2): poucas mensagens ficam ancoradas embaixo, perto do composer; o espaço vazio fica no topo. O scroll automático para a última continua.
- Aba Agente/Team na URL (nuqs), como o resto do estado navegável do playground (D-QA1-0-4).
Fora de escopo: polling com o status online.
Critérios de aceite:
- Abrir a sessão "Ola", enviar ⇒ a lista mostra "Ola" destacada com o horário novo, sem reload; idem numa conversa nova com outro agente.
- Health falha na carga e volta depois ⇒ o indicador passa a "online · rev. N" sozinho (relógio falso no teste); online ⇒ uma leitura só.
- Sessão com 1 mensagem: a bolha fica logo acima do composer.
- Reload com a aba Team ativa volta na aba Team.
Testes exigidos: componente/hook da lista depois do envio (vermelho antes); unit do backoff com fake timers; e2e do envio com a lista e da aba no reload.
Riscos e dependências: estado assíncrono zustand × nuqs já deu corridas em cadeia na P4-03; o dev entrega a matriz de corridas (resposta atrasada, desmontagem, Voltar/Avançar, clique duplo) antes de codar.

## QA1-03 — Chat: erro do modelo legível e markdown do usuário
UI: sim            Depende (orq.): —
Objetivo: erro do modelo vira mensagem que a pessoa entende e pode reenviar (#6), e a mensagem do usuário renderiza markdown (D-QA1-0-4).
Escopo:
- D-QA1-03-1 (só no playground): o BFF classifica o erro do run num código próprio (sobrecarga/limite do provedor, parâmetro inválido do modelo, outro) sem repassar texto cru. O chat mostra a mensagem amigável por código, um colapsável "Detalhes técnicos" com o texto do provedor saneado (sem stack, sem URL interna do orquestrador) e o botão **Reenviar**.
- Ao reabrir a sessão, a mensagem do usuário que ficou sem resposta (duas do usuário seguidas, ou a última sem resposta) ganha a marca "sem resposta" e o Reenviar. O orquestrador não grava o run que falhou; gravar fica para um item FA futuro.
- Bolha do usuário com o mesmo renderer de markdown seguro do agente (sem `rehype-raw`, `rehype-sanitize` estrito).
Fora de escopo: persistir o erro no histórico do orquestrador.
Critérios de aceite:
- 503 "high demand" do provedor ⇒ "O modelo está sobrecarregado. Tente de novo em instantes." + detalhes + Reenviar; o Reenviar manda a mesma mensagem na mesma sessão.
- Erro pydantic de parâmetro ⇒ mensagem própria que cita o parâmetro, sem o texto pydantic fora do colapsável.
- Reabrir a sessão depois do erro ⇒ a pergunta sem resposta aparece marcada, com Reenviar.
- Backticks e listas na mensagem do usuário renderizam; HTML cru continua texto.
- Copy pt-BR/EN, tokens do design system.
Testes exigidos: BFF (classificação por código, nada cru na resposta); componente do erro e da marca "sem resposta"; e2e com cenário de erro 503 no fake; teste de segurança do markdown do usuário (HTML e `javascript:`).
Riscos e dependências: o formato do erro varia por provedor; classificar pelo payload real do fake e cair em "outro" quando não reconhecer.

## QA1-04 — Textos longos truncados
UI: sim            Depende (orq.): —
Objetivo: nome longo nunca vaza do contêiner nem quebra o layout (#2 P1, #16, #22, #24, #32).
Escopo:
- #2: seletor "Conversar com" com `min-w-0` + `truncate` no texto, `shrink-0` no chevron, `title` com o nome completo; dropdown com `max-width` e itens truncados.
- #16: placeholder do composer curto ("Mensagem para {nome}", com o nome truncado) numa linha, sem cobrir o chip "para …" em 390 px.
- #22: tabela de agentes com `table-layout: fixed` e nome truncado (com `title`); breadcrumb truncado; cards de membros do team com altura igual e título no tamanho dos demais; título do estado vazio do chat truncado.
- #24: chip `{param}` do preview da tool com `whitespace-nowrap`.
- #32: placeholder da Rota/URL que cabe no campo de meia largura.
Fora de escopo: mudar o layout das páginas além do truncamento.
Critérios de aceite: com um nome de 110 caracteres, em 1367 px e 390 px, nada sai do contêiner (bounding box do texto e do chevron dentro do card), o dropdown não passa da largura máxima, o nome completo fica no `title`/`aria`, e as colunas da tabela não mudam de largura.
Testes exigidos: e2e com fixture de nome longo no fake medindo bounding boxes nos pontos acima.
Riscos e dependências: `truncate` em flex precisa de `min-w-0` em toda a cadeia; o teste mede, não confia na classe.

## QA1-05 — Padrão único de campo e de erro nos formulários
UI: sim            Depende (orq.): —            Perfil: intermediário
Objetivo: todo campo de formulário tem a mesma altura, fundo e estado de erro, acessível (#8 parte do erro, #9, #18, #19, #31).
Escopo:
- Um padrão de erro para agent, team e tool: borda de erro + texto + ícone, `aria-invalid` e `aria-describedby` apontando a mensagem. Espaço da mensagem reservado (`min-h`), para o erro aparecer e sumir sem empurrar o conteúdo nem desviar o clique seguinte.
- Altura igual para Input, Select e badge na mesma linha (#18: Provedor/Método HTTP 46 px × Input 40 px; linha de header da tool 40/36/24 px).
- Fundo igual para Input, Textarea e Select (#19), por token.
- Switch desabilitado distinguível do ativo no tema escuro (#31, "Expor raciocínio").
- Se o padrão pedir um token novo ou mudança de token, vira DECISAO (direção visual).
Fora de escopo: regras de validação novas (QA1-06).
Critérios de aceite:
- Todo campo inválido nos três formulários tem `aria-invalid="true"`, borda de erro, ícone e mensagem ligada por `aria-describedby`.
- Mostrar e esconder o erro não muda a posição (y) do campo seguinte.
- Controles da mesma linha com a mesma altura; fundos iguais; switch desabilitado com contraste visível nos dois temas.
Testes exigidos: componente do padrão de campo (aria e mensagem); e2e medindo o y do campo seguinte antes e depois do erro e as alturas da linha; screenshot nos dois temas no design QA.
Riscos e dependências: mexe nos três formulários; manter o foco no 1º campo com erro no 422 (P3-02/P3-03).

## QA1-06 — Regras de validação e rascunho
UI: sim            Depende (orq.): —            Depende: QA1-05 (padrão de erro)
Objetivo: o formulário recusa o que quebra em runtime e não perde rascunho (#3 P1, #14, #15) e a memória começa desligada.
Escopo:
- #3 (D-QA1-06-1): na inferência de tipo dos parâmetros do modelo, `0,7` vira o número `0.7` e o chip mostra "número". Parâmetro com nome numérico conhecido (`temperature`, `top_p`, `top_k`, `max_*`, `seed`, `frequency_penalty`, `presence_penalty`) e valor que não é número mostra erro inline e bloqueia o salvar.
- #14 (D-QA1-06-2): ID de agent, team e tool na criação com `^[a-z0-9_-]+$` e erro inline; o placeholder segue o padrão. Id existente fora do padrão continua editável.
- #15: alteração não salva ⇒ confirmação ao clicar em Voltar, em links da navegação e no `beforeunload`. Salvar ou descartar libera.
- Memória do usuário desligada por padrão na criação de agent e team (D-QA1-06-3); hoje o team começa ligado em [teamFormValues.ts](../../src/components/management/teams/teamFormValues.ts).
Fora de escopo: validar o id no orquestrador.
Critérios de aceite:
- `temperature` = `0,7` ⇒ PUT com `0.7` (número); `temperature` = `abc` ⇒ erro inline, sem request.
- ID `QA Agente #1` ⇒ erro inline, sem request; editar um id legado fora do padrão salva.
- `/agents/new`, digitar o nome, Voltar ⇒ confirmação; confirmar descarta, cancelar fica.
- Criação de team sem tocar na memória ⇒ `user_memory_active: false`.
Testes exigidos: unit da inferência e da validação; componente do ID; e2e do aviso de rascunho e do PUT com `0.7`.
Riscos e dependências: o App Router não bloqueia navegação nativamente; interceptar os links internos do shell sem quebrar o "Testar agora" (P4-03).

## QA1-07 — Headers da tool
UI: sim            Depende (orq.): — (se a causa estiver no orquestrador, vira DECISAO)            Depende: QA1-05
Objetivo: o header em modo Segredo salva, e o erro, quando houver, aparece no header certo (#10).
Escopo:
- Reproduzir com teste vermelho: `Authorization` em modo Segredo `env:QA_TOKEN_API_KEY` volta 422 "O orquestrador recusou algum header e não diz qual". Pela leitura de `_check_headers` no orquestrador a referência é válida; achar o que o playground manda de fato.
- 422 de headers: mensagem perto do header (e rolagem até ela), toast com o motivo e não só "(código 422)".
- "Usar segredo" não mostra "Informe o alvo da referência" antes de a pessoa digitar (erro só depois de tocar ou salvar).
- Modo Segredo: o input do alvo com largura útil (o select `env:`/`file:` estreito), placeholder inteiro.
- Nome sensível (`Authorization`, `*-token`…): ao digitar o nome, o modo passa para Segredo sozinho, com aviso curto.
Critérios de aceite: o cenário do relatório salva contra o fake com a regra do orquestrador; o 422 de header cai visível no grupo; nenhum erro antes da interação; o placeholder do alvo aparece inteiro em 1367 px e 390 px; digitar `Authorization` troca o modo.
Testes exigidos: BFF/unit do corpo enviado (vermelho antes); componente do header; e2e do salvar com segredo.
Riscos e dependências: o fake precisa da mesma regra de header do orquestrador real; conferir no código do orquestrador antes de mudar o fake.

## QA1-08 — Dashboard e horário das Configurações
UI: sim            Depende (orq.): —
Objetivo: gráficos sem corte nem cor trocada (#11) e horário no fuso do navegador (#12).
Escopo:
- Donut "Sessões por tipo": legenda no lugar dos rótulos externos; fatias com 0 escondidas; sem card vazio na primeira pintura.
- Linha "Atividade por tempo": a série com valor desenhada por cima; cores pelos tokens de gráfico ([0009](../decisions/0009-tokens-tema-graficos-e-tamanho.md)).
- `/settings` "Lido em" no fuso do navegador, como o Histórico.
Critérios de aceite: nenhum rótulo cortado em 1367 px e 390 px; 0 sessões de team ⇒ sem fatia e sem rótulo de team; 1 sessão de agente e 0 de team ⇒ o ponto visível tem a cor da série agente; "Lido em" bate com o relógio local (teste com `TZ=America/Sao_Paulo`).
Testes exigidos: componente dos gráficos com dados de uma série zerada; unit/componente do horário com fuso fixo; screenshot no design QA.

## QA1-09 — Coluna "Atualizado" nas listas
UI: não            Depende (orq.): FA-08 (a criar: `updated_at` no corpo da lista e do GET de `/admin/config/*`)
Objetivo: a coluna mostra quando o item mudou (#13, D-QA1-09-1).
Escopo:
- Hoje o orquestrador devolve só o documento + `version` (`_body` em `admin_config.py`); o `updated_at` existe no Mongo e não sai na resposta.
- Até o FA-08: a coluna "Atualizado" sai das listas de agents, teams e tools.
- Depois do FA-08: zod aceita `updated_at`, a coluna volta com a data no fuso do navegador; snapshot OpenAPI atualizado.
Critérios de aceite: item recém-criado mostra a data do save; documento sem `updated_at` (store YAML) mostra "–".
Testes exigidos: unit do mapeamento; componente da coluna; fake com `updated_at`.

## QA1-10 — Listas e formulários estáveis e alinhados
UI: sim            Depende (orq.): —
Objetivo: header das listas e largura dos formulários iguais entre páginas, sem salto de layout (#8 parte da lista, #17, #20, #21, #25).
Escopo:
- #8: chips "N agentes / N ativos / N inativos" com skeleton durante busca e carregamento, sem desmontar; "Novo …" não muda de y.
- #21: Teams e Tools com os chips mesmo vazios; filtro "Apenas ativos" em Tools; busca com a mesma largura nas três.
- #20: Agente, Team e Tool com a mesma largura de formulário e o "Voltar" na mesma posição (a coluna de preview da tool cabe no mesmo contêiner).
- #17: diff do Histórico ocupa a altura disponível do drawer.
- #25: card "Tools disponíveis" com título e estado vazio no tamanho dos outros cards e link "Criar tool".
Critérios de aceite: o y de "Novo …" é o mesmo nas três listas e durante a busca; o x do "Voltar" é o mesmo nos três formulários; o diff ocupa o drawer sem scroll interno quando cabe; o estado vazio de tools tem o link.
Testes exigidos: e2e medindo as posições; componente do estado vazio.

## QA1-11 — Textos e rótulos
UI: sim            Depende (orq.): —
Objetivo: a UI em pt-BR não mistura inglês e o provedor tem um nome só (#23, #26, #27, #28).
Escopo:
- #23: provedor exibido do mesmo jeito no Playground, nas listas e no Dashboard (rótulo legível + modelo); dropdown com rótulo e descrição curta para os pares confusos (`gemini`/`google`, `azure`/`azureopenai`), mantendo o id gravado.
- #26: "teams de agents", "Os agents que o líder…", "Buscar agent", "Config store" em pt-BR consistente (glossário no i18n).
- #27: Início com os botões de ação numa coluna à direita alinhada, altura do card estável ao marcar feito e "Desfazer".
- #28: aba "Team" desabilitada com tooltip "Crie um team primeiro" (acessível por teclado).
Critérios de aceite: nenhum termo em inglês nas telas pt-BR além dos nomes próprios do glossário; o mesmo provedor com o mesmo rótulo nas três telas; os botões do Início com o mesmo x; tooltip da aba por hover e foco.
Testes exigidos: teste de i18n que acusa as chaves pt-BR com os termos proibidos; componente do rótulo de provedor; e2e do Início e da aba.
