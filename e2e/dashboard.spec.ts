import { expect, test, type Page } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'

// P2-05 (decisão 0023): o dashboard lê o /metrics e a config dos agents do
// orquestrador pelo BFF (sem Mongo). Dados
// do fake: hoje 3+1 sessões, 3 usuários, 1000 tokens; cada dia anterior 1
// sessão, 1 usuário, 100 tokens (e2e/fake-orchestrator/server.ts). O fake só
// inclui o dia de hoje depois do POST /metrics/refresh que o BFF faz antes de ler.

const card = (page: Page, title: string) =>
  page.locator('div.rounded-lg').filter({ has: page.getByText(title, { exact: true }) })

test('abre com o fake, sem Mongo; o período muda os números e o browser não fala com o orquestrador', async ({
  page
}) => {
  const toOrchestrator: string[] = []
  page.on('request', (request) => {
    if (request.url().startsWith(FAKE_ORCHESTRATOR_URL)) toOrchestrator.push(request.url())
  })
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expect(card(page, 'Agentes ativos')).toContainText('2')
  await expect(card(page, 'Agentes ativos')).toContainText('3 no total')
  await expect(card(page, 'Máx. usuários/dia')).toContainText('3')
  await expect(card(page, 'Sessões criadas')).toContainText('3 agentes · 1 team')
  await expect(card(page, 'Tokens consumidos')).toContainText('1.000')
  await expect(page.getByText('fake-model')).toBeVisible()
  await expect(page.getByText('fake-embed')).toBeVisible()
  await expect(page.getByText('Consumo de tokens por entidade')).toHaveCount(0)

  const periods = page.getByRole('main').getByRole('combobox')
  await periods.click()
  await expect(page.getByRole('option', { name: 'Última hora' })).toHaveCount(0)
  await page.getByRole('option', { name: 'Últimos 7 dias' }).click()

  await expect(card(page, 'Sessões criadas')).toContainText('9 agentes · 1 team')
  await expect(card(page, 'Tokens consumidos')).toContainText('1.600')
  await expect(card(page, 'Máx. usuários/dia')).toContainText('3')

  await periods.click()
  await page.getByRole('option', { name: 'Últimos 90 dias' }).click()
  await expect(card(page, 'Tokens consumidos')).toContainText('9.900')

  expect(toOrchestrator).toEqual([])
})

test('BFF responde 503 (orquestrador fora): estado de erro do dashboard, com "Tentar de novo"', async ({ page }) => {
  let up = false
  await page.route(/\/api\/dashboard\/stats/, (route) =>
    up ? route.continue() : route.fulfill({ status: 503, json: { success: false, error: 'unreachable' } })
  )
  await page.goto('/dashboard')

  const alert = page.getByRole('main').getByRole('alert')
  await expect(alert).toContainText('Não foi possível carregar o dashboard')
  await expect(alert.getByText('código 503')).toBeVisible()
  up = true
  await alert.getByRole('button', { name: 'Tentar de novo' }).click()

  await expect(card(page, 'Tokens consumidos')).toContainText('1.000')
})

// QA1-08 (#11, V10): a 1ª pintura é o esqueleto com os mesmos blocos e a altura
// final da página; nenhum card de gráfico com corpo em branco.
for (const viewport of [
  { width: 1367, height: 889 },
  { width: 390, height: 844 }
]) {
  test(`esqueleto da 1ª pintura com a altura final da página (${viewport.width} px)`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.route(/\/api\/dashboard\/stats/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })
    await page.goto('/dashboard')
    const main = page.locator('main#conteudo')
    await expect(main.getByText('Carregando dashboard…')).toBeAttached()
    // Altura do contêiner do conteúdo (não o scrollHeight do main, que tem folga).
    const content = main.locator('.max-w-7xl').first()
    const heightOf = async () => (await content.boundingBox())!.height
    const skeletonHeight = await heightOf()
    await expect(card(page, 'Tokens consumidos')).toContainText('1.000')
    for (const title of ['Atividade por tempo', 'Sessões por tipo'])
      await expect(card(page, title).locator('svg.recharts-surface').first()).toBeVisible()
    expect(Math.abs((await heightOf()) - skeletonHeight)).toBeLessThanOrEqual(2)
  })
}

test('gráficos no celular: legenda do donut dentro do card, sem rótulo cortado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dashboard')

  const donut = page.locator('div.rounded-lg').filter({ has: page.getByText('Sessões por tipo', { exact: true }) })
  const legend = donut.getByRole('list', { name: 'Sessões por tipo' })
  await expect(legend.getByRole('listitem')).toHaveText(['Sessões de agente: 3', 'Sessões de team: 1'])
  const cardBox = await donut.boundingBox()
  for (const item of await legend.getByRole('listitem').all()) {
    const box = await item.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(cardBox!.x + 16)
    expect(box!.x + box!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width - 16)
  }
  // Nenhum texto dentro do SVG do donut (sem rótulo externo do recharts).
  await expect(donut.locator('svg.recharts-surface text')).toHaveCount(0)
})

// V12: o bloco do donut mantém a altura com dados, com 1 item na legenda e vazio.
test('donut do celular com a mesma altura com 2 itens, 1 item e sem sessões', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const stats = (agent: number, team: number) => ({
    success: true,
    data: {
      activeAgents: 1,
      totalAgents: 1,
      peakDailyUsers: 1,
      totalSessions: agent + team,
      totalAgentSessions: agent,
      totalTeamSessions: team,
      totalTokens: 1,
      models: [],
      embeddingModels: [],
      activityOverTime: agent + team ? [{ time: '2026-10-15', sessions: agent + team, agentSessions: agent, teamSessions: team }] : []
    }
  })
  const heights: number[] = []
  for (const [agent, team] of [[12, 5], [12, 0], [0, 0]]) {
    await page.route(/\/api\/dashboard\/stats/, (route) => route.fulfill({ json: stats(agent!, team!) }))
    await page.goto('/dashboard')
    const donut = card(page, 'Sessões por tipo')
    await expect(donut).toBeVisible()
    heights.push((await donut.boundingBox())!.height)
    await page.unroute(/\/api\/dashboard\/stats/)
  }
  expect(heights[1]).toBeCloseTo(heights[0]!, 0)
  expect(heights[2]).toBeCloseTo(heights[0]!, 0)
})

// QA1-08 (QA): "nenhum rótulo cortado" em 1367 e 390 px com números grandes (pior
// caso dos ticks do eixo Y e da legenda). Texto do SVG dentro do próprio SVG (o
// SVG corta o que passa) e a legenda dentro do card com 16 px de folga.
const bigStats = (agent: number, team: number) => ({
  success: true,
  data: {
    activeAgents: 1,
    totalAgents: 1,
    peakDailyUsers: 1,
    totalSessions: agent + team,
    totalAgentSessions: agent,
    totalTeamSessions: team,
    totalTokens: 1,
    models: [],
    embeddingModels: [],
    activityOverTime: ['2026-10-13', '2026-10-14', '2026-10-15'].map((time, index) => ({
      time,
      sessions: agent + team,
      agentSessions: agent - index,
      teamSessions: team + index
    }))
  }
})

async function expectNoClippedLabels(page: Page, agent: number, team: number) {
  await page.route(/\/api\/dashboard\/stats/, (route) => route.fulfill({ json: bigStats(agent, team) }))
  await page.goto('/dashboard')
  for (const title of ['Atividade por tempo', 'Sessões por tipo']) {
    const chart = card(page, title)
    const surface = chart.locator('.recharts-wrapper > svg.recharts-surface')
    await expect(surface).toBeVisible()
    const cardBox = (await chart.boundingBox())!
    const svgBox = (await surface.boundingBox())!
    for (const text of await surface.locator('text').all()) {
      const box = (await text.boundingBox())!
      expect(box.x, (await text.textContent()) ?? undefined).toBeGreaterThanOrEqual(svgBox.x - 0.5)
      expect(box.x + box.width).toBeLessThanOrEqual(svgBox.x + svgBox.width + 0.5)
    }
    for (const label of await chart.locator('li').all()) {
      const box = (await label.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(cardBox.x + 16)
      expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width - 16)
    }
  }
}

for (const viewport of [
  { width: 1367, height: 889 },
  { width: 390, height: 844 }
]) {
  test(`gráficos com números de 5 dígitos: nenhum rótulo cortado (${viewport.width} px)`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await expectNoClippedLabels(page, 12_345, 8_765)
    const items = card(page, 'Sessões por tipo').getByRole('list', { name: 'Sessões por tipo' }).getByRole('listitem')
    await expect(items).toHaveText(['Sessões de agente: 12.345', 'Sessões de team: 8.765'])
    if (viewport.width > 1000) {
      // V4: os 2 itens da legenda na mesma linha no desktop.
      const [first, second] = await items.all()
      expect((await first!.boundingBox())!.y).toBeCloseTo((await second!.boundingBox())!.y, 0)
    }
  })
}

// QA1-08-B1: com a largura fixa do recharts (60 px), a partir de 100.000 sessões num
// dia os ticks do eixo Y passavam do SVG; o YAxis mede os ticks (width="auto").
test('QA1-08-B1: ticks do eixo Y inteiros com 6+ dígitos (1367 px)', async ({ page }) => {
  await page.setViewportSize({ width: 1367, height: 889 })
  await expectNoClippedLabels(page, 1_234_567, 765_432)
})
