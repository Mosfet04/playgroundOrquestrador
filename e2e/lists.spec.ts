import { expect, test, type Page } from '@playwright/test'

import { hydrated } from './hydration'

// P1-05b: tabela/linhas da lista, chips de contagem e excluir no editor. Até a
// P3, /api/agents* e /api/tools* leem o Mongo: aqui respondem por page.route,
// com estado (o DELETE tira o item da próxima listagem).

const agents = [
  { id: 'alfa', nome: 'Agente Alfa', model: 'llama3.2', factoryIaModel: 'ollama', active: true, tools_ids: [] },
  { id: 'beta', nome: 'Agente Beta', model: 'gpt-4o', factoryIaModel: 'openai', active: false, tools_ids: [] }
]
const tools = [
  {
    id: 'clima',
    name: 'Clima',
    description: 'Tempo',
    route: 'https://api.example.test/clima',
    http_method: 'GET',
    parameters: [],
    active: true
  }
]

/** Mock com estado de /api/<kind>(/<id>); devolve as queries da listagem. */
async function mockCollection<T extends { id: string }>(
  page: Page,
  kind: 'agents' | 'tools',
  initial: T[]
) {
  let items = [...initial]
  const listQueries: string[] = []
  await page.route(new RegExp(`/api/${kind}(/[^?]*)?(\\?.*)?$`), (route) => {
    const url = new URL(route.request().url())
    const id = decodeURIComponent(url.pathname.slice(`/api/${kind}/`.length))
    if (url.pathname === `/api/${kind}`) {
      listQueries.push(url.search)
      return route.fulfill({
        json: {
          success: true,
          data: { data: items, total: items.length, page: 1, limit: 100, totalPages: 1 }
        }
      })
    }
    const item = items.find((entry) => entry.id === id)
    if (!item) return route.fulfill({ status: 404, json: { success: false, error: 'x' } })
    if (route.request().method() === 'DELETE') {
      items = items.filter((entry) => entry !== item)
      return route.fulfill({ json: { success: true } })
    }
    return route.fulfill({ json: { success: true, data: item } })
  })
  return listQueries
}

const countChips = (page: Page) => page.locator('[aria-live="polite"][aria-atomic="true"] > *')

test('V-P1-05b-7: excluir agente no editor volta à lista com toast, foco no h1 e chips atualizados', async ({
  page
}) => {
  const queries = await mockCollection(page, 'agents', agents)
  await mockCollection(page, 'tools', [])
  await page.goto('/agents')
  await expect(countChips(page)).toHaveText(['2 agentes', '1 ativo', '1 inativo'])
  expect(queries[0]).toBe('?limit=100')

  await hydrated(page)
  await page.getByRole('link', { name: 'Agente Alfa' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Editar agente' })).toBeVisible()

  const remove = page.getByRole('button', { name: 'Excluir agente' })
  await remove.click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(remove).toBeFocused()

  await remove.click()
  const dialog = page.getByRole('dialog', { name: 'Excluir agente' })
  await dialog.getByRole('button', { name: 'Excluir' }).click()

  await expect(page).toHaveURL('/agents')
  await expect(page.locator('[data-sonner-toast]').getByText('Agente excluído')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Gerenciamento de agentes' })).toBeFocused()
  await expect(page.getByRole('link', { name: 'Agente Beta' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Agente Alfa' })).toHaveCount(0)
  await expect(countChips(page)).toHaveText(['1 agente', '0 ativos', '1 inativo'])
})

test('a rota e a data mostram o title no hover (o link esticado não cobre)', async ({ page }) => {
  await mockCollection(page, 'tools', tools)
  await mockCollection(page, 'agents', [{ ...agents[0], updated_at: '2026-10-16T13:12:00.000Z' }])
  await page.goto('/tools')
  await page.getByRole('table').getByTitle('https://api.example.test/clima').hover()

  await page.goto('/agents')
  await page.getByRole('table').locator('time').hover()
})

test('V-P1-05b-7: excluir tool no editor; /tools/new não tem "Excluir tool"', async ({ page }) => {
  await mockCollection(page, 'tools', tools)
  await page.goto('/tools/new')
  await expect(page.getByRole('heading', { level: 1, name: 'Nova tool' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Excluir tool' })).toHaveCount(0)

  await page.goto('/tools/clima')
  await hydrated(page)
  await page.getByRole('button', { name: 'Excluir tool' }).click()
  await page.getByRole('dialog', { name: 'Excluir tool' }).getByRole('button', { name: 'Excluir' }).click()

  await expect(page).toHaveURL('/tools')
  await expect(page.locator('[data-sonner-toast]').getByText('Tool excluída')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'O orquestrador ainda não tem tools' })).toBeVisible()
  await expect(countChips(page)).toHaveCount(0)
})

test.describe('390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('V-P1-05b-3: linhas de 64 px, sem rolagem horizontal; editor com Excluir por último', async ({
    page
  }) => {
    await mockCollection(page, 'agents', agents)
    await mockCollection(page, 'tools', [])
    await page.goto('/agents')

    const row = page.getByRole('listitem').filter({ hasText: 'Agente Alfa' })
    await expect(row).toContainText('alfa · ollama/llama3.2')
    expect((await row.boundingBox())?.height).toBe(64)
    await expect(page.getByRole('table')).toBeHidden()
    const main = page.getByRole('main')
    expect(await main.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)

    await row.getByRole('link').click()
    const remove = page.getByRole('button', { name: 'Excluir agente' })
    const save = page.getByRole('button', { name: 'Salvar' })
    const [removeBox, saveBox] = [await remove.boundingBox(), await save.boundingBox()]
    if (!removeBox || !saveBox) throw new Error('botões do rodapé')
    expect(removeBox.y).toBeGreaterThan(saveBox.y)
    expect(removeBox.width).toBe(saveBox.width)
    expect(removeBox.height).toBe(40)
  })

  test('V-P1-05b-8: erro da lista e 404 de rota com o ícone acima do título', async ({ page }) => {
    await page.route(/\/api\/agents(\?.*)?$/, (route) => route.abort())
    await page.goto('/agents')
    const alert = page.getByRole('main').getByRole('alert')
    const icon = await alert.locator('svg.lucide-unplug').boundingBox()
    const title = await alert.getByRole('heading').boundingBox()
    expect(icon && title && icon.y + icon.height <= title.y).toBe(true)

    await page.goto('/rota-inexistente')
    const main = page.getByRole('main')
    const compass = await main.locator('svg.lucide-compass').boundingBox()
    const heading = await main.getByRole('heading', { level: 1 }).boundingBox()
    expect(compass && heading && compass.y + compass.height <= heading.y).toBe(true)
  })
})

test('V-P1-05b-8: em 1440 o ícone do 404 segue à esquerda do título', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/rota-inexistente')
  const main = page.getByRole('main')
  const compass = await main.locator('svg.lucide-compass').boundingBox()
  const heading = await main.getByRole('heading', { level: 1 }).boundingBox()
  expect(compass && heading && compass.x + compass.width <= heading.x).toBe(true)
})
