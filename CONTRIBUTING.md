# Contribuindo

O trabalho segue o roadmap em [`docs/roadmap/`](docs/roadmap/README.md): um item por vez, cada um com escopo, critérios de aceite e testes exigidos. As regras do projeto (camadas, convenções, testes, gates por fase) estão no [`CLAUDE.md`](CLAUDE.md); as decisões já tomadas, em [`docs/decisions/`](docs/decisions/).

## Fluxo de um item: `/dev-cycle`

Cada item roda pelo comando `/dev-cycle <item> [--commit]` do Claude Code ([`.claude/skills/dev-cycle/SKILL.md`](.claude/skills/dev-cycle/SKILL.md)), que encadeia os agentes de [`.claude/agents/`](.claude/agents/):

1. **Design** (`ui-ux-designer`, só itens com `UI: sim`): spec em `docs/design/<item>.md` com critérios visuais, aprovada por você antes do código.
2. **Dev** (`frontend-dev-specialist`): TDD, menor mudança que cumpre o item, entrega um `HANDOFF`.
3. **Code review** (`frontend-reviewer`) e **QA** (`qa-engineer`), com no máximo 3 rodadas de correção.
4. **Design QA** (itens com `UI: sim`) e **gate final**: os comandos da fase, rodados de novo.

Toda decisão técnica (dependência nova, contrato, camada, dados, auth, token visual, remoção de feature) para o ciclo e vai para você; a resposta vira um arquivo em `docs/decisions/`. Item que depende do orquestrador (`Depende (orq.)`) espera o item FA correspondente, que roda no `/dev-cycle` do outro repositório. Push e PR ficam fora do ciclo.

## Gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Só **pnpm**. A partir da P1 todos são bloqueantes; a partir da P2 entram os testes de segurança do BFF e a checagem de segredo no bundle (ver `CLAUDE.md`).

## Fora do ciclo

Bugs e sugestões: abra uma issue descrevendo o comportamento e, se possível, os passos para reproduzir. Mudança que não está no roadmap entra primeiro como item (ou decisão) antes do código.
