import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'
import { TEST_ENV } from './test-env'

// QA do QA1-10: lacunas da revisão que o e2e do dev não cobre.
//   R1 (V8)  diff de 1 linha em 390 e 1367 sem scroll interno, rodapé à vista.
//   R2 (V2)  "Novo …" no mesmo y com lista vazia (sem filtro) e com erro de carga.
//   V9       estado vazio de "Tools disponíveis" em 390 e 1367.

const VIEWPORTS = [
  { width: 1367, height: 889 },
  { width: 390, height: 844 }
]
const admin = { Authorization: `Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}` }
const RUN = Date.now().toString(36)
const TOOLS = `${FAKE_ORCHESTRATOR_URL}/admin/config/tools`

const LISTS = [
  { path: 'agents', api: /\/api\/agents(\?.*)?$/, create: /^Novo agente$/ },
  { path: 'teams', api: /\/api\/teams(\?.*)?$/, create: /^Novo team$/ },
  { path: 'tools', api: /\/api\/tools(\?.*)?$/, create: /^Nova tool$/ }
]

const box = async (locator: ReturnType<Page['locator']>) => {
  const found = await locator.boundingBox()
  if (!found) throw new Error('elemento sem caixa')
  return found
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width} px`, () => {
    test.use({ viewport })

    test('R2: "Novo …" no mesmo y com lista pronta, vazia (sem filtro) e com erro de carga', async ({ page }) => {
      const ys: Record<string, number[]> = {}
      const chipsHeight: number[] = []

      for (const list of LISTS) {
        ys[list.path] = []
        for (const state of ['ready', 'empty', 'error'] as const) {
          await page.unroute(list.api)
          if (state === 'empty') {
            await page.route(list.api, (route) =>
              route.fulfill({
                json: { success: true, data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 } }
              })
            )
          }
          if (state === 'error') {
            await page.route(list.api, (route) =>
              route.fulfill({ status: 503, json: { success: false, error: { code: 'UNAVAILABLE' } } })
            )
          }
          await page.goto(`/${list.path}`)
          const create = page.getByRole('main').getByRole('link', { name: list.create }).first()
          await expect(create).toBeVisible()
          await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
          const region = page.locator('[aria-live="polite"][aria-atomic="true"]').first()
          if (state === 'error') {
            await expect(page.getByRole('alert').first()).toBeVisible()
            await expect(region.locator('> *')).toHaveCount(0)
          } else if (state === 'empty') {
            await expect(region.locator('> *')).toHaveCount(3)
          }
          chipsHeight.push((await box(region)).height)
          ys[list.path].push((await box(create)).y)
        }
        await page.unroute(list.api)
      }

      const all = Object.values(ys).flat()
      expect(Math.max(...all) - Math.min(...all), JSON.stringify(ys)).toBeLessThanOrEqual(1)
      expect(Math.max(...chipsHeight) - Math.min(...chipsHeight)).toBeLessThanOrEqual(1)
    })

    test('V9: "Tools disponíveis" vazio tem ≥ 96 px, link para /tools/new e cabe sem corte', async ({ page }) => {
      await page.route(/\/api\/tools(\?.*)?$/, (route) =>
        route.fulfill({ json: { success: true, data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 } } })
      )
      await page.goto('/agents/new')
      await hydrated(page)
      const card = page.getByRole('region', { name: 'Tools disponíveis' })
      await expect(card.getByText('Nenhuma tool disponível.')).toBeVisible()
      const link = card.getByRole('link', { name: 'Criar tool' })
      await expect(link).toHaveAttribute('href', '/tools/new')
      await link.scrollIntoViewIfNeeded()

      const empty = card.locator('.border-dashed')
      expect((await box(empty)).height).toBeGreaterThanOrEqual(96)
      const frame = await box(empty)
      for (const part of [card.getByText('Nenhuma tool disponível.'), card.getByText(/^Crie uma tool/), link]) {
        const b = await box(part)
        expect(b.x).toBeGreaterThanOrEqual(frame.x - 1)
        expect(b.x + b.width).toBeLessThanOrEqual(frame.x + frame.width + 1)
      }
      expect((await box(link)).height).toBeGreaterThanOrEqual(viewport.width < 700 ? 40 : 36)
      expect(frame.x + frame.width).toBeLessThanOrEqual(viewport.width)

      // Mesmo CardTitle dos outros cards.
      const titleStyle = (id: string) =>
        page.locator(`#${id}`).evaluate((node) => `${getComputedStyle(node).fontSize}/${getComputedStyle(node).fontWeight}`)
      expect(await titleStyle('agent-tools')).toBe(await titleStyle('agent-identity'))

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })

    test('R1 (V8): diff de uma linha não rola por dentro e o rodapé fica à vista', async ({ page, request }) => {
      const id = `e2e-diff-1-${RUN}-${viewport.width}`
      const doc = (name: string) => ({
        id,
        name,
        description: 'Descrição',
        route: 'https://um.example/v1',
        http_method: 'GET',
        parameters: []
      })
      expect((await request.post(TOOLS, { headers: admin, data: doc('Antes') })).status()).toBe(201)
      try {
        const put = await request.put(`${TOOLS}/${id}`, { headers: { ...admin, 'If-Match': '"1"' }, data: doc('Depois') })
        expect(put.status()).toBe(200)
        await page.goto(`/tools/${id}`)
        await expect(page.getByRole('heading', { level: 1, name: 'Editar tool' })).toBeVisible()
        await hydrated(page)
        await page.getByRole('button', { name: 'Histórico' }).click()
        await page
          .getByRole('dialog', { name: 'Histórico de versões' })
          .getByRole('button', { name: 'Restaurar a v1' })
          .click()
        const dialog = page.getByRole('alertdialog', { name: 'Restaurar a v1?' })
        await expect(dialog).toBeVisible()

        const diff = dialog.getByRole('region', { name: 'Campos que mudam' })
        const size = await diff.evaluate((node) => ({ scroll: node.scrollHeight, client: node.clientHeight }))
        expect(size.scroll).toBeLessThanOrEqual(size.client)
        const footer = await box(dialog.getByRole('button', { name: 'Restaurar a v1' }))
        expect(footer.y + footer.height).toBeLessThanOrEqual(viewport.height)
        expect(await dialog.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true)
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
