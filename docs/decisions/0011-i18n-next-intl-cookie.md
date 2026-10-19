# 0011 — P1-04: biblioteca de i18n, idioma por cookie e divisão do item

Data: 2026-10-15 · Decidido por: usuário (Mateus) · Item: P1-04 (D-P1-04-1..4)

| Decisão | Opções | Escolha |
|---|---|---|
| D-P1-04-1 biblioteca | A) `next-intl` (App Router, server e client components, ICU, `useFormatter`, chaves tipadas; 1 dependência); B) dicionário próprio (sem dependência, plural/interpolação/tipagem à mão); C) `react-i18next` (orientado ao cliente, mais dependências) | **A** |
| D-P1-04-2 onde vive o idioma | A) cookie, sem prefixo na URL (rotas do P1-03 intactas; troca = cookie + `router.refresh()`, estado do chat preservado); B) prefixo `/pt-BR/…` com middleware | **A** |
| D-P1-04-3 idioma sem cookie | A) sempre pt-BR; B) `Accept-Language`, depois pt-BR | **A** |
| D-P1-04-4 tamanho | A) quebrar: P1-04 = infraestrutura (lib, provider, seletor, `lang`, formatos, paridade, lint) + shell, navegação e gestão; P1-04b = playground (chat, sessões, hooks, toasts); B) item único | **A** |

## Adendo (2026-10-16, revisão da rodada 1)

| Decisão | Opções | Escolha |
|---|---|---|
| D-P1-04-5 `router.refresh()` na troca | A) tirar: no Next 15.2 gravar o cookie na server action já devolve a árvore re-renderizada (`pathWasRevalidated`), e o refresh só repete a renderização; B) manter | **A** (mecanismo: só a server action; comportamento de D-P1-04-2 inalterado) |
| D-P1-04-6 versão do `next-intl` | A) fixar `4.14.9` exato: o extrator traz ~45 transitivas (@swc/core, @parcel/watcher, @eloqnt/*) fora do bundle; B) manter `^4.14.9` | **A** |

## Adendo (2026-10-17, fim das rodadas)

| Decisão | Opções | Escolha |
|---|---|---|
| D-P1-04-7 limite de 3 rodadas estourado com 1 MAJOR aberto ("0 agente" em pt-BR, porque o CLDR `pt` põe 0 em `one`) | A) 4ª rodada mínima (N1 + 2 NITs, larguras `w-44` nas specs, revisão do delta, gate final); B) fechar e levar ao P1-04b; C) parar | **A** |
| D-P1-04-8 e2e instável sob carga no `next dev` (suíte de 61 para 100 testes) | A) esperar hidratação no teste agora + item novo para rodar o e2e da CI contra `next build` + `next start`; B) só mitigar no teste; C) trocar para `next start` já neste item | **A** (item P1-07) |
