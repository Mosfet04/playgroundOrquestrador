# Design QA — P1-03 (Navegação por URL)

Data: 2026-10-15. Ambiente:
- `next dev -p 3100` com Mongo falso (`mongodb://127.0.0.1:1/ci-fake`);
- fake orchestrator em `:7790`;
- rede externa bloqueada por `page.route`;
- `/api/agents*` e `/api/tools*` com fixtures via `page.route`; `/api/dashboard/*` responde 503;
- `reducedMotion: reduce`.

O script de captura ficou fora do repo. Nomes dos arquivos: `desktop-` = 1440×900, `tablet-` = 1023×800, `mobile-` = 390×844; `light`/`dark` = tema gravado. Árvore conferida: staged `3daed89`. Decisões aplicadas: [0010](../../../decisions/0010-rotas-criacao-lista-e-conexao.md) (D1=A, D2=B, D3=B).

**Veredito: PASS.** Nenhuma divergência nos critérios da [spec](../../P1-03.md).

| Critério | Status | Evidência | Medido |
|---|---|---|---|
| V-P1-03-1 (+ P1-01 V1) | PASS | `desktop-light-01-agentes.png` | navegação 256 px em `card` (claro `#fff`, escuro `rgb(13,16,23)`), borda direita `border`; marca de 28 px com gradiente; grupos em Plex Mono caixa alta; sem "Agno Manager"/descrições/"v1.0.0"; rodapé vazio (D3=B) |
| V-P1-03-2 (+ P1-01 V2) | PASS | `desktop-light-01-agentes.png`, `desktop-dark-02-editor-agente.png`, `desktop-light-05b-tab-nav.png` | um item ativo: `/agents` → `page`, `/agents/<id>` → `true`, `/` → Início. Fundo `primary-soft`, peso 500, ícone `primary`, barra de 3 px `primary`→`signal` com `shadow-glow` |
| V-P1-03-3 | PASS | `desktop-dark-02-editor-agente.png` | cabeçalho 56 px com borda inferior; "Configurar › Agentes › Suporte N1" ("Agentes" é link, último nível `foreground` 500); só o tema, 36×36. O Select saiu da navegação desktop |
| V-P1-03-4 | PASS | `mobile-light-06-agentes.png`, `mobile-dark-08a-playground.png`, `tablet-light-09-dashboard.png` | em 390 e 1023 px não há navegação lateral nem elemento fixo; menu e tema 44×44; título 16/600 + subtítulo Plex Mono 12; em `/playground`, "Abrir sessões e agente" no lugar do tema |
| V-P1-03-5 (+ P1-01 V5) | PASS | `mobile-dark-07-menu.png`, `mobile-dark-07b-apos-esc.png` | Sheet de 296 px em `popover`; overlay `background`/80 com `blur(4px)`; itens de 44 px, "Agentes" ativo; "Tema" no rodapé. `Esc` → foco visível no botão de menu; clicar em "Tools" leva a `/tools` e fecha o Sheet |
| V-P1-03-6 | PASS | `desktop-light-05a-tab1-pular.png`, `desktop-light-05b-tab-nav.png` | 1º Tab: "Pular para o conteúdo"; 2º Tab: "Início". Anel `ring` de 2 px com folga de 2 px (box-shadow, mesmo padrão aprovado na P1-02) |
| V-P1-03-7 | PASS | `desktop-dark-02-editor-agente.png`, `desktop-dark-02b-editor-carregando.png` | editor como página, sem dialog, com o nome preenchido; durante o carregamento a casca já está desenhada (a trilha mostra o id em mono) e o spinner fica no conteúdo com `aria-busy` |
| V-P1-03-8 | PASS | `desktop-light-03-agente-nao-encontrado.png` | `role="alert"`, ícone em `destructive`, "Agente não encontrado", `nao-existe` em mono e "Voltar para agentes"; em `/tools/nao-existe`, "Tool não encontrada" / "Voltar para tools" |
| V-P1-03-9 | PASS | `desktop-dark-04-playground.png`, `mobile-dark-08b-playground-painel.png` | depois de recarregar, a URL `?agent=agente-alfa&session=…` se mantém, com agente e mensagens; o painel fica em x 256–512 sem sobreposição; em 390 px, Sheet de 320 px |
| V-P1-03-10 | PASS | medição | 9 rotas × 390/1023/1440: `scrollWidth ≤ clientWidth` em todas |
| V-P1-03-11 | PASS | `desktop-light-01-agentes.png` | nome e "Editar" → `/agents/<id>`; "Novo Agente" → `/agents/new` |
| V-P1-03-12 | PASS | medição | `<title>` conforme o mapa nas 9 rotas (ex.: `suporte-n1 · Agentes · Playground do Orquestrador`) |

Fora do escopo, sem reprovar (já conhecido):
- estado vazio do chat transborda no celular (`mobile-dark-08a-playground.png`; P1-06);
- lista em cards e textos antigos como "Novo Agente" e "Gerenciamento de Agentes" (D2=B, P1-05/P1-04);
- `/dashboard` com a API fora fica em skeleton (P1-05);
- `lang="en"` (P1-04).
