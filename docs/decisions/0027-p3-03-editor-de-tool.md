# 0027 — Recorte da P3-03 (editor de tool HTTP)

Data: 2026-10-25 · Fase: P3 · Status: aceita

## D-P3-03-1 — `default_value` do parâmetro

Contexto: o orquestrador grava `default_value`, mas não o usa na chamada (`http_tool_factory.py`): não entra no JSON Schema do modelo nem preenche argumento ausente.

Opções: **A) editar, convertido pelo tipo declarado (integer/float ⇒ número, boolean ⇒ booleano, object/array ⇒ JSON; inválido recusado no cliente; vazio ⇒ ausente), usado como exemplo no preview, com aviso de que o orquestrador não o envia sozinho**; B) só preservar o gravado, preview com `{nome}`.

Escolha: **A**.

## D-P3-03-2 — Placeholder da rota sem parâmetro obrigatório

Contexto: rota com `{x}` sem parâmetro obrigatório `x` não dá 422; a gravação passa e o orquestrador descarta a tool ao montar o runtime (só log, `_invalid_route_placeholders`).

Opções: **A) bloquear no cliente: erro na rota com os nomes que faltam, ação de um clique para criar o parâmetro obrigatório (tipo string), parâmetro usado na rota marcado como obrigatório**; B) aviso não bloqueante.

Escolha: **A**.

## D-P3-03-3 — Header sensível em texto

Contexto: o orquestrador recusa valor novo em texto para `Authorization`, `Proxy-Authorization`, `Cookie` e sufixo `-Key`/`_Key`/`-Token`/`_Token` (422 no grupo `headers`, sem dizer qual).

Opções: **A) recusar também no cliente, com a mesma regra de nomes, erro na linha pedindo `env:`/`file:` (prefixos de `api_key_ref.formats`); o valor não sai do browser**; B) só dica e o 422 do orquestrador.

Escolha: **A**. Custo aceito: a regra de nomes fica duplicada (o orquestrador segue como a autoridade).

## D-P3-03-4 — Modelos dos agentes

Contexto: pedido de menor consumo sem perda de qualidade; a P3-03 é menor que a P3-02 e reaproveita os padrões dela.

Opções: **A) designer sonnet, dev sonnet; revisor opus/xhigh; QA e design QA sonnet**; B) designer opus, dev sonnet.

Escolha: **A**. Redes de segurança: aprovação do design pelo usuário, revisor opus e design QA.

## Aprovação do design

Spec [docs/design/P3-03.md](../design/P3-03.md) aprovada na 1ª rodada, com os três pontos do §9: preview em coluna lateral fixa a partir de `xl` (página `max-w-6xl`); Salvar não desabilitado por placeholder faltante (envio recusado, foco no erro); extras de header repetido/vazio, aviso de origem alterada com header oculto e "Manter oculto".
