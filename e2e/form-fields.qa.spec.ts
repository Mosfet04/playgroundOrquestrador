import { expect, test, type Locator, type Page } from '@playwright/test'

import { APP_URL, FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'

// QA1-05 (QA): o que e2e/form-fields.spec.ts não alcança. Team (aria, borda,
// anel e y do campo seguinte), fundo e erro no tema escuro, rolagem horizontal
// (V11), badges do título (V3), contraste do Switch desabilitado nos dois
// temas (V10) e a borda de erro do /login (perdeu o `variant`).

const SIZES = [
  { name: 'desktop', size: { width: 1367, height: 889 }, height: 36 },
  { name: 'mobile', size: { width: 390, height: 844 }, height: 40 }
] as const
const SCHEMES = ['light', 'dark'] as const

const tokenColor = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('div')
    probe.style.color = `hsl(var(--${name}))`
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, token)

const channels = (rgb: string) => rgb.slice(rgb.indexOf('(') + 1, rgb.lastIndexOf(')'))

const contentY = (locator: Locator) =>
  locator.evaluate((element) => {
    const main = document.querySelector('main#conteudo') as HTMLElement
    return element.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop
  })

// V5 e V8: borda de erro em todo inválido, foco no 1º, anel de erro sem o brilho primário.
// Fora os checkbox/radio dos cartões de opção (OptionCard): o controle nativo não tem
// borda própria e o QA1-05-B1 abaixo documenta que o cartão não ganha borda de erro.
const TEXT_INVALID = '[aria-invalid="true"]:not([type="checkbox"]):not([type="radio"])'
async function expectErrorStyle(page: Page, selector = TEXT_INVALID) {
  const destructive = await tokenColor(page, 'destructive')
  const primary = channels(await tokenColor(page, 'primary'))
  const invalid = page.locator(selector)
  await expect(invalid.first()).toBeFocused()
  const borders = await invalid.evaluateAll((elements) =>
    elements.map((element) => {
      const css = getComputedStyle(element)
      return { id: element.id, color: css.borderTopColor, width: css.borderTopWidth }
    })
  )
  expect(borders.length).toBeGreaterThan(0)
  for (const border of borders) expect(border, border.id).toEqual({ ...border, color: destructive, width: '1px' })
  const ring = await invalid.first().evaluate((element) => getComputedStyle(element).boxShadow)
  expect(ring).toContain(channels(destructive))
  expect(ring).not.toContain(primary)
}

// V11: nem a página nem o conteúdo rolável ganham barra horizontal.
const expectNoHorizontalScroll = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector('main#conteudo') as HTMLElement
    return {
      page: document.documentElement.scrollWidth - window.innerWidth,
      main: main.scrollWidth - main.clientWidth
    }
  })

for (const scheme of SCHEMES) {
  for (const { name, size, height } of SIZES) {
    test.describe(`QA1-05 ${scheme} em ${name}`, () => {
      test.use({ viewport: size, colorScheme: scheme })

      test('fundo igual em Input, TextArea e Select e sem rolagem horizontal, com os erros visíveis', async ({
        page
      }) => {
        const routes = [
          { path: '/agents/new', ready: '#factoryIaModel', fields: '#id, #descricao, #factoryIaModel' },
          { path: '/teams/new', ready: '#factoryIaModel', fields: '#id, #descricao, #factoryIaModel' },
          { path: '/tools/new', ready: '#http_method', fields: '#id, #description, #http_method, #route' }
        ]
        for (const { path, ready, fields } of routes) {
          await page.goto(path)
          await hydrated(page)
          if (scheme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/)
          await expect(page.locator(ready)).toBeEnabled()

          // V4: fundo = --background resolvido, nos três tipos de controle.
          const background = await tokenColor(page, 'background')
          const backgrounds = await page
            .locator(fields)
            .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor))
          expect(backgrounds.length).toBeGreaterThanOrEqual(3)
          for (const value of backgrounds) expect(value, path).toBe(background)

          // V1 no tema: altura do campo não depende do tema.
          const heights = await page
            .locator('#id, #http_method, #factoryIaModel')
            .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height))
          for (const value of heights) expect(value, path).toBeCloseTo(height, 0)

          await page.getByRole('button', { name: 'Salvar' }).click()
          await expect(page.locator('#id')).toHaveAttribute('aria-invalid', 'true')
          await expectErrorStyle(page)

          // V7: texto do slot = --destructive.
          const destructive = await tokenColor(page, 'destructive')
          const messageColor = await page
            .locator('#id-error')
            .evaluate((element) => getComputedStyle(element).color)
          expect(messageColor).toBe(destructive)

          // V11
          const overflow = await expectNoHorizontalScroll(page)
          expect(overflow.page, `${path} documento`).toBeLessThanOrEqual(0)
          expect(overflow.main, `${path} conteúdo`).toBeLessThanOrEqual(0)
        }
      })

      test('/teams/new: erro aparece e some sem mover o campo seguinte', async ({ page }) => {
        await page.goto('/teams/new')
        await hydrated(page)
        await expect(page.locator('#factoryIaModel')).toBeEnabled()

        const probes = [page.locator('#descricao'), page.locator('#prompt'), page.getByRole('button', { name: 'Salvar' })]
        const before = await Promise.all(probes.map(contentY))

        await page.getByRole('button', { name: 'Salvar' }).click()
        await expect(page.locator('#id')).toHaveAttribute('aria-invalid', 'true')
        await expect(page.locator('#id-error')).not.toBeEmpty()
        await expect(page.locator('#nome')).toHaveAttribute('aria-invalid', 'true')
        expect(await Promise.all(probes.map(contentY))).toEqual(before)

        await page.locator('#id').fill('time-qa')
        await page.locator('#nome').fill('Time QA')
        await page.locator('#model').fill('llama3.2')
        await expect(page.locator(TEXT_INVALID)).toHaveCount(0)
        expect(await Promise.all(probes.map(contentY))).toEqual(before)
      })
    })
  }
}

// QA1-05-B1: Salvar vazio no team marca o 1º membro com aria-invalid; o cartão (OptionCard)
// ganha a borda de erro, como todo campo inválido (critério do item).
test('QA1-05-B1: cartão do membro inválido do team tem borda de erro', async ({ page }) => {
  await page.goto('/teams/new')
  await hydrated(page)
  await expect(page.locator('#factoryIaModel')).toBeEnabled()
  await page.getByRole('button', { name: 'Salvar' }).click()
  const member = page.locator('#team-member-0')
  await expect(member).toHaveAttribute('aria-invalid', 'true')
  const destructive = await tokenColor(page, 'destructive')
  const border = await member.evaluate((element) => getComputedStyle(element.parentElement!).borderTopColor)
  expect(border).toBe(destructive)
})

// V10 nos dois temas: o desabilitado se distingue por forma e passa 3:1.
// Mede no navegador, compondo as cores sobre a superfície real atrás do switch.
const measureSwitch = (locator: Locator) =>
  locator.evaluate((element) => {
    type Rgba = { r: number; g: number; b: number; a: number }
    const parse = (value: string): Rgba => {
      const match = value.match(/rgba?\(([^)]+)\)/)
      if (!match) throw new Error(`cor inesperada: ${value}`)
      const [r, g, b, a] = match[1]!.split(/[ ,/]+/).filter(Boolean).map(Number)
      return { r: r!, g: g!, b: b!, a: a ?? 1 }
    }
    const over = (top: Rgba, under: Rgba): Rgba => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
      a: 1
    })
    const lum = ({ r, g, b }: Rgba) => {
      const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }
    const ratio = (a: Rgba, b: Rgba) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (hi! + 0.05) / (lo! + 0.05)
    }
    let surface: Rgba = { r: 255, g: 255, b: 255, a: 1 }
    const layers: Rgba[] = []
    for (let node = element.parentElement; node; node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor)
      if (bg.a > 0) layers.push(bg)
      if (bg.a === 1) break
    }
    for (const layer of layers.reverse()) surface = over(layer, surface)
    const css = getComputedStyle(element)
    const thumb = parse(getComputedStyle(element.firstElementChild!).backgroundColor)
    const opacity = Number(css.opacity)
    const track = parse(css.backgroundColor)
    const trackOnSurface = over({ ...track, a: track.a * opacity }, surface)
    return {
      opacity,
      trackAlpha: track.a,
      trackVsSurface: ratio(trackOnSurface, surface),
      thumbVsTrack: ratio(over({ ...thumb, a: opacity }, surface), trackOnSurface),
      borderVsSurface: ratio(parse(css.borderTopColor), surface),
      thumbVsSurface: ratio(over({ ...thumb, a: opacity }, surface), surface)
    }
  })

for (const scheme of SCHEMES) {
  test(`Switch desabilitado: contraste >= 3:1 e distinto do habilitado (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/agents/new')
    await hydrated(page)
    if (scheme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    const expose = page.getByRole('switch', { name: 'Expor raciocínio' })
    const reasoning = page.getByRole('switch', { name: 'Raciocínio passo a passo' })
    await expect(expose).toBeDisabled()
    await expect(expose).toBeChecked()
    // Espera a transição do Switch (`transition`) acabar.
    await expect.poll(async () => (await measureSwitch(expose)).opacity).toBe(0.7)

    const onDisabled = await measureSwitch(expose)
    expect(onDisabled.trackVsSurface, 'trilho ligado desabilitado x superfície').toBeGreaterThanOrEqual(3)
    expect(onDisabled.thumbVsTrack, 'polegar x trilho ligado desabilitado').toBeGreaterThanOrEqual(3)

    // Habilitado (ligado): opacidade cheia, para o desabilitado se distinguir dele.
    await reasoning.click()
    await expect(expose).toBeEnabled()
    await expect.poll(async () => (await measureSwitch(expose)).opacity).toBe(1)
    const onEnabled = await measureSwitch(expose)
    expect(onEnabled.trackVsSurface).toBeGreaterThan(onDisabled.trackVsSurface)

    await expose.click()
    await expect(expose).not.toBeChecked()
    await reasoning.click()
    await expect(expose).toBeDisabled()
    await expect.poll(async () => (await measureSwitch(expose)).trackAlpha).toBe(0)
    const offDisabled = await measureSwitch(expose)
    expect(offDisabled.borderVsSurface, 'borda do desligado desabilitado x superfície').toBeGreaterThanOrEqual(3)
    expect(offDisabled.thumbVsSurface, 'polegar do desligado desabilitado x superfície').toBeGreaterThanOrEqual(3)
  })
}

// V3: badges do título com 24 px e centrados no h1 (na mesma linha).
for (const { name, size } of SIZES) {
  test.describe(`badges do título em ${name}`, () => {
    test.use({ viewport: size })

    const expectBadges = async (page: Page) => {
      const h1 = page.getByRole('heading', { level: 1 })
      await expect(h1).toBeVisible()
      const row = h1.locator('..')
      // Por texto, não pela estrutura: versão (`v1`) e status (Ativo/Ativa/Inativo/Inativa).
      const badges = [row.getByText(/^v\d+$/), row.getByText(/^(Ativ[oa]|Inativ[oa])$/)]
      const h1Box = (await h1.boundingBox())!
      for (const badge of badges) {
        await expect(badge).toBeVisible()
        const box = (await badge.boundingBox())!
        expect(box.height, 'altura do badge').toBeCloseTo(24, 0)
        const offset = Math.abs(box.y + box.height / 2 - (h1Box.y + h1Box.height / 2))
        if (size.width >= 768) {
          // Desktop: o título cabe numa linha, o badge fica centrado nele.
          expect(offset, 'centro do badge').toBeLessThanOrEqual(1)
        } else {
          // Celular: ou centrado no h1, ou quebrou para a linha de baixo (flex-wrap), nunca no meio.
          const below = box.y >= h1Box.y + h1Box.height - 1
          expect(offset <= 1 || below, `badge nem centrado (${offset} px) nem abaixo do h1`).toBe(true)
        }
      }
      if (size.width >= 768) {
        const back = (await page.getByRole('link', { name: 'Voltar' }).boundingBox())!
        expect(back.height, 'Voltar').toBeCloseTo(36, 0)
      }
    }

    test('agent e team em edição', async ({ page }) => {
      for (const path of ['/agents/agente-alfa', '/teams/time-config']) {
        await page.goto(path)
        await hydrated(page)
        await expectBadges(page)
      }
    })

    test('tool em edição', async ({ page }) => {
      // Id único por execução: o fake é reaproveitado localmente e outros specs listam as tools.
      const id = `qa105-badges-${name}-${Date.now()}`
      try {
        await page.goto('/tools/new')
        await hydrated(page)
        await expect(page.locator('#http_method')).toBeEnabled()
        await page.locator('#id').fill(id)
        await page.locator('#name').fill('Badges')
        await page.locator('#description').fill('Tool para medir os badges')
        await page.locator('#route').fill('https://api.example.com/v1')
        const saved = page.waitForResponse(
          (response) => response.url().endsWith('/api/tools') && response.request().method() === 'POST'
        )
        await page.getByRole('button', { name: 'Salvar' }).click()
        expect((await saved).ok()).toBe(true)
        await page.goto(`/tools/${id}`)
        await hydrated(page)
        await expectBadges(page)
      } finally {
        // Limpa mesmo se um expect falhou; tolera tool que nunca chegou a ser criada.
        try {
          const stored = await fetch(`${FAKE_ORCHESTRATOR_URL}/test/config/tools/${encodeURIComponent(id)}`)
          if (stored.ok) {
            const { version } = (await stored.json()) as { version: number }
            await page.request.delete(`/api/tools/${id}`, {
              headers: { origin: APP_URL, 'if-match': String(version) }
            })
          }
        } catch {
          // Limpeza de melhor esforço: não esconde a falha do teste.
        }
      }
    })
  })
}

// /login perdeu o `variant`: a borda e o anel de erro vêm de `aria-invalid`.
test.describe('login com campos vazios', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const { name, size, height } of SIZES) {
    for (const scheme of SCHEMES) {
      test(`borda e anel de erro em ${name}, tema ${scheme}`, async ({ page }) => {
        await page.setViewportSize(size)
        await page.emulateMedia({ colorScheme: scheme })
        await page.goto('/login')
        await hydrated(page)
        if (scheme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/)
        const username = page.getByLabel('Usuário')
        const password = page.getByLabel('Senha')
        await expect(username).not.toHaveAttribute('aria-invalid', 'true')
        expect((await username.boundingBox())!.height).toBeCloseTo(height, 0)

        await page.getByRole('button', { name: 'Entrar' }).click()
        await expect(username).toHaveAttribute('aria-invalid', 'true')
        await expect(password).toHaveAttribute('aria-invalid', 'true')
        await expectErrorStyle(page)

        // Fora de foco, a borda segue de erro nos dois campos.
        const destructive = await tokenColor(page, 'destructive')
        await page.getByRole('heading', { level: 1 }).click()
        for (const field of [username, password]) {
          await expect(field).not.toBeFocused()
          expect(await field.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(destructive)
          const describedby = (await field.getAttribute('aria-describedby'))!
          await expect(page.locator(`[id="${describedby}"]`)).not.toBeEmpty()
        }
      })
    }
  }
})
