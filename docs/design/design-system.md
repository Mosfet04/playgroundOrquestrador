# Design System do playground

- **Artifact (Design System):** https://claude.ai/artifact/Cy1ufZWym7KDKjgFFb7Bme — o único do playground. Atualize este, nunca crie outro.
- **Layout geral (Design):** https://claude.ai/artifact/6y3e6H3PbC77qsgNYk5UnL
- **Fonte dos valores:** [`P1-01/tokens.json`](P1-01/tokens.json) (cópia do `project/tokens.json` do artifact, versão 2). Mudou um token: mude no artifact e aqui, na mesma alteração.
- **Decisões:** [0008](../decisions/0008-design-system-direcao-visual.md) (azul de operação, IBM Plex, `next/font/local`, densidade new-york). Rodada 2: direção "produto tecnológico" (camadas escuras, realce da primária, detalhes de console). Os itens novos desta rodada estão marcados **novo** e foram aprovados (0008).

## Regras de uso

1. **Só tokens.** Cor vem das CSS vars abaixo via classes do Tailwind (`bg-card`, `text-muted-foreground`, `border-input`, `bg-primary-soft`, `text-signal`...). Proibido: hex, `rgb()`, `bg-black`, `text-white`, `text-black`, paleta crua (`green-100`), classe arbitrária de cor (`bg-[#...]`).
2. **Formato no código (P1-02).** `globals.css` declara os canais HSL de cada token em `:root` (claro) e `.dark` (escuro), no formato shadcn (`--primary: 224.8 69.6% 51%`); `tailwind.config.ts` mapeia `primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))', soft: 'hsl(var(--primary-soft))' }`, `signal: 'hsl(var(--signal))'` e assim para todos. `--radius: 0.5rem` com `lg = var(--radius)`, `md = calc(var(--radius) - 2px)`, `sm = calc(var(--radius) - 4px)`.
3. **Efeitos por token (novo).** Tudo derivado das CSS vars, sem cor literal em componente:
   - `boxShadow.glow` no Tailwind = valor de `shadow-glow` do tema (claro e escuro abaixo), escrito com `hsl(var(--primary) / α)`.
   - Gradiente da marca: `bg-gradient-to-br from-primary to-signal`. Só em marca, avatar, barra do item ativo e ilustração do estado vazio; nunca atrás de texto corrido.
   - Aurora: no tema escuro, a coluna principal tem `radial-gradient(ellipse 720px 280px at 24% 56px, hsl(var(--primary) / 0.12), transparent 70%)`. Uma regra em `globals.css` (`.dark .app-main`), não espalhada.
   - Grade de console: `radial-gradient(hsl(var(--border)) 1px, transparent 1px)` em 16 px, só atrás do estado vazio e da conversa vazia.
4. **Tema.** `next-themes` com `attribute="class"`, padrão `system`, seletor no cabeçalho com Claro, Escuro e Sistema (até a P1-03, no rodapé da navegação; ver [P1-02](P1-02.md)).
5. **Pares.** Todo texto usa um dos pares da tabela de contraste. Superfície nova ou par novo é decisão de design.
6. **Semântica.** `primary` = ação principal, item ativo, foco, link. `signal` = atividade ao vivo (stream, conexão, tool call), nunca ação nem status de entidade. `destructive`, `success`, `warning` só para o significado deles, sempre com ícone ou ponto e palavra.
7. **Foco.** `focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background` em todo elemento interativo; Input, Textarea e composer somam `border-primary shadow-glow`.
8. **Movimento.** Transições de 150 ms (cor, brilho), ponto ao vivo (1,6 s), cursor de stream, brilho do skeleton (1,4 s), ícone girando em "Salvando…". Tudo dentro de `motion-safe:` ou desligado por `@media (prefers-reduced-motion: reduce)`.
9. **Densidade (0008 = B).** Controles h-9 (36 px) no desktop e h-10 abaixo de `md`; ícone só com toque 44×44 no celular; input com `text-base` abaixo de `md`. Sem `maximumScale` no viewport.
10. **Breakpoints.** Só os padrão do Tailwind. Navegação fixa a partir de `lg` (1024 px); abaixo, Sheet. Saem `xs`, `s23`, `.mobile-*`, `.s23-optimized`.
11. **Componentes.** Button, Input (+ Label, Textarea), Select, Switch, Card, Table, Dialog (+ Sheet), Toast (sonner), StatusBadge (variante do Badge, com chip de console e ponto ao vivo) e SecretRefField. Guia de cada um no artifact.

## Tokens de cor

Valores em hex (como no artifact) e em canais HSL (como vão no `globals.css`). **Novos nesta rodada:** `--primary-soft`, `--signal`. Todos os valores mudaram em relação à rodada 1 (camadas escuras mais profundas, claro em cinza frio com cards brancos).

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--background` | `#f6f7fa` · `225 28.6% 97.3%` | `#07090e` · `222.9 33.3% 4.1%` | Fundo da página (camada 0). No escuro é o fundo profundo da vitrine. |
| `--foreground` | `#0f141c` · `216.9 30.2% 8.4%` | `#e7ebf3` · `220 33.3% 92.9%` | Texto principal sobre todas as superfícies (background, card, popover, muted, secondary, accent, primary-soft). Mínimo 13,4:1. |
| `--card` | `#ffffff` · `0 0% 100%` | `#0d1017` · `222 27.8% 7.1%` | Camada 1: navegação lateral, cards, tabela, painel do chat, composer. |
| `--card-foreground` (= `foreground`) | `#0f141c` · `216.9 30.2% 8.4%` | `#e7ebf3` · `220 33.3% 92.9%` | Texto sobre card. |
| `--popover` | `#ffffff` · `0 0% 100%` | `#131722` · `224 28.3% 10.4%` | Camada 2: menu do Select, Dialog, Sheet, Toast. |
| `--popover-foreground` (= `foreground`) | `#0f141c` · `216.9 30.2% 8.4%` | `#e7ebf3` · `220 33.3% 92.9%` | Texto sobre popover. |
| `--primary` | `#2b57d9` · `224.8 69.6% 51%` | `#7397ff` · `224.6 100% 72.5%` | Azul de operação: ação principal, ícone e indicador do item ativo, link, foco, Switch ligado. Como texto: 5,1:1 ou mais em todas as superfícies. |
| `--primary-foreground` | `#ffffff` · `0 0% 100%` | `#060b1c` · `226.4 64.7% 6.7%` | Texto e ícone sobre primary e sobre o gradiente primary→signal. No escuro é tinta escura. |
| `--primary-soft` | `#e6ecfb` · `222.9 72.4% 94.3%` | `#141d36` · `224.1 45.9% 14.5%` | Realce suave da primária: fundo do item ativo da navegação, bolha do usuário no chat, sessão ativa. |
| `--signal` | `#0b7285` · `189.3 84.7% 28.2%` | `#4dd6e8` · `187 77.1% 60.6%` | Ciano de console: indicador ao vivo, streaming, chip de tool call, fim do gradiente da marca. Texto 4,7:1 ou mais sobre background, card, muted, popover e primary-soft. |
| `--secondary` | `#eceff4` · `217.5 26.7% 94.1%` | `#1a1f2b` · `222.4 24.6% 13.5%` | Botão secundário, skeleton forte. |
| `--secondary-foreground` (= `foreground`) | `#0f141c` · `216.9 30.2% 8.4%` | `#e7ebf3` · `220 33.3% 92.9%` | Texto sobre secondary. |
| `--muted` | `#f0f2f6` · `220 25% 95.3%` | `#11151d` · `220 26.1% 9%` | Fundos discretos: skeleton, hover de linha, cabeçalho de tabela, chip de console, bloco de código. |
| `--muted-foreground` | `#566070` · `216.9 13.1% 38.8%` | `#95a0b4` · `218.7 17.1% 64.5%` | Texto secundário (descrição, ajuda, metadados, cabeçalho de coluna, placeholder) sobre todas as superfícies. Mínimo 5,3:1. |
| `--accent` | `#e9edf3` · `216 29.4% 93.3%` | `#1b2130` · `222.9 28% 14.7%` | Hover de ghost/outline e de item de navegação. |
| `--accent-foreground` (= `foreground`) | `#0f141c` · `216.9 30.2% 8.4%` | `#e7ebf3` · `220 33.3% 92.9%` | Texto sobre accent. |
| `--destructive` | `#c4282f` · `357.3 66.1% 46.3%` | `#ff7b72` · `3.8 100% 72.4%` | Excluir, erro de campo e de área, tool call com erro. Texto 5,0:1 ou mais sobre background, card, popover e muted. |
| `--destructive-foreground` | `#ffffff` · `0 0% 100%` | `#1f0606` · `0 67.6% 7.3%` | Texto sobre destructive. No escuro é tinta escura. |
| `--success` | `#17734a` · `153.3 66.7% 27.1%` | `#4fd18b` · `147.7 58.6% 56.5%` | Status Ativo, conexão online, tool call concluída. Sempre com ícone ou ponto e palavra. |
| `--warning` | `#955700` · `35 100% 29.2%` | `#f0b44c` · `38 84.5% 62%` | Status Pendente, aviso de campo (texto colado que parece uma chave). |
| `--border` | `#dde2ea` · `216.9 23.6% 89.2%` | `#1f2532` · `221.1 23.5% 15.9%` | Divisórias e contorno das camadas. Decorativa; também desenha a grade de pontos do fundo do chat e do estado vazio. |
| `--input` | `#858e9e` · `218.4 11.4% 57.1%` | `#5c6679` · `219.3 13.6% 41.8%` | Borda de Input, Select, outline e trilho do Switch desligado. 3,1:1 ou mais sobre background, card e popover. |
| `--ring` (= `primary`) | `#2b57d9` · `224.8 69.6% 51%` | `#7397ff` · `224.6 100% 72.5%` | Anel de foco: 2 px sólido com 2 px de folga, mais o brilho shadow-glow. 5,1:1 ou mais em todas as superfícies. |

### Sombras (novo: `shadow-glow`)

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `shadow-popover` | `0 4px 12px rgba(15,20,28,.10)` | `0 8px 24px rgba(0,0,0,.55)` | menu do Select, Toast |
| `shadow-dialog` | `0 16px 40px rgba(15,20,28,.16)` | `0 16px 48px rgba(0,0,0,.65)` | Dialog, Sheet |
| `shadow-glow` | `0 0 0 1px primary/.22, 0 4px 14px -4px primary/.40` | `0 0 0 1px primary/.35, 0 0 24px -6px primary/.60` | hover do botão primário, foco de Input/composer, barra do item ativo, Switch ligado. Decorativo. |

Overlay de Dialog/Sheet: `bg-background/80 backdrop-blur-sm`. Cards não têm sombra: camadas se separam por tom e borda.

### Nomes no código (P1-02)

`globals.css`, em `:root` (claro) e `.dark` (escuro), só canais HSL (sem hex, `rgb()` ou `rgba()`):

- Cores: `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--primary-soft`, `--signal`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--destructive-foreground`, `--success`, `--warning`, `--border`, `--input`, `--ring`. Mais `--radius: 0.5rem`.
- Sombras por tema: `--shadow-popover`, `--shadow-dialog` e `--shadow-glow`. Valores da tabela de sombras, com `rgba(15,20,28,α)` escrito como `hsl(var(--foreground) / α)` no claro (é a mesma cor), `rgba(0,0,0,α)` como `hsl(0 0% 0% / α)` no escuro, e o glow com `hsl(var(--primary) / α)`.

`tailwind.config.ts`, em `theme.extend`:

| Chave | Valor |
|---|---|
| `colors.background`, `foreground`, `border`, `input`, `ring`, `signal`, `success`, `warning` | `hsl(var(--<nome>))` |
| `colors.card`, `popover`, `secondary`, `muted`, `accent`, `destructive` | `{ DEFAULT: 'hsl(var(--<nome>))', foreground: 'hsl(var(--<nome>-foreground))' }` |
| `colors.primary` | `{ DEFAULT, foreground, soft: 'hsl(var(--primary-soft))' }` → `bg-primary-soft` |
| `borderRadius` | `lg: 'var(--radius)'`, `md: 'calc(var(--radius) - 2px)'`, `sm: 'calc(var(--radius) - 4px)'` |
| `boxShadow` | `popover: 'var(--shadow-popover)'`, `dialog: 'var(--shadow-dialog)'`, `glow: 'var(--shadow-glow)'` |
| `fontFamily` | como em Tipografia |

Saem: `primaryAccent`, `brand`, `positive` (vira `success`), `background.secondary`, `--color-border-default`, `screens` (`xs`, `s23`; ficam os padrão), `borderRadius.xl`. Utilitário da grade de pontos e keyframes de ponto ao vivo e skeleton entram no item que os usar. Tokens de gráfico: decisão D-P1-02-1.

## Contraste AA (WCAG 2.1)

Razão calculada pela luminância relativa (WCAG 2.1, 1.4.3 e 1.4.11). Mínimo 4,5:1 para texto normal; 3:1 para borda de controle, ícone com significado, anel de foco e polegar do Switch. Nenhum par da lista falha.

| Frente | Fundo | Onde | Mín. | Claro | Escuro |
|---|---|---|---|---|---|
| `foreground` | `background` | texto principal | 4,5 | 17,24 ✓ | 16,67 ✓ |
| `foreground` | `card` | texto principal | 4,5 | 18,47 ✓ | 15,93 ✓ |
| `foreground` | `popover` | texto principal | 4,5 | 18,47 ✓ | 14,98 ✓ |
| `foreground` | `muted` | texto principal | 4,5 | 16,48 ✓ | 15,30 ✓ |
| `foreground` | `secondary` | texto principal | 4,5 | 16,02 ✓ | 13,79 ✓ |
| `foreground` | `accent` | texto principal | 4,5 | 15,72 ✓ | 13,45 ✓ |
| `foreground` | `primary-soft` | texto principal | 4,5 | 15,61 ✓ | 13,96 ✓ |
| `muted-foreground` | `background` | texto secundário, placeholder, cabeçalho de coluna | 4,5 | 5,94 ✓ | 7,55 ✓ |
| `muted-foreground` | `card` | texto secundário, placeholder, cabeçalho de coluna | 4,5 | 6,36 ✓ | 7,22 ✓ |
| `muted-foreground` | `popover` | texto secundário, placeholder, cabeçalho de coluna | 4,5 | 6,36 ✓ | 6,79 ✓ |
| `muted-foreground` | `muted` | texto secundário, placeholder, cabeçalho de coluna | 4,5 | 5,67 ✓ | 6,93 ✓ |
| `muted-foreground` | `secondary` | texto secundário, placeholder, cabeçalho de coluna | 4,5 | 5,52 ✓ | 6,25 ✓ |
| `muted-foreground` | `accent` | texto secundário, placeholder, cabeçalho de coluna | 4,5 | 5,41 ✓ | 6,10 ✓ |
| `muted-foreground` | `primary-soft` | texto secundário, placeholder, cabeçalho de coluna | 4,5 | 5,38 ✓ | 6,33 ✓ |
| `primary` | `background` | link, ícone do item ativo, primary como texto | 4,5 | 5,65 ✓ | 7,21 ✓ |
| `primary` | `card` | link, ícone do item ativo, primary como texto | 4,5 | 6,06 ✓ | 6,89 ✓ |
| `primary` | `popover` | link, ícone do item ativo, primary como texto | 4,5 | 6,06 ✓ | 6,48 ✓ |
| `primary` | `primary-soft` | link, ícone do item ativo, primary como texto | 4,5 | 5,12 ✓ | 6,04 ✓ |
| `primary` | `accent` | link, ícone do item ativo, primary como texto | 4,5 | 5,15 ✓ | 5,82 ✓ |
| `primary-foreground` | `primary` | botão primário; texto sobre as duas pontas do gradiente | 4,5 | 6,06 ✓ | 7,09 ✓ |
| `primary-foreground` | `signal` | botão primário; texto sobre as duas pontas do gradiente | 4,5 | 5,59 ✓ | 11,28 ✓ |
| `destructive` | `background` | erro de campo e de área, tool com erro | 4,5 | 5,31 ✓ | 7,90 ✓ |
| `destructive` | `card` | erro de campo e de área, tool com erro | 4,5 | 5,69 ✓ | 7,55 ✓ |
| `destructive` | `popover` | erro de campo e de área, tool com erro | 4,5 | 5,69 ✓ | 7,10 ✓ |
| `destructive` | `muted` | erro de campo e de área, tool com erro | 4,5 | 5,08 ✓ | 7,25 ✓ |
| `destructive-foreground` | `destructive` | botão excluir | 4,5 | 5,69 ✓ | 7,66 ✓ |
| `success` | `background` | Ativo, online, tool ok | 4,5 | 5,46 ✓ | 10,27 ✓ |
| `success` | `card` | Ativo, online, tool ok | 4,5 | 5,85 ✓ | 9,81 ✓ |
| `success` | `popover` | Ativo, online, tool ok | 4,5 | 5,85 ✓ | 9,23 ✓ |
| `success` | `muted` | Ativo, online, tool ok | 4,5 | 5,22 ✓ | 9,42 ✓ |
| `warning` | `background` | Pendente, aviso de campo | 4,5 | 5,38 ✓ | 10,75 ✓ |
| `warning` | `card` | Pendente, aviso de campo | 4,5 | 5,77 ✓ | 10,27 ✓ |
| `warning` | `popover` | Pendente, aviso de campo | 4,5 | 5,77 ✓ | 9,66 ✓ |
| `warning` | `muted` | Pendente, aviso de campo | 4,5 | 5,15 ✓ | 9,87 ✓ |
| `signal` | `background` | gerando, ao vivo, ícone de tool | 4,5 | 5,21 ✓ | 11,47 ✓ |
| `signal` | `card` | gerando, ao vivo, ícone de tool | 4,5 | 5,59 ✓ | 10,96 ✓ |
| `signal` | `popover` | gerando, ao vivo, ícone de tool | 4,5 | 5,59 ✓ | 10,31 ✓ |
| `signal` | `muted` | gerando, ao vivo, ícone de tool | 4,5 | 4,98 ✓ | 10,53 ✓ |
| `signal` | `primary-soft` | gerando, ao vivo, ícone de tool | 4,5 | 4,72 ✓ | 9,61 ✓ |
| `input` | `background` | borda de controle | 3 | 3,08 ✓ | 3,44 ✓ |
| `input` | `card` | borda de controle | 3 | 3,30 ✓ | 3,29 ✓ |
| `input` | `popover` | borda de controle | 3 | 3,30 ✓ | 3,10 ✓ |
| `ring` | `background` | anel de foco | 3 | 5,65 ✓ | 7,21 ✓ |
| `ring` | `card` | anel de foco | 3 | 6,06 ✓ | 6,89 ✓ |
| `ring` | `popover` | anel de foco | 3 | 6,06 ✓ | 6,48 ✓ |
| `ring` | `primary-soft` | anel de foco | 3 | 5,12 ✓ | 6,04 ✓ |
| `card` | `primary` | polegar do Switch (ligado / desligado) | 3 | 6,06 ✓ | 6,89 ✓ |
| `card` | `input` | polegar do Switch (ligado / desligado) | 3 | 3,30 ✓ | 3,29 ✓ |
| `foreground` | `background` + aurora (#141a2b, pior ponto) | topo da área de conteúdo no escuro | 4,5 | n/a | 14,50 ✓ |
| `muted-foreground` | `background` + aurora (#141a2b, pior ponto) | topo da área de conteúdo no escuro | 4,5 | n/a | 6,57 ✓ |
| `primary` | `background` + aurora (#141a2b, pior ponto) | topo da área de conteúdo no escuro | 4,5 | n/a | 6,27 ✓ |
| `border` | `background` / `card` | divisória (decorativa) | — | 1,21 / 1,30 | 1,30 / 1,24 |

O gradiente `primary`→`signal` passa com `primary-foreground` nas duas pontas (linhas acima), então passa em todo o trecho. O brilho (`shadow-glow`) e a grade de pontos são decorativos e não carregam informação.

## Tipografia (0008 = IBM Plex)

Famílias: `--font-sans` = IBM Plex Sans, `--font-mono` = IBM Plex Mono, com fallback `ui-sans-serif, system-ui, sans-serif` e `ui-monospace, SFMono-Regular, Menlo, monospace`.

| Estilo | Família | Tamanho/linha | Peso | Tailwind | Uso |
|---|---|---|---|---|---|
| `page-title` | sans | 24/32, tracking −0,01em | 600 | `text-2xl font-semibold tracking-tight` | h1, um por página |
| `dialog-title` | sans | 18/28 | 600 | `text-lg font-semibold` | Dialog, Sheet, título do estado vazio |
| `section-title` | sans | 16/24 | 600 | `text-base font-semibold` | CardTitle, seção de formulário, título de erro |
| `body` | sans | 14/20 | 400 | `text-sm` | texto, célula, input no desktop |
| `label` | sans | 14/20 | 500 | `text-sm font-medium` | Label, botão, nome na tabela, item de navegação |
| `caption` | sans | 12/16 | 400 (500 no cabeçalho de coluna) | `text-xs` | ajuda, erro de campo, metadado |
| `badge` | sans | 12/16 | 500 | `text-xs font-medium` | StatusBadge |
| `chat` | sans | 16/24 | 400 | `text-base` | mensagens; input no celular |
| `overline` | mono | 12/16, tracking 0,08em, caixa alta | 500 | `font-mono text-xs font-medium uppercase tracking-widest` | grupos da navegação, rótulos de painel |
| `kpi` | mono | 30/36 | 500 | `font-mono text-3xl font-medium tabular-nums` | número do dashboard |
| `code` | mono | 14/20 | 400 | `font-mono text-sm` | id, modelo, URL, `env:`/`file:` em input |
| `code-sm` | mono | 12/16 | 400 | `font-mono text-xs` | id e modelo na tabela, métricas (`1,4 s · 812 tokens`), host |
| `chip` | mono | 12/16 | 500 | `font-mono text-xs font-medium` | nome da tool no chip, contadores |

Markdown do chat: `strong` usa 600 (não há arquivo 700; o navegador usa o 600 sem negrito sintético); código inline e blocos em `code`.

### Arquivos da fonte (0008: `next/font/local`, em `src/app/fonts/`)

Estáticos `.woff2` do release oficial da IBM (repositório `IBM/plex`, pacotes `plex-sans` e `plex-mono`, pasta `fonts/complete/woff2/`; use o conjunto *complete*, não o *split*: o *split* Latin-1 não tem `•`, `›`, `…` e `—`, que a interface usa). Só os pesos usados:

| Arquivo | Família | Peso | Estilo | Usado em |
|---|---|---|---|---|
| `IBMPlexSans-Regular.woff2` | IBM Plex Sans | 400 | normal | `body`, `caption`, `chat` |
| `IBMPlexSans-Medium.woff2` | IBM Plex Sans | 500 | normal | `label`, `badge`, cabeçalho de coluna |
| `IBMPlexSans-SemiBold.woff2` | IBM Plex Sans | 600 | normal | títulos, `strong` no Markdown |
| `IBMPlexSans-Italic.woff2` | IBM Plex Sans | 400 | italic | ênfase `*...*` no Markdown do chat (sem ele o navegador inclina a fonte sinteticamente) |
| `IBMPlexMono-Regular.woff2` | IBM Plex Mono | 400 | normal | `code`, `code-sm` |
| `IBMPlexMono-Medium.woff2` | IBM Plex Mono | 500 | normal | `overline`, `kpi`, `chip` |
| `OFL.txt` | — | — | — | licença SIL OFL 1.1 do repositório IBM/plex, ao lado dos arquivos |

Configuração esperada: duas chamadas `localFont` em `src/app/layout.tsx`, uma por família, com `src` listando os arquivos acima (`weight` e `style` de cada um), `variable: '--font-sans'` / `'--font-mono'` e `display: 'swap'`; `tailwind.config.ts` com `fontFamily.sans = ['var(--font-sans)', ...fallback]` e `fontFamily.mono = ['var(--font-mono)', ...fallback]`; as classes `font-geist`/`font-dmmono` saem. Nenhuma requisição a `fonts.googleapis.com`/`fonts.gstatic.com` em dev, build ou e2e (fecha a [0004](../decisions/0004-stream-runcontent-e-fontes.md)).

## Espaço, tamanho, raio

| Token | Valor | Tailwind | Uso |
|---|---|---|---|
| `space-1` | 4 px | `gap-1` | ícone/ponto e texto em badge e chip |
| `space-2` | 8 px | `gap-2`, `space-y-2` | rótulo→campo, ícone→texto, entre botões e chips |
| `space-3` | 12 px | `px-3` | padding de input, botão, célula |
| `space-4` | 16 px | `gap-4`, `p-4` | entre campos; gutter e card no celular |
| `space-6` | 24 px | `gap-6`, `p-6` | entre seções; gutter do desktop |
| `space-8` | 32 px | `pt-8`, `py-8` | topo da página, estados |
| `control-h` | 36 px | `h-9` | Button, Input, Select (desktop) |
| `control-h-touch` | 40 px | `h-10` | idem abaixo de `md`; ícone com toque 44×44 |
| `row-h` | 52 px | `py-2` com nome + id | linha da tabela (64 px na lista do celular) |
| `header-h` | 56 px | `h-14` | cabeçalho e topo da navegação |
| `sidebar-w` | 256 px | `w-64` | navegação fixa (`lg+`) |
| `chat-w` | 768 px | `max-w-3xl` | coluna de mensagens e composer |
| `radius-lg` | 8 px | `rounded-lg` (`--radius: 0.5rem`) | card, dialog, sheet, toast, tabela, composer, bolha |
| `radius-md` | 6 px | `rounded-md` | botão, input, select, badge, chip, item de navegação |
| `radius-sm` | 4 px | `rounded-sm` | marca, avatar, skeleton, item do menu |
| `radius-full` | 9999 px | `rounded-full` | Switch, ponto ao vivo |
