# CLAUDE.md — Playground do Orquestrador

UI de gestão do orquestrador (`../orquestradorIAPythonArgo`): configura agents, teams e tools, testa no chat e mostra métricas. Next.js 15 (App Router), React 18, Tailwind + shadcn, zustand, nuqs, react-hook-form + zod. O plano de trabalho está em `docs/roadmap/`; decisões registradas em `docs/decisions/`.

## Arquitetura (alvo; chega por fases, ver roadmap)

```
src/app/(app)/...      rotas e páginas (server components por padrão)
src/app/api/**         BFF fino: valida a entrada com zod, chama src/server, mapeia o erro
src/server/**          só servidor ('server-only'): cliente do orquestrador, sessão, env validado
src/features/<dom>/    UI, hooks e schemas de agents, teams, tools, chat, dashboard
src/components/ui      shadcn (primitivos, sem regra de negócio)
src/lib                código puro, sem I/O
```

- **O browser nunca vê chave nem URL interna do orquestrador.** Toda chamada passa pelo BFF; a chave admin/run fica em `src/server`.
- **A config é do orquestrador.** A partir da P2 nada no playground acessa o Mongo; escrita só pela API Admin (`/admin/config/*`), que valida, persiste e aplica a quente.
- `src/server` não pode ser importado por componente cliente (`no-restricted-imports` + `import 'server-only'`).
- **Anti over-engineering:** abstração, camada ou hook genérico só com 2+ usos reais. Uma implementação só ⇒ função/módulo simples. Nada "para o futuro".
- Estado: URL (nuqs) para o que é navegável, zustand só para estado de sessão do chat; não duplique estado do servidor no store.

## Convenções

- Identificadores em inglês; textos de UI via i18n (pt-BR padrão, EN); campos legados do orquestrador (`nome`, `descricao`) mantidos no contrato.
- Visual só por tokens do design system (CSS vars do shadcn, tema claro e escuro). Nada de hex solto nem classe arbitrária de cor.
- zod em toda fronteira (corpo de request, resposta do orquestrador, env). Tipos do contrato vêm do snapshot OpenAPI (`docs/contracts/`).
- Erro ao cliente: mensagem própria e código; nunca `String(err)`/stack. `catch` sempre trata ou relança com contexto.
- Markdown de agente renderizado sem HTML cru (`rehype-raw` proibido; `rehype-sanitize` com schema estrito).
- Segredos: só por referência (`env:<PROVEDOR>_API_KEY`, `file:/caminho`), nunca o valor. Não leia `.env*`.
- APIs de terceiros (Next, React, Radix, zod...): confira em `node_modules/<pkg>` (versão instalada) ou na doc da versão fixada. Nunca de memória.
- Só **pnpm**. Dependência nova é decisão do usuário.

## Testes

- Vitest + Testing Library + MSW (unit/componente/BFF, em `tests/`); Playwright (fluxos, em `e2e/`) contra o fake orchestrator (`e2e/fake-orchestrator/`).
- Nenhum LLM real nem rede externa. Orquestrador real só em teste marcado `live`, fora da CI.
- Teste de comportamento: asserte o que o usuário vê ou o que o handler devolve; mock de detalhe interno só sem alternativa.
- Todo defeito começa com um teste vermelho que o reproduz.

## Comandos

```bash
pnpm lint
pnpm typecheck
pnpm test                 # vitest run (a partir do P0-02)
pnpm test:e2e             # playwright (a partir do P0-03)
pnpm build
```

## Gates por fase (bloqueantes no gate final do /dev-cycle)

| Fase | Gates |
|---|---|
| P0 | `pnpm lint`, `pnpm typecheck`, `pnpm test` (assim que existir) |
| P1 | P0 + `pnpm test:e2e`, `pnpm build` |
| P2+ | P1 + testes de segurança do BFF, nenhum segredo no bundle (`grep -r "<chave de teste>" .next/static` vazio), snapshot OpenAPI em dia |

## Decisões técnicas

**Toda decisão técnica passa pelo usuário.** Agente nenhum escolhe sozinho: para e devolve `needs_decision`. Obrigatório para: dependência nova ou removida; contrato do BFF ou do orquestrador; camada/arquitetura; dados, armazenamento ou migração; auth/segurança; token ou direção visual do design system; remoção de feature; qualquer coisa fora do escopo do item.

```
DECISAO D-<item>-<n>
contexto: <1-3 linhas>
opcoes: A) ... (prós/contras)  B) ...
recomendacao: <opção e por quê>
reversibilidade: alta | baixa
```

A resposta do usuário vira `docs/decisions/NNNN-<slug>.md`.

## Definition of Done

Critérios de aceite cobertos por teste passando; gates da fase verdes; docs afetadas atualizadas (README, roadmap); com `UI: sim`, spec de design aprovada pelo usuário e design QA PASS; HANDOFF, review APPROVE e QA PASS registrados no ciclo.

## Cadeia de desenvolvimento

`/dev-cycle <item> [--commit]` orquestra `ui-ux-designer` → `frontend-dev-specialist` → `frontend-reviewer` → `qa-engineer` (`.claude/agents/`). Item que depende de mudança no orquestrador (`Depende (orq.)`) espera o item FA correspondente, que roda no `/dev-cycle` do outro repositório. Push e PR nunca acontecem dentro do ciclo.
