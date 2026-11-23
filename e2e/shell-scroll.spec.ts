import { expect, test, type Page, type Request } from '@playwright/test'

import { hydrated } from './hydration'

// QA1-01 (#1): header e sidebar nunca saem da tela; só o `main#conteudo` rola.
// Os inputs nativos ocultos do Radix (Select, Switch) são `position:absolute`:
// sem containing block no `main`, o documento ganhava rolagem e o foco os
// levava para fora da tela.

const VIEWPORTS = [
  { name: 'desktop', size: { width: 1367, height: 889 } },
  { name: 'mobile', size: { width: 390, height: 844 } }
] as const

// Rolagem do documento nula; a casca continua na tela; o fim do formulário
// (Salvar e Cancelar) se alcança rolando o `main`.
async function expectShellFixed(page: Page, isDesktop: boolean) {
  const metrics = await page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollHeight: window.document.documentElement.scrollHeight,
    innerHeight: window.innerHeight
  }))
  expect(metrics.scrollY).toBe(0)
  expect(metrics.scrollHeight).toBe(metrics.innerHeight)

  await expect(page.getByRole('banner')).toBeInViewport()
  await expect(
    isDesktop
      ? page.getByRole('navigation', { name: 'Navegação principal' })
      : page.getByRole('button', { name: 'Abrir menu' })
  ).toBeInViewport()

  await page.locator('main#conteudo').evaluate((main) => main.scrollTo(0, main.scrollHeight))
  await expect(page.getByRole('button', { name: 'Salvar' })).toBeInViewport()
  await expect(page.getByRole('link', { name: 'Cancelar' })).toBeInViewport()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
}

async function fillToolBasics(page: Page, id: string, route: string) {
  await page.goto('/tools/new')
  await hydrated(page)
  await page.getByLabel(/^ID da tool/).fill(id)
  await page.getByLabel(/^Nome \*/).fill('Tool do shell')
  await page.getByLabel(/^Descrição \*/).fill('Shell fixo')
  await page.getByLabel(/^Rota/).fill(route)
}

for (const { name, size } of VIEWPORTS) {
  test.describe(`shell fixo em ${name} (${size.width}x${size.height})`, () => {
    test.use({ viewport: size })
    const isDesktop = name === 'desktop'

    test('/tools/new: parâmetro criado pela rota não rola o documento', async ({ page }) => {
      await fillToolBasics(page, 'e2e-shell-tool', 'https://api.loja.example/anything/{order_id}')
      await page.getByRole('button', { name: 'Criar parâmetro order_id' }).click()
      await expect(page.getByRole('list', { name: 'Parâmetros' })).toBeVisible()
      await expectShellFixed(page, isDesktop)
    })

    test('/agents/new: ligar "Habilitar RAG" não rola o documento', async ({ page }) => {
      await page.goto('/agents/new')
      await hydrated(page)
      const rag = page.getByRole('region', { name: 'Configuração RAG' })
      await rag.getByRole('switch', { name: 'Habilitar RAG' }).click()
      await expect(rag.getByRole('textbox', { name: 'Nome do documento *' })).toBeVisible()
      await expectShellFixed(page, isDesktop)
    })

    test('tool que volta 422 não rola o documento', async ({ page }) => {
      await fillToolBasics(page, 'e2e-shell-recusada', 'https://{host}.example.com/v1/previsao')
      await page.getByRole('button', { name: 'Criar parâmetro host' }).click()
      await page.getByLabel(/^Descrição \*/).last().fill('Host')
      const saved = page.waitForResponse((response) => response.url().endsWith('/api/tools'))
      await page.getByRole('button', { name: 'Salvar' }).click()
      expect((await saved).status()).toBe(422)
      await expect(page.getByText('Não foi possível salvar a tool (código 422)')).toBeVisible()
      await expectShellFixed(page, isDesktop)
    })
  })
}

// #29: o cabeçalho tem fundo sólido (token), sem translucidez nem backdrop.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`cabeçalho mobile opaco no tema ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme })
    await page.goto('/agents')
    await hydrated(page)
    if (colorScheme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    const style = await page.getByRole('banner').evaluate((header) => {
      const { backgroundColor, backdropFilter } = getComputedStyle(header)
      return { backgroundColor, backdropFilter }
    })
    expect(style.backgroundColor).toMatch(/^rgb\(/)
    expect(style.backdropFilter).toBe('none')
  })
}

// #30: o clique na sidebar mostra o carregamento antes da página nova. O
// router só tem o fallback do loading.tsx na mão se prefetchou a rota, e o
// `next dev` não prefetcha: roda no build de produção (CI). O fetch RSC da
// navegação (sem o header de prefetch) é segurado no teste.
test('clique na sidebar mostra o carregamento enquanto a página nova não chega', async ({ page }) => {
  test.skip(!process.env.CI, 'next dev não prefetcha rotas; roda com CI=1 (build de produção)')
  const isPrefetch = (request: Request) => 'next-router-prefetch' in request.headers()
  const prefetched = page.waitForResponse(
    (response) => /\/tools\?_rsc=/.test(response.url()) && isPrefetch(response.request())
  )
  await page.goto('/agents')
  await hydrated(page)
  await prefetched

  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route(/\/tools\?_rsc=/, async (route) => {
    if (!isPrefetch(route.request())) await held
    await route.continue()
  })

  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Tools' }).click()
  await expect(page.locator('main#conteudo [aria-busy="true"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tools', level: 1 })).toHaveCount(0)

  release()
  await expect(page.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible()
  await expect(page.locator('main#conteudo [aria-busy="true"]')).toHaveCount(0)
})
