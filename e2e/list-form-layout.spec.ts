import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'
import { TEST_ENV } from './test-env'

// QA1-10 (#8, #20, #21): "Novo …" e "Voltar" no mesmo lugar nas três listas e
// nos três formulários, em 1367 e em 390 px. As listas vêm do fake orchestrator
// pelo BFF; só o atraso da resposta (para ver o esqueleto dos chips) é do
// `page.route`, que repassa a resposta real.

const VIEWPORTS = [
  { width: 1367, height: 889 },
  { width: 390, height: 844 }
]
const LISTS = [
  { path: 'agents', api: /\/api\/agents(\?.*)?$/, create: /^Novo agente$/ },
  { path: 'teams', api: /\/api\/teams(\?.*)?$/, create: /^Novo team$/ },
  { path: 'tools', api: /\/api\/tools(\?.*)?$/, create: /^Nova tool$/ }
]
const admin = { Authorization: `Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}` }
const RUN = Date.now().toString(36)
const TOOLS = `${FAKE_ORCHESTRATOR_URL}/admin/config/tools`

const chipRegion = (page: Page) => page.locator('[aria-live="polite"][aria-atomic="true"]').first()
const skeletons = (page: Page) => chipRegion(page).locator('[aria-hidden="true"]')

/** Segura as respostas de `api` até `release()` e então repassa a do fake. */
async function holdList(page: Page, api: RegExp) {
  let release: () => void = () => undefined
  let gate = new Promise<void>((resolve) => (release = resolve))
  await page.route(api, async (route) => {
    const waiting = gate
    const response = await route.fetch()
    await waiting
    await route.fulfill({ response })
  })
  return {
    release: () => release(),
    hold: () => {
      gate = new Promise<void>((resolve) => (release = resolve))
    }
  }
}

const box = async (locator: ReturnType<Page['locator']>) => {
  const found = await locator.boundingBox()
  if (!found) throw new Error('elemento sem caixa')
  return found
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width} px`, () => {
    test.use({ viewport })

    test('"Novo …" fica no mesmo y nas três listas, carregando, pronta e buscando', async ({ page }) => {
      const ys: number[] = []
      const widths: number[] = []

      for (const list of LISTS) {
        const control = await holdList(page, list.api)
        await page.goto(`/${list.path}`)
        const create = page.getByRole('main').getByRole('link', { name: list.create })
        await expect(create).toBeVisible()

        // Carregando: 3 esqueletos de chip (24 px, sem texto), header já montado.
        await expect(skeletons(page)).toHaveCount(3)
        for (const skeleton of await skeletons(page).all()) expect((await box(skeleton)).height).toBe(24)
        await expect(chipRegion(page)).toHaveText('')
        ys.push((await box(create)).y)

        control.release()
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
        await expect(chipRegion(page).getByText(/^\d+ /)).not.toHaveCount(0)
        ys.push((await box(create)).y)
        await hydrated(page)

        // Buscando: o input é o mesmo nó, com o foco, e os chips viram esqueleto.
        const search = page.locator('input#search')
        await search.evaluate((node) => node.setAttribute('data-probe', 'mesmo-no'))
        widths.push((await box(search)).width)
        control.hold()
        await search.click()
        await search.pressSequentially('zz')
        await expect(skeletons(page)).toHaveCount(3)
        await expect(search).toBeFocused()
        await expect(search).toHaveAttribute('data-probe', 'mesmo-no')
        ys.push((await box(create)).y)

        control.release()
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
        await expect(search).toHaveAttribute('data-probe', 'mesmo-no')
        ys.push((await box(create)).y)
        await page.unroute(list.api)
      }

      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1)
      if (viewport.width > 700) expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
    })

    test('"Voltar" no mesmo x e y nos três formulários, novos e de edição', async ({ page, request }) => {
      const toolId = `e2e-layout-${RUN}-${viewport.width}`
      const created = await request.post(TOOLS, {
        headers: admin,
        data: {
          id: toolId,
          name: 'Tool do layout',
          description: 'QA1-10',
          route: 'https://layout.example/v1',
          http_method: 'GET',
          parameters: []
        }
      })
      expect(created.status()).toBe(201)

      try {
        const pages = [
          '/agents/new',
          '/teams/new',
          '/tools/new',
          '/agents/agente-beta',
          '/teams/time-config',
          `/tools/${toolId}`
        ]
        const positions: { x: number; y: number }[] = []
        for (const path of pages) {
          await page.goto(path)
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
          await hydrated(page)
          const back = page.getByRole('main').getByRole('link', { name: 'Voltar' }).first()
          await expect(back).toBeVisible()
          const { x, y } = await box(back)
          positions.push({ x, y })
          const scrolls = await page.evaluate(() => {
            const main = document.querySelector('main')
            return main ? main.scrollWidth <= main.clientWidth : false
          })
          expect(scrolls, `${path} sem rolagem horizontal`).toBe(true)
        }
        const xs = positions.map((p) => p.x)
        const ys = positions.map((p) => p.y)
        expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(1)
        expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1)
      } finally {
        await removeTool(request, toolId)
      }
    })
  })
}

// #25: o card "Tools disponíveis" não muda de altura quando as tools chegam e o
// estado é o vazio (a resposta de /api/tools é segurada para medir o esqueleto).
for (const viewport of VIEWPORTS) {
  test(`card "Tools disponíveis": mesma altura carregando e vazio em ${viewport.width} px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route(/\/api\/tools(\?.*)?$/, async (route) => {
      await gate
      await route.fulfill({
        json: { success: true, data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 } }
      })
    })
    await page.goto('/agents/new')
    const card = page.getByRole('region', { name: 'Tools disponíveis' })
    await expect(card).toBeVisible()
    await expect(card.getByText('Nenhuma tool disponível.')).toHaveCount(0)
    const loading = await box(card)

    release()
    await expect(card.getByRole('link', { name: 'Criar tool' })).toBeVisible()
    const empty = await box(card)
    expect(Math.abs(empty.height - loading.height), `${loading.height} -> ${empty.height}`).toBeLessThanOrEqual(1)
  })
}

// #17: o diff do diálogo "Restaurar a vN?" usa a altura do diálogo e só rola
// quando o conteúdo passa dela; o rodapé fica sempre à vista.
const toolV = (id: string, label: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Nome ${label}`,
  description: `Descrição ${label}`,
  route: `https://restaurar.example/${label}`,
  http_method: 'GET',
  instructions: `Instruções ${label}`,
  parameters: [],
  ...extra
})
const manyParameters = (label: string) =>
  Array.from({ length: 12 }, (_, i) => ({
    name: `campo_${i}`,
    type: 'string',
    description: `Parâmetro ${i} ${label}`,
    required: false
  }))

async function openRestore(page: Page, request: APIRequestContext, id: string, v2Extra: Record<string, unknown>) {
  expect((await request.post(TOOLS, { headers: admin, data: toolV(id, 'v1') })).status()).toBe(201)
  const put = await request.put(`${TOOLS}/${id}`, {
    headers: { ...admin, 'If-Match': '"1"' },
    data: toolV(id, 'v2', v2Extra)
  })
  expect(put.status()).toBe(200)
  await page.goto(`/tools/${id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Editar tool' })).toBeVisible()
  await hydrated(page)
  await page.getByRole('button', { name: 'Histórico' }).click()
  const sheet = page.getByRole('dialog', { name: 'Histórico de versões' })
  await expect(sheet.getByRole('list', { name: 'Versões' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Restaurar a v1' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Restaurar a v1?' })
  await expect(dialog).toBeVisible()
  return dialog
}

for (const viewport of VIEWPORTS) {
  test.describe(`diff do Restaurar em ${viewport.width} px`, () => {
    test.use({ viewport })

    test('diff médio cabe no diálogo sem rolar por dentro; o rodapé fica à vista', async ({ page, request }) => {
      const id = `e2e-diff-medio-${RUN}-${viewport.width}`
      try {
        const dialog = await openRestore(page, request, id, {})
        const diff = dialog.getByRole('region', { name: 'Campos que mudam' })
        const size = await diff.evaluate((node) => ({ scroll: node.scrollHeight, client: node.clientHeight }))
        const footer = await box(dialog.getByRole('button', { name: 'Restaurar a v1' }))
        const bottom = footer.y + footer.height
        expect(bottom).toBeLessThanOrEqual(viewport.height)
        // Só o diálogo limita a altura (sem o teto de 320 px / 40dvh do diff); no celular o diff
        // passa da altura e rola, mas ocupa mais que o teto antigo.
        if (viewport.width > 700) expect(size.scroll).toBeLessThanOrEqual(size.client)
        else expect(size.client).toBeGreaterThan(viewport.height * 0.4)
      } finally {
        await removeTool(request, id)
      }
    })

    test('diff longo rola dentro do diálogo e o rodapé segue à vista', async ({ page, request }) => {
      const id = `e2e-diff-longo-${RUN}-${viewport.width}`
      try {
        const dialog = await openRestore(page, request, id, { parameters: manyParameters('v2') })
        const diff = dialog.getByRole('region', { name: 'Campos que mudam' })
        const size = await diff.evaluate((node) => ({ scroll: node.scrollHeight, client: node.clientHeight }))
        expect(size.scroll).toBeGreaterThan(size.client)
        const footer = await box(dialog.getByRole('button', { name: 'Restaurar a v1' }))
        expect(footer.y + footer.height).toBeLessThanOrEqual(viewport.height)
        const frame = await box(dialog)
        expect(frame.y + frame.height).toBeLessThanOrEqual(viewport.height)
        // O diálogo inteiro não rola: só o diff.
        const dialogScrolls = await dialog.evaluate((node) => node.scrollHeight > node.clientHeight)
        expect(dialogScrolls).toBe(false)
      } finally {
        await removeTool(request, id)
      }
    })
  })
}

async function removeTool(request: APIRequestContext, id: string) {
  const current = await request.get(`${TOOLS}/${id}`, { headers: admin })
  if (!current.ok()) return
  const { version } = await current.json()
  await request.delete(`${TOOLS}/${id}?hard=true`, { headers: { ...admin, 'If-Match': `"${version}"` } })
}
