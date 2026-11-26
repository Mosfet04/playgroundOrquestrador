import { expect, test, type Locator, type Page } from '@playwright/test'

import { hydrated } from './hydration'

// QA1-11 (#23, #27, #28): provedor com um nome só nas telas, botões do Início
// que não mudam de lugar e aba desabilitada que explica o motivo. O fake devolve
// `model.provider: 'Fake'`; para o rótulo, as respostas do BFF são trocadas por
// page.route (Google/gemini, Azure/azureopenai).

const box = async (locator: Locator) => {
  const found = await locator.boundingBox()
  if (!found) throw new Error('elemento sem caixa')
  return found
}

// Caixas dos dois botões relativas ao card: o Playwright rola a página ao clicar.
const measure = async (card: Locator, link: Locator, mark: Locator) => {
  const cardBox = await box(card)
  const relative = async (locator: Locator) => {
    const found = await box(locator)
    return { ...found, x: found.x - cardBox.x, y: found.y - cardBox.y }
  }
  return {
    card: cardBox,
    link: await relative(link),
    mark: await relative(mark)
  }
}

const STEPS = [
  { title: 'Crie seu primeiro agente', link: 'Criar agente' },
  { title: 'Adicione uma tool HTTP', link: 'Criar tool' },
  { title: 'Teste no playground', link: 'Ir ao Playground' }
]

const step = (page: Page, title: string) =>
  page.getByRole('group', { name: new RegExp(`${title}$`) })

for (const viewport of [
  { width: 1367, height: 889 },
  { width: 390, height: 844 }
]) {
  test.describe(`Início em ${viewport.width} px`, () => {
    test.use({ viewport })

    test('os botões têm o mesmo x e a mesma largura nos três cards', async ({
      page
    }) => {
      await page.goto('/')
      await hydrated(page)

      const links = await Promise.all(
        STEPS.map(({ title, link }) =>
          box(step(page, title).getByRole('link', { name: link }))
        )
      )
      const marks = await Promise.all(
        STEPS.map(({ title }) =>
          box(
            step(page, title).getByRole('button', { name: 'Marcar como feito' })
          )
        )
      )
      for (const group of [links, marks]) {
        for (const item of group) {
          expect(Math.abs(item.x - group[0].x)).toBeLessThanOrEqual(1)
          expect(Math.abs(item.width - group[0].width)).toBeLessThanOrEqual(1)
        }
      }
      if (viewport.width >= 1024) {
        expect(links[0].width).toBeCloseTo(208, 0)
        const card = await box(step(page, STEPS[0].title))
        // Coluna à direita do card: ela termina no padding de 24 px (+ 1 px de borda).
        expect(
          Math.abs(links[0].x + links[0].width - (card.x + card.width - 25))
        ).toBeLessThanOrEqual(2)
      } else {
        // Largura do card, link em cima e Marcar embaixo.
        const card = await box(step(page, STEPS[0].title))
        expect(links[0].width).toBeGreaterThan(card.width - 40)
        expect(marks[0].y).toBeGreaterThan(links[0].y + links[0].height - 1)
      }
    })

    test('marcar como feito não muda a altura do card nem a posição dos botões; Desfazer volta', async ({
      page
    }) => {
      await page.goto('/')
      await hydrated(page)

      for (const { title, link } of STEPS) {
        const card = step(page, title)
        const before = await measure(
          card,
          card.getByRole('link', { name: link }),
          card.getByRole('button', { name: 'Marcar como feito' })
        )

        await card.getByRole('button', { name: 'Marcar como feito' }).click()
        const undo = card.getByRole('button', { name: 'Desfazer' })
        await expect(undo).toBeVisible()
        await expect(card).toHaveClass(/border-success/)

        const after = await measure(
          card,
          card.getByRole('link', { name: link }),
          undo
        )
        expect(
          Math.abs(after.card.height - before.card.height)
        ).toBeLessThanOrEqual(1)
        for (const key of ['link', 'mark'] as const) {
          expect(Math.abs(after[key].x - before[key].x)).toBeLessThanOrEqual(1)
          expect(Math.abs(after[key].y - before[key].y)).toBeLessThanOrEqual(1)
          expect(
            Math.abs(after[key].width - before[key].width)
          ).toBeLessThanOrEqual(1)
          expect(
            Math.abs(after[key].height - before[key].height)
          ).toBeLessThanOrEqual(1)
        }

        await undo.click()
        await expect(
          card.getByRole('button', { name: 'Marcar como feito' })
        ).toBeFocused()
        await expect(card).not.toHaveClass(/border-success/)
        expect(
          Math.abs((await box(card)).height - before.card.height)
        ).toBeLessThanOrEqual(1)
      }
      await expect(page.getByText('0 de 3 concluídos')).toBeVisible()
    })
  })
}

test.describe('aba desabilitada do Playground', () => {
  test.use({ viewport: { width: 1367, height: 889 } })

  const openWithoutTeams = async (page: Page) => {
    await page.route('**/api/playground/teams', (route) =>
      route.fulfill({ json: { success: true, data: [] } })
    )
    await page.goto('/playground')
    await hydrated(page)
  }
  const teamTab = (page: Page) =>
    page
      .getByRole('group', { name: 'Conversar com' })
      .getByRole('button', { name: 'Team', exact: true })

  test('Team sem teams: aria-disabled, tooltip no hover e no foco, Esc fecha', async ({
    page
  }) => {
    await openWithoutTeams(page)
    const tab = teamTab(page)
    await expect(tab).toHaveAttribute('aria-disabled', 'true')
    await expect(tab).toHaveCSS('cursor', 'not-allowed')

    await tab.hover()
    await expect(page.getByRole('tooltip')).toHaveText('Crie um team primeiro')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await page.mouse.move(0, 0)

    await page
      .getByRole('group', { name: 'Conversar com' })
      .getByRole('button', { name: 'Agente' })
      .focus()
    await page.keyboard.press('Tab')
    await expect(tab).toBeFocused()
    await expect(page.getByRole('tooltip')).toHaveText('Crie um team primeiro')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  })

  test('clique e Enter na aba desabilitada não mudam o modo nem a URL; o grid não muda', async ({
    page
  }) => {
    await openWithoutTeams(page)
    const tab = teamTab(page)
    const agentTab = page
      .getByRole('group', { name: 'Conversar com' })
      .getByRole('button', { name: 'Agente' })
    const before = [await box(tab), await box(agentTab)]
    const url = page.url()

    // `force`: o Playwright não clica em botão `aria-disabled` sem ele; o usuário clica.
    await tab.click({ force: true })
    await tab.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')

    expect(page.url()).toBe(url)
    expect(page.url()).not.toContain('team=')
    await expect(agentTab).toHaveAttribute('aria-pressed', 'true')
    await expect(tab).toHaveAttribute('aria-pressed', 'false')
    expect([await box(tab), await box(agentTab)]).toEqual(before)
  })

  test('o motivo também vai por aria-describedby (sr-only)', async ({
    page
  }) => {
    await openWithoutTeams(page)

    const id = await teamTab(page).getAttribute('aria-describedby')
    await expect(page.locator(`[id="${id}"]`)).toHaveText(
      'Crie um team primeiro'
    )
    await expect(page.locator(`[id="${id}"]`)).toHaveClass(/sr-only/)
  })
})

test.describe('rótulo do provedor', () => {
  test.use({ viewport: { width: 1367, height: 889 } })

  // O fake devolve `Fake`; aqui o mesmo agente chega como o orquestrador real o
  // manda: nome de classe do agno no playground e nas métricas, id gravado na lista.
  const mockProviders = async (page: Page) => {
    await page.route('**/api/playground/agents', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.data[0].model = { provider: 'Google', model: 'gemini-2.0-flash' }
      body.data[1].model = { provider: 'Azure', model: 'gpt-4o' }
      await route.fulfill({ response, json: body })
    })
    await page.route(/\/api\/agents(\?.*)?$/, async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      const byId = new Map<string, { factoryIaModel: string; model: string }>([
        [
          'agente-alfa',
          { factoryIaModel: 'gemini', model: 'gemini-2.0-flash' }
        ],
        ['agente-beta', { factoryIaModel: 'azureopenai', model: 'gpt-4o' }]
      ])
      for (const agent of body.data.data)
        Object.assign(agent, byId.get(agent.id))
      await route.fulfill({ response, json: body })
    })
    await page.route(/\/api\/dashboard\/stats/, async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.data.models = [
        { name: 'gemini-2.0-flash', provider: 'Google', count: 2 },
        { name: 'gpt-4o', provider: 'Azure', count: 1 },
        { name: 'fake-model', provider: 'Fake', count: 1 }
      ]
      await route.fulfill({ response, json: body })
    })
  }

  test('o mesmo provedor tem o mesmo rótulo no Playground, nas listas e no Dashboard', async ({
    page
  }) => {
    await mockProviders(page)

    await page.goto('/playground')
    await hydrated(page)
    const card = page
      .locator('aside')
      .getByRole('combobox', { name: 'Agente: Agente Alfa' })
    await expect(card).toContainText('Google Gemini · gemini-2.0-flash')
    await expect(card).not.toContainText('Google/')

    await page.goto('/agents')
    const alfa = page.getByRole('row', { name: /Agente Alfa/ })
    await expect(alfa).toContainText('Google Gemini · gemini-2.0-flash')
    await expect(page.getByRole('row', { name: /Agente Beta/ })).toContainText(
      'Azure OpenAI · gpt-4o'
    )

    await page.goto('/dashboard')
    await expect(page.getByText('Google Gemini', { exact: true })).toBeVisible()
    await expect(page.getByText('Azure OpenAI', { exact: true })).toBeVisible()
    // Fora do mapa: como veio (o card de embedding também mostra `Fake`).
    await expect(page.getByText('Fake', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Google/')).toHaveCount(0)
  })

  test('provedor fora do mapa aparece como veio no Playground (o fake devolve Fake)', async ({
    page
  }) => {
    await page.goto('/playground')
    await hydrated(page)

    await expect(
      page
        .locator('aside')
        .getByRole('combobox', { name: 'Agente: Agente Alfa' })
    ).toContainText('Fake · fake-model')
  })
})
