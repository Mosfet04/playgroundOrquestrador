# 0017 — Login: campos, aviso de sessão expirada, credencial e duração

Data: 2026-10-21 · Item: P2-01 · Status: aceita

## D-P2-01-1 — Campos da tela de login

Contexto: credencial de usuário único; o roadmap não dizia se a tela pede usuário. Afeta a env, o corpo do `POST /api/auth/login` e o `user_id` da P2-03.

Opções: A) só senha; **B) usuário + senha** (autocomplete `username`/`current-password`, erro genérico, o usuário vira o `user_id` das sessões na P2-03).

Escolha: **B**.

## D-P2-01-2 — Aviso de sessão expirada

Contexto: só o `?next=` não distingue "expirou" de "nunca entrou".

Opções: **A) o middleware acrescenta `?reason=expired` quando havia cookie de sessão inválido ou vencido; o aviso só aparece com ele**; B) sem aviso; C) aviso neutro sempre que houver `next`.

Escolha: **A**.

## D-P2-01-3 — Formato da credencial e duração da sessão

Contexto: a senha do usuário único vem da env; a sessão é um cookie assinado com `jose`.

Opções: **A) hash scrypt na env (`node:crypto`, sem dependência nova), gerado por `pnpm auth:hash`, comparação em tempo constante; sessão com expiração absoluta de 12 h, sem renovação**; B) hash scrypt + 7 dias; C) senha em claro + 12 h.

Escolha: **A**.
