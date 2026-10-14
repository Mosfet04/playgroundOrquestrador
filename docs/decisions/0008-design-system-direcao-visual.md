# 0008 — Design System: cor, fonte e densidade

Data: 2026-10-14 · Decidido por: usuário (Mateus) · Item: P1-01 (D-P1-01-1 a D-P1-01-4)

Contexto completo, prós e contras: `docs/design/P1-01.md` (blocos DECISAO).

| Decisão | Opções | Escolha |
|---|---|---|
| D-P1-01-1 cor primária | A) azul de operação #2251cc / #82a7ff; B) monocromático neutral; C) laranja Agno escurecido | **A** |
| D-P1-01-2 família tipográfica | A) Geist + Geist Mono; B) IBM Plex Sans + IBM Plex Mono; C) pilha do sistema | **B** (a recomendação era A) |
| D-P1-01-3 self-host da fonte | A) `next/font/local` com woff2 + OFL.txt em `src/app/fonts/`; B) pacote `geist`; C) `@fontsource-variable/*` | **A** (sem dependência nova; fecha a 0004) |
| D-P1-01-4 densidade | A) compacta 32 px / 13 px; B) padrão new-york 36 px (40 no celular), linha 52 px, 14 px; C) confortável 40 px | **B** |

## Aprovação do design (rodada 2)

O usuário pediu, na rodada 1, um visual "tecnológico e bonito, para atrair interesse no público". Na rodada 2 aprovou a direção, o layout e os itens novos: `--primary-soft`, `--signal`, `shadow-glow`, gradiente da marca, aurora (só no escuro), grade de pontos, estilos mono `overline`/`chip`/`kpi`, `page-title` 24 px, `--radius` 8 px, paleta inteira retocada (primária refinada para #2b57d9 / #7397ff), navegação de 256 px e o status da conexão na navegação.

- Fonte: incluir também `IBMPlexSans-Italic.woff2` (400 itálico), para a ênfase do Markdown.
- Escopo: o novo visual do chat (V14, V15 da spec) vira o item **P1-06**, depois da P1-03.
