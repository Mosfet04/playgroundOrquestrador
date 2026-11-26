import { expect, test, type Page } from '@playwright/test'

import { hydrated } from './hydration'

// QA1-11 (QA): o que o e2e do dev não alcança. Chip de provedor da lista de
// Teams (V1/V3: o dev cobriu Playground, Agents e Dashboard) e contraste do
// tooltip da aba desabilitada nos dois temas (V15).

const LONG_MODEL = 'modelo-com-nome-muito-comprido-para-testar-o-corte-do-texto-na-tela'

const mockTeams = (page: Page) =>
  page.route(/\/api\/teams(\?.*)?$/, async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    // O fake tem um team só: o 2º é cópia dele, com outro id, provedor e modelo.
    const [first] = body.data.data
    Object.assign(first, { factoryIaModel: 'google', model: 'gemini-2.0-flash' })
    body.data.data = [
      first,
      { ...first, id: 'time-longo', nome: 'Time Longo', factoryIaModel: 'azureopenai', model: LONG_MODEL }
    ]
    body.data.total = 2
    await route.fulfill({ response, json: body })
  })

for (const width of [1367, 768]) {
  test(`chip de Teams: rótulo único, modelo longo cortado dentro da coluna (${width} px)`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 889 })
    await mockTeams(page)
    await page.goto('/teams')
    await hydrated(page)

    const table = page.getByRole('table')
    await expect(table).toContainText('Google Gemini · gemini-2.0-flash')
    // O alias `google` e o id `azureopenai` saem com o rótulo, não crus.
    await expect(table).not.toContainText('google/')
    const long = table.locator(`span[title="Azure OpenAI · ${LONG_MODEL}"]`)
    await expect(long).toBeVisible()

    const head = await page.getByRole('columnheader', { name: 'Modelo' }).boundingBox()
    const chip = await long.locator('xpath=ancestor::span[contains(@class,"border")][1]').boundingBox()
    if (!head || !chip) throw new Error('sem caixa')
    expect(chip.x + chip.width).toBeLessThanOrEqual(head.x + head.width)
    const scroll = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      inner: window.innerWidth
    }))
    expect(scroll.doc).toBeLessThanOrEqual(scroll.inner)
  })
}

// Razão de contraste WCAG entre duas cores computadas; o canvas normaliza
// qualquer sintaxe (oklch, color-mix) para rgba.
const contrast = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement
    const style = getComputedStyle(el)
    const toRgb = (css: string) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      return Array.from(ctx.getImageData(0, 0, 1, 1).data)
    }
    const lum = ([r, g, b]: number[]) => {
      const [R, G, B] = [r, g, b].map((v) => {
        const c = v / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * R + 0.7152 * G + 0.0722 * B
    }
    const fg = toRgb(style.color)
    const bg = toRgb(style.backgroundColor)
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a)
    return { ratio: (hi + 0.05) / (lo + 0.05), alpha: bg[3], text: el.textContent }
  }, selector)

for (const scheme of ['light', 'dark'] as const) {
  test(`tooltip da aba desabilitada: texto igual e contraste AA no tema ${scheme} (V15)`, async ({
    page
  }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 1367, height: 889 })
    await page.route('**/api/playground/teams', (route) =>
      route.fulfill({ json: { success: true, data: [] } })
    )
    await page.goto('/playground')
    await hydrated(page)
    if (scheme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/)

    await page
      .getByRole('group', { name: 'Conversar com' })
      .getByRole('button', { name: 'Team', exact: true })
      .hover()
    await expect(page.getByRole('tooltip')).toHaveText('Crie um team primeiro')

    // O Radix duplica o texto num nó role=tooltip oculto; o visível é o conteúdo com `bg-popover`.
    const result = await contrast(page, '[data-radix-popper-content-wrapper] > [data-side]')
    expect(result.alpha).toBe(255)
    expect(result.text).toContain('Crie um team primeiro')
    expect(result.ratio).toBeGreaterThanOrEqual(4.5)
  })
}
