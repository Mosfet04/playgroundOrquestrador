# Auditoria heurística da UI atual

Item: P1-01 · Data: 2026-10-14 · Branch: `feat/gestor-realtime` (após P0-06)

## Método

- Prints com Playwright (Chromium) contra `next dev` + fake orchestrator, em 1440×900 (desktop) e 390×844 (celular). Ficam em [`P1-01/auditoria/`](P1-01/auditoria/).
- Sem Mongo no ambiente de teste: `/api/agents`, `/api/tools` e `/api/dashboard/*` respondem 500 (`MONGO_CONNECTION_STRING` ausente). Lista com dados, editor preenchido e dashboard com números foram avaliados pela leitura do código (`src/app/page.tsx`, `src/components/**`).
- Severidade: **alta** (impede a tarefa, expõe segredo ou falha AA), **média** (atrapalha ou induz erro), **baixa** (acabamento).
- Destino: o item do roadmap que corrige. P1-02 tokens, P1-03 rotas e layout, P1-04 i18n, P1-05 estados, P3 formulários.

| Print | O que mostra |
|---|---|
| `desktop-01-inicio.png` | Primeiros passos, navegação lateral |
| `desktop-03-dashboard.png` | Dashboard preso no skeleton (API 500) |
| `desktop-04-agentes.png` | Lista de agentes carregando |
| `desktop-05-tools.png`, `mobile-05-tools.png` | Lista de tools (API 500) |
| `desktop-06-form-agente.png`, `desktop-07-form-agente-erro.png` | Novo agente, validação no submit |
| `desktop-08-form-tool-header.png` | Header `Authorization` digitado em claro |
| `desktop-09-playground.png`, `desktop-10-chat.png` | Chat: duas barras laterais, resposta do fake |
| `desktop-11-foco-teclado.png` | Três `Tab` a partir do chat: nenhum foco visível |
| `mobile-01-inicio.png`, `mobile-02-menu.png` | Botão de menu fixo sobre o título; menu aberto cobre o logo |
| `mobile-03-dashboard.png` | Dashboard no celular (API 500) |
| `mobile-06-form-agente.png` | Novo agente no celular |
| `mobile-04-agentes.png` | Erro da API mostrado como lista vazia; botão de ação sem texto legível |
| `mobile-09-playground.png` | Estado vazio do chat cortado na horizontal; dois botões de menu sobrepostos |

## 1. Navegação

| ID | Sev. | Achado | Evidência | Recomendação | Destino |
|---|---|---|---|---|---|
| A-01 | alta | Seção ativa vive em `useState`: sem URL, sem deep link, voltar do navegador sai do app, recarga volta para "Primeiros passos". | `src/app/page.tsx:12` | Rotas do App Router por seção; item ativo vem da rota (`aria-current="page"`). | P1-03 |
| A-02 | alta | No celular o botão de menu é `fixed` em `top-4 left-4` e cobre o início do título de toda página ("enciamento de Agentes", "m-vindo"). Com o menu aberto, o X fica sobre o logo. | `mobile-01-inicio.png`, `mobile-04-agentes.png`, `mobile-02-menu.png`; `Navigation.tsx:65-72` | Cabeçalho próprio no celular (56 px) com o botão de menu dentro do fluxo, não sobreposto. | P1-03 |
| A-03 | alta | No `/playground` celular há dois menus empilhados (navegação e sidebar do chat) no mesmo canto; o rótulo "Sidebar" fica por baixo do botão. | `mobile-09-playground.png` | Um menu global; o painel de sessões do chat abre por botão próprio no cabeçalho da página. | P1-03 |
| A-04 | média | Desktop do chat tem duas colunas laterais (256 px + 280 px) antes da conversa; o chat fica com menos da metade da largura útil. | `desktop-10-chat.png` | Painel de sessões recolhível dentro da área de conteúdo; navegação global fixa em 240 px. | P1-03 |
| A-05 | baixa | Itens de navegação com descrição em duas linhas ("Gerenciar agentes IA") dobram a altura sem informar nada novo. | `Navigation.tsx:21-51` | Só o rótulo; agrupar por tarefa (Testar, Configurar, Observar). | P1-03 |
| A-06 | baixa | Detecção de celular por `resize` em JS em três componentes, além de CSS para "Samsung S23". | `page.tsx:27`, `AgentManagement.tsx:34`, `GettingStarted.tsx:62`, `globals.css:41`, `tailwind.config.ts:13` | Breakpoints do Tailwind (`md`, `lg`) no CSS. | P1-02, P1-03 |

## 2. Hierarquia

| ID | Sev. | Achado | Evidência | Recomendação | Destino |
|---|---|---|---|---|---|
| H-01 | média | Títulos competem entre si: título de página 30 px, título de card 24 px (`CardTitle text-2xl`), título de passo 24 px. Tudo parece cabeçalho. | `desktop-06-form-agente.png`; `card.tsx:38` | Escala da spec: página 20/600, seção 16/600, corpo 14/400. | P1-02 |
| H-02 | média | `text-muted-foreground`, `bg-card`, `border-input`, `ring-ring`, `text-primary-foreground` não existem no `tailwind.config.ts`; descrições saem na mesma cor do texto e não há texto secundário. | `tailwind.config.ts:28-42`; descrições brancas em todos os prints | Mapear todos os tokens shadcn (tabela em `design-system.md`). | P1-02 |
| H-03 | média | Lista de agentes em cards de três colunas com "ID:", "Modelo:", "Tools:" repetidos em cada card: difícil comparar agentes. | `AgentManagement.tsx:262-345` | Tabela (desktop) e lista de linhas (celular) com colunas fixas; a linha leva ao editor. | P1-03 (layout), P3 (lista) |
| H-04 | baixa | O app usa a fonte do sistema: `Geist` só é aplicada no chat (`font-geist`); o `body` não usa nenhuma família definida. Pesos 500/600 não são carregados (só 400), o negrito é sintético. | `layout.tsx:6-16`; prints | Família única do Design System no `body`, com 400/500/600. | família e pesos resolvidos no P1-01 (0008); uso nos componentes no P1-02 |

## 3. Formulários

| ID | Sev. | Achado | Evidência | Recomendação | Destino |
|---|---|---|---|---|---|
| F-01 | alta | Valor de header (ex.: `Authorization: Bearer sk-...`) é digitado e listado em claro; o placeholder sugere colar o token. | `desktop-08-form-tool-header.png`; `ToolForm.tsx:299-324` | Campo de segredo por referência (`env:`/`file:`), valor nunca exibido; aviso quando o texto colado parece uma chave. | P3-03, P3-05 (componente já no DS) |
| F-02 | média | Validação só no submit e só "obrigatório"; formato de ID, URL e modelo não são checados no campo. | `desktop-07-form-agente-erro.png`; `AgentForm.tsx:166-198` | zod no campo (on blur), mensagem abaixo do input em `text-destructive` com `aria-describedby`. | P3-01 |
| F-03 | média | `Select` com `bg-black border-white text-white` fixos: no tema claro fica uma caixa preta isolada; a borda branca some no tema claro. | `desktop-06-form-agente.png`; `AgentForm.tsx:231-239` | Select do DS sem override de cor. | P1-02 |
| F-04 | média | Escolha de tools por `<input type="checkbox">` nativo sem estilo e sem busca; com muitas tools vira lista longa. | `AgentForm.tsx:359` | Lista com busca e contagem de selecionadas (desenho no P3-02). | P3-02 |
| F-05 | média | Rótulos sem associação: `Label` de Provider, "Agente ativo", "Habilitar RAG" e "Apenas ativos" sem `htmlFor`/`id`; o leitor de tela não anuncia o nome do controle. | `AgentForm.tsx:205,227`, `AgentManagement.tsx:211` | Todo controle com `id` e `Label htmlFor`. | P1-02 (componentes), P3 |
| F-06 | baixa | Editar e criar trocam a lista por um formulário no mesmo `useState`; "Voltar" é a única saída e descarta o que foi digitado sem aviso. | `AgentManagement.tsx:114-125` | Editor em rota própria (`/agents/[id]`); aviso de alterações não salvas. | P1-03, P3 |

## 4. Feedback

| ID | Sev. | Achado | Evidência | Recomendação | Destino |
|---|---|---|---|---|---|
| E-01 | alta | Falha da API vira "Nenhum agente encontrado / Crie seu primeiro agente": o usuário acha que não tem agentes. O erro só aparece num toast que some. | `mobile-04-agentes.png`; `AgentManagement.tsx:54-62` | Estado de erro na própria área da lista, com causa e "Tentar de novo". | P1-05 |
| E-02 | alta | Dashboard sem dados fica para sempre no skeleton (blocos `bg-gray-200` claros sobre fundo escuro); nenhum erro. | `desktop-03-dashboard.png`; `Dashboard.tsx:108-118` | Skeleton com `bg-muted`; erro com ação após falha. | P1-05 |
| E-03 | média | Spinner centralizado "Carregando agentes..." em vez de esqueleto da tabela: a página pula quando os dados chegam. | `desktop-04-agentes.png`; `loading.tsx:1-20` | Skeleton com a forma das linhas. | P1-05 |
| E-04 | média | `Toaster` usa `useTheme()` sem `ThemeProvider`: o toast não segue o tema. | `ui/sonner.tsx:6-10` | `ThemeProvider` do `next-themes`. | P1-02 |
| E-05 | baixa | Botão de exclusão diz "Deletar"; mensagens misturam "Deletar", "Excluir", "Erro interno do servidor". | `DeleteConfirmDialog.tsx`, `AgentForm.tsx:124` | Vocabulário fixo da spec (Excluir, Salvar, Tentar de novo). | P1-04 |

## 5. Consistência

| ID | Sev. | Achado | Evidência | Recomendação | Destino |
|---|---|---|---|---|---|
| C-01 | alta | Só existe tema escuro; `colorScheme: light` no navegador não muda nada. Cores hex no `tailwind.config.ts` e classes fixas (`bg-black`, `text-black`, `bg-green-100`, `#8884d8`) em 20+ pontos. | `tailwind.config.ts:28-42`; `git grep "text-black\|bg-black"` | Tokens claro/escuro do DS; seletor de tema. | P1-02 |
| C-02 | média | Dois visuais no mesmo app: gestão em sans com cards brancos; chat herdado do Agent UI em maiúsculas mono, laranja Agno (`#FF4017`), botões arredondados `rounded-xl`. | `desktop-10-chat.png` vs `desktop-06-form-agente.png` | Um só DS; o laranja sai (não passa AA com texto branco: 3,50:1). | P1-02 |
| C-03 | média | Idiomas misturados: "NEW CHAT", "Ask anything", "Sidebar", "Enviar", "Agent Sessions" ao lado de textos em português. `lang="en"` no `<html>`. | `desktop-10-chat.png`, `mobile-09-playground.png`; `layout.tsx:36` | Catálogos pt-BR/EN e `lang` correto. | P1-04 |
| C-04 | baixa | Nome do produto varia: "Agno Manager", "Agent UI" (título da aba e chat), "Orquestrador de Agentes IA". | `Navigation.tsx:88`, `layout.tsx:25`, `Sidebar.tsx:22` | Um nome no cabeçalho da navegação e no `<title>` (spec). | P1-03, P1-04 |
| C-05 | baixa | Badges de status com cores Tailwind cruas (verde/cinza/azul) e só cor para distinguir ativo/inativo. | `AgentManagement.tsx:280-291` | `StatusBadge` do DS (ícone + texto + token). | P1-02 |

## 6. Acessibilidade

| ID | Sev. | Achado | Evidência | Recomendação | Destino |
|---|---|---|---|---|---|
| X-01 | alta | Zoom bloqueado no celular (`maximumScale: 1`): falha WCAG 1.4.4. | `layout.tsx:18-22` | Remover `maximumScale`; inputs com 16 px no celular evitam o zoom automático do iOS. | P1-02 |
| X-02 | alta | Botão "Criar primeiro agente" do estado vazio: texto `text-primary-foreground` (inexistente) herda branco sobre `bg-primary` branco; contraste ~1:1. O mesmo vale para todo `Button` padrão sem o `text-black` manual. | `mobile-04-agentes.png`; `button.tsx:12` | Tokens `primary`/`primary-foreground` definidos; tirar os `text-black` manuais. | P1-02 |
| X-03 | alta | Foco de teclado quase invisível: `focus-visible:ring-1 ring-ring` sem a cor `ring` definida; três `Tab` no chat não mostram onde está o foco. | `desktop-11-foco-teclado.png`; `button.tsx:8` | Anel sólido 2 px `ring` + offset 2 px, 3:1 ou mais nos dois temas. | P1-02 |
| X-04 | média | Botões só com ícone sem nome acessível (editar/excluir no desktop, menu do celular, "+" de header). | `AgentManagement.tsx:300-317`, `Navigation.tsx:65`, `ToolForm.tsx:328` | `aria-label` em todo botão só com ícone. | P1-02, P3 |
| X-05 | média | Menu do celular é um `div` com overlay: sem trap de foco, sem `Esc`, foco continua na página por trás. | `page.tsx:72-77` | Sheet do DS (sobre `@radix-ui/react-dialog`, já instalado). | P1-03 |
| X-06 | média | Dialog de exclusão sem foco inicial definido e com botão genérico "Deletar"; exclusão fica a um clique de cada card da lista. | `DeleteConfirmDialog.tsx`; `AgentManagement.tsx:309` | Excluir só no editor; foco inicial em "Cancelar"; botão destrutivo nomeia a ação ("Excluir agent"). | P3-06 |
| X-07 | baixa | Estado vazio do chat (texto grande de marketing do Agent UI) estoura a largura no celular. | `mobile-09-playground.png` | Estado vazio curto, com o agente selecionado e um exemplo de pergunta. | P1-05 |

## Resumo por destino

| Item | Achados |
|---|---|
| P1-02 tokens | H-02, H-04, F-03, F-05, E-04, C-01, C-02, C-05, X-01, X-02, X-03, X-04, A-06 |
| P1-03 rotas e layout | A-01 a A-06, H-03, F-06, X-05, C-04 |
| P1-04 i18n | C-03, C-04, E-05 |
| P1-05 estados | E-01, E-02, E-03, X-07 |
| P3 formulários | F-01, F-02, F-04, F-06, X-06 |

Prioridade: as altas de P1-02 (X-01, X-02, X-03, C-01) e P1-03 (A-01, A-02, A-03) resolvem a maior parte do que hoje impede uso no celular e por teclado. F-01 (segredo em claro) já tem componente no Design System; a troca do campo entra no P3-03.
