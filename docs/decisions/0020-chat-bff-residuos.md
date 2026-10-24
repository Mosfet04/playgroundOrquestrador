# 0020 — Chat via BFF: crypto-js, stream cru e abort ao trocar de conversa

Data: 2026-10-24 · Item: P2-03 · Status: aceita

## D-P2-03-2 — `crypto-js` sem uso

Contexto: o único uso (hash do id do cliente com o FingerprintJS) saiu no P2-03.

Opções: **A) remover `crypto-js` e `@types/crypto-js` neste item**; B) manter até um item de limpeza.

Escolha: **A**.

## D-P2-03-3 — Campos do stream repassados ao browser

Contexto: o histórico é filtrado no servidor (sem instruções e memórias), mas o stream do run é repassado cru; o `RunCompleted` traz `session_state`, `metadata`, `model_provider_data`, `reasoning_messages`, `additional_input`.

Opções: **A) aceitar e registrar como limitação (usuário único admin; filtrar exige parsear e reescrever cada evento no servidor)**; B) filtrar no servidor agora (perde o repasse de bytes sem buffer, item maior).

Escolha: **A**. Rever se o playground ganhar mais de um usuário ou papéis.

## D-P2-03-4 — Abort do run

Contexto: fechar a aba já aborta o run no orquestrador; trocar de entidade ou "Nova conversa" no meio do run não aborta (comportamento anterior ao item); não há botão Parar.

Opções: **A) `AbortController` no stream: aborta ao trocar de entidade, abrir nova conversa ou sair da página; botão Parar fora (feature nova)**; B) só registrar a limitação; C) abort + botão Parar agora (UI nova sem design).

Escolha: **A**.
