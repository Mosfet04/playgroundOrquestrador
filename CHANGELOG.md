# Changelog

O detalhe de cada item está no [roadmap](docs/roadmap/README.md) e nas [decisões](docs/decisions/).

## Não lançado

O playground deixou de ser um cliente direto do AgentOS com escrita no Mongo e passou a ser a interface de gestão do orquestrador, atrás de um BFF.

### Fundação (P0)
- Só pnpm, typecheck verde, Vitest + Testing Library + MSW, Playwright contra um orquestrador falso e CI no GitHub Actions.

### Design system e navegação (P1)
- Design system próprio (azul de operação, IBM Plex servida pelo app), tokens de tema claro e escuro.
- Uma URL por seção, navegação lateral (Sheet no celular), i18n pt-BR e EN com `next-intl`.
- Estados de carregando, vazio e erro em todas as telas; 404 dentro da casca.

### BFF e login (P2)
- Login de usuário único com sessão assinada de 12 h, limite de tentativas por IP e checagem de `Origin`.
- Chat inteiro pelo BFF: a URL e as chaves do orquestrador ficam só no servidor; o campo de endpoint do painel saiu.
- Markdown do agente sem HTML cru.
- Dashboard e CRUD pela API do orquestrador (`/metrics`, `/admin/config/*`); o playground não acessa mais o Mongo.

### Editores com paridade (P3)
- Formulários dirigidos pelo `/admin/schema`.
- Editores completos de agente, tool HTTP (rota com `{param}` e preview da requisição) e team.
- RAG completo e seletor de segredo único (`env:`/`file:`).
- Conflito de edição (412) com comparação e Desativar/Reativar.

### UX em tempo real (P4)
- Status de aplicação com a revisão do runtime.
- "Revisar antes de salvar" com Antes × Depois.
- "Testar agora" depois de salvar.
- Histórico de versões e restaurar.
- Página de Configurações e status de conexão na navegação.

### Agno 3.1.12 (AG3)
- `expose_reasoning` no editor de agente, sessões por usuário logado, painel de raciocínio no chat, contrato e orquestrador falso no formato do agno 3.

### Correções do QA de 23/11 (QA1)
- Casca fixa (só o conteúdo rola), sessões e status de conexão mais estáveis.
- Erro do modelo legível com Reenviar; markdown na bolha do usuário.
- Textos longos truncados sem vazar, padrão único de campo e de erro, validação e aviso de rascunho.
- Segredo em header de tool, gráficos do dashboard sem corte, coluna "Atualizado" nas listas, rótulos de provedor e glossário pt-BR consistentes.

## v1.1.0 — Agno 2.5 (2026-02-23)

> Versão anterior à migração para o BFF. As collections do Mongo citadas abaixo não são mais lidas pelo playground.

### Novas funcionalidades
- **Suporte a Teams**: playground, dashboard e sessões agora funcionam com Teams além de Agents
- **Dashboard aprimorado**: métricas separadas para Agent Sessions e Team Sessions, gráficos de área empilhados, gráfico de pizza por tipo de sessão
- **Consumo de tokens por entidade**: tabela de tokens agora mostra agents e teams com identificação de tipo
- **Sessões unificadas**: carregamento de sessões compatível com formato `chat_history` (Agno 2.5) e formato legado (`runs`/`memory.runs`)

### Alterações de API
- Rotas do Agno atualizadas: removido prefixo `/v1/playground/` — endpoints agora em `/agents`, `/teams`, `/sessions`
- Sessões unificadas via query params (`?type=agent|team&component_id=...`)
- Endpoint padrão alterado de `http://localhost:7777/playground` para `http://localhost:7777`
- Modo padrão alterado de `team` para `agent`

### Banco de dados
- Collection `storage` renomeada para `agno_sessions`
- Collection `user_memories` renomeada para `agno_memories`
- Dashboard agora coleta modelos a partir de `agent_data`/`team_data` nas sessões do Agno

### Melhorias técnicas
- `useAIStreamHandler`: fallback quando IP não pode ser obtido, timeout de 3s na requisição de IP
- `useAIStreamHandler`: flag `monitor: true` enviada automaticamente para runs de Teams
- `useSessionLoader`: suporte ao formato `chat_history` do Agno 2.5 com fallback para formato legado
- `useChatActions`: prioridade para agents sobre teams no carregamento inicial
- `layout.tsx`: `viewport` exportado separadamente conforme recomendação do Next.js
- Correção de keys duplicadas no dashboard (`model.name` → chave composta com provider e index)
- Adicionados `eslint-disable` para supressões necessárias de `@typescript-eslint/no-explicit-any`
