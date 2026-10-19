# 0009 — P1-02: cor dos gráficos e condução do diff

Data: 2026-10-15 · Decidido por: usuário (Mateus) · Item: P1-02 (D-P1-02-1, D-P1-02-2)

Contexto completo, prós e contras: `docs/design/P1-02.md` (seção Decisões). Spec do P1-02 aprovada na 1ª rodada.

| Decisão | Opções | Escolha |
|---|---|---|
| D-P1-02-1 cores dos gráficos do dashboard | A) só tokens existentes (série 1 `primary`, série 2 `muted-foreground`); B) tokens novos `--chart-1..5`; C) manter os hex | **A** (paleta de gráfico decidida no redesenho do dashboard, P2-05) |
| D-P1-02-2 diff acima de ~600 linhas | A) um ciclo, dev em 3 fatias (fundação; playground + ícones; gestão + dashboard) revisadas por área, design QA e commit no fim; B) dividir em P1-02a/P1-02b; C) diff único | **A** |
| D-P1-02-3 itálico pré-carregado (M1/R1): no next 15.2.3 o `preload` do `next/font/local` vale por chamada | A) 3ª chamada `localFont` só do itálico, `preload: false`, `--font-sans-italic` aplicada por CSS em `i`, `blockquote`, `.italic`; B) manter 6 faces pré-carregadas; C) tirar o arquivo itálico (sintético; emenda a 0008); D) `preload: false` no mono | **A** (5 faces pré-carregadas; o itálico baixa só quando aparece) |
| D-P1-02-4 XSS pré-existente em `Images.tsx` (fallback com `innerHTML` e a URL da imagem do agente sem escapar), achado na revisão | A) corrigir neste ciclo (estado React de fallback + teste vermelho); B) item de segurança próprio; C) deixar para a P1-06 | **A** (a recomendação do revisor era B) |
| D-P1-02-5 tracking do título e do overline (design QA): o DS pede -0,01em e 0,08em, mas as classes `tracking-tight`/`tracking-widest` do Tailwind valem -0,025em e 0,1em | A) `letterSpacing { tight: '-0.01em', widest: '0.08em' }` no `tailwind.config.ts`; B) aceitar o padrão do Tailwind e corrigir o DS | **A** |
| Evidência do design QA no git (81 screenshots, 4,4 MB) | subconjunto citado no laudo; todas; nenhuma | **subconjunto** (só as telas citadas como evidência) |
