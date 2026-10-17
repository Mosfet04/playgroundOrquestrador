import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// P1-02 (QA): tokens por tema no browser, aurora, reduced-motion, viewport e
// foco. Não repete e2e/theme.spec.ts (persistência, sistema, sem flash).

type Theme = 'light' | 'dark'
type TokenDef = { name: string; value: string | Record<Theme, string> }
const defs: TokenDef[] = JSON.parse(
  readFileSync('docs/design/P1-01/tokens.json', 'utf8')
).color.tokens

const hexOf = (name: string, theme: Theme): string => {
  const value = defs.find((def) => def.name === name)!.value
  return typeof value === 'string'
    ? hexOf(value.replace(/[{}]/g, ''), theme)
    : value[theme]
}
const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const setTheme = async (page: Page, theme: Theme) => {
  await page.emulateMedia({ colorScheme: theme === 'dark' ? 'light' : 'dark' }) // o oposto: prova que a escolha manda
  await page.addInitScript(
    (value) => localStorage.setItem('theme', value),
    theme
  )
  await page.goto('/')
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
}

for (const theme of ['light', 'dark'] as const) {
  test(`V-P1-02-1: CSS vars computadas do <html> = tokens.json (${theme})`, async ({
    page
  }) => {
    await setTheme(page, theme)
    // Resolve cada var para rgb() pelo browser, como um `color` calculado.
    const computed = await page.evaluate(
      (names) => {
        const probe = document.createElement('span')
        document.body.append(probe)
        const out: Record<string, string> = {}
        for (const name of names) {
          probe.style.color = `hsl(var(--${name}))`
          out[name] = getComputedStyle(probe).color
        }
        probe.remove()
        return out
      },
      defs.map((def) => def.name)
    )

    for (const { name } of defs) {
      const channels = computed[name].match(/[\d.]+/g)!.map(Number)
      hexToRgb(hexOf(name, theme)).forEach((want, i) =>
        expect(
          Math.abs(channels[i] - want),
          `${name} (${theme}): ${computed[name]} vs ${hexOf(name, theme)}`
        ).toBeLessThanOrEqual(2)
      )
    }
  })

  test(`tema ${theme}: color-scheme e fundo do body seguem os tokens`, async ({
    page
  }) => {
    await setTheme(page, theme)
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).colorScheme
      )
    ).toBe(theme)
    const [r, g, b] = hexToRgb(hexOf('background', theme))
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    )
    expect(bodyBg).toBe(`rgb(${r}, ${g}, ${b})`)
  })

  test(`V-P1-02-17: aurora ${theme === 'dark' ? 'presente no escuro' : 'ausente no claro'}`, async ({
    page
  }) => {
    await setTheme(page, theme)
    const image = await page
      .locator('.app-main')
      .evaluate((el) => getComputedStyle(el).backgroundImage)
    if (theme === 'dark') expect(image).toContain('radial-gradient')
    else expect(image).toBe('none')
  })

  test(`V-P1-02-7: \`border\` sem cor usa o token border (${theme})`, async ({
    page
  }) => {
    await setTheme(page, theme)
    const [r, g, b] = hexToRgb(hexOf('border', theme))
    const want = `rgb(${r}, ${g}, ${b})`
    // Card real (Primeiros passos) e um elemento só com a classe `border`.
    const card = page.locator('.rounded-lg.border.bg-card').first()
    await expect(card).toBeVisible()
    expect(
      await card.evaluate((el) => getComputedStyle(el).borderTopColor)
    ).toBe(want)
    const probe = await page.evaluate(() => {
      const el = document.createElement('div')
      el.className = 'border'
      document.body.append(el)
      const color = getComputedStyle(el).borderTopColor
      el.remove()
      return color
    })
    expect(probe).toBe(want)
  })

  test(`V-P1-02-20: polegar da scrollbar usa border (${theme})`, async ({
    page
  }) => {
    await setTheme(page, theme)
    const [r, g, b] = hexToRgb(hexOf('border', theme))
    const thumb = await page.evaluate(
      () =>
        getComputedStyle(
          document.querySelector('.app-main')!,
          '::-webkit-scrollbar-thumb'
        ).backgroundColor
    )
    const channels = thumb.match(/[\d.]+/g)!.map(Number)
    expect(Math.abs(channels[0] - r)).toBeLessThanOrEqual(2)
    expect(Math.abs(channels[1] - g)).toBeLessThanOrEqual(2)
    expect(Math.abs(channels[2] - b)).toBeLessThanOrEqual(2)
  })
}

test('V-P1-02-18: prefers-reduced-motion para animações e transições', async ({
  page
}) => {
  await page.goto('/')
  const animationOf = () =>
    page.evaluate(() => {
      const names = ['animate-pulse', 'animate-spin', 'animate-bounce']
      return names.map((cls) => {
        const el = document.createElement('div')
        el.className = `${cls} transition-colors`
        document.body.append(el)
        const style = getComputedStyle(el)
        const result = {
          cls,
          animation: style.animationName,
          transition: style.transitionProperty
        }
        el.remove()
        return result
      })
    })

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const normal = await animationOf()
  for (const { cls, animation } of normal)
    expect(animation, cls).not.toBe('none')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const { cls, animation, transition } of await animationOf()) {
    expect(animation, cls).toBe('none')
    // transition: none !important zera a propriedade (e a duração fica 0s).
    expect(transition, cls).toBe('none')
  }
})

test.describe('celular', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  })

  test('V-P1-02-19: viewport sem maximum-scale e textarea do chat com 16 px', async ({
    page
  }) => {
    await page.goto('/')
    const viewport = await page
      .locator('meta[name="viewport"]')
      .getAttribute('content')
    expect(viewport).toContain('width=device-width')
    expect(viewport).not.toMatch(/maximum-scale|user-scalable/)

    await page.getByRole('button', { name: 'Abrir menu' }).click()
    await page
      .getByRole('dialog', { name: 'Menu' })
      .getByRole('link', { name: 'Playground' })
      .click()
    const chatInput = page.getByPlaceholder('Pergunte qualquer coisa')
    await expect(chatInput).toBeVisible()
    expect(
      await chatInput.evaluate((el) => getComputedStyle(el).fontSize)
    ).toBe('16px')
  })
})

test('V-P1-02-10: foco por teclado mostra o anel de 2 px em ring', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await page.keyboard.press('Tab')
  const focused = page.locator(':focus-visible')
  await expect(focused).toHaveCount(1)
  const [r, g, b] = hexToRgb(hexOf('ring', 'light'))
  const [br, bg, bb] = hexToRgb(hexOf('background', 'light'))
  // Tailwind: ring-2 = 0 0 0 2px <ring> sobre o offset de 2px (background).
  // A sombra transiciona ao focar: espera estabilizar no valor final.
  await expect
    .poll(() => focused.evaluate((el) => getComputedStyle(el).boxShadow))
    .toMatch(
      new RegExp(
        `^rgb\\(${br}, ${bg}, ${bb}\\) 0px 0px 0px 2px, rgb\\(${r}, ${g}, ${b}\\) 0px 0px 0px 4px`
      )
    )
})
