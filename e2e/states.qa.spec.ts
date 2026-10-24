import { expect, test, type Page } from '@playwright/test'

import { APP_URL } from '../playwright.config'
import { hydrated } from './hydration'

// QA P1-05: o que o dev não cobriu em e2e/states.spec.ts. /api/agents* e
// /api/tools* leem o Mongo até a P3: aqui respondem por page.route.

const page1 = <T,>(data: T[]) => ({
  success: true,
  data: { data, total: data.length, page: 1, limit: 10, totalPages: 1 }
})
// Formato normalizado de GET /api/tools/[id] (src/app/api/tools/[id]/route.ts).
const tool = {
  id: 'clima',
  name: 'Clima',
  description: 'Previsão do tempo',
  route: 'https://api.example.test/clima',
  http_method: 'GET',
  instructions: '',
  headers: {},
  parameters: [],
  active: true,
  http_config: {
    base_url: 'https://api.example.test',
    endpoint: '/clima',
    method: 'GET',
    headers: {},
    parameters: []
  }
}
const agent = {
  id: 'alfa',
  nome: 'Agente Alfa',
  model: 'llama3.2',
  factoryIaModel: 'ollama',
  active: true,
  tools_ids: []
}
const unavailable = { status: 503, json: { success: false, error: 'indisponível' } }
const main = (page: Page) => page.getByRole('main')

test('/tools com a API fora: bloco de erro "offline", sem vazio nem toast; "Tentar de novo" lista', async ({
  page
}) => {
  let up = false
  await page.route(/\/api\/tools(\?.*)?$/, (route) =>
    up ? route.fulfill({ json: page1([tool]) }) : route.abort()
  )
  await page.goto('/tools')

  const alert = main(page).getByRole('alert')
  await expect(alert.getByRole('heading', { name: 'Não foi possível carregar as tools' })).toBeVisible()
  await expect(alert.getByText('offline')).toBeVisible()
  await expect(page.getByText('O orquestrador ainda não tem tools')).toHaveCount(0)
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Nova tool' })).toBeVisible()

  up = true
  await alert.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(page.getByRole('link', { name: 'Clima' })).toBeVisible()
  await expect(main(page).getByRole('alert')).toHaveCount(0)
})

test('/tools com 503: chip "código 503", e falhar de novo mantém o bloco e o botão', async ({
  page
}) => {
  let holding = false
  let retryCalls = 0
  let release: () => void = () => undefined
  await page.route(/\/api\/tools(\?.*)?$/, async (route) => {
    // Depois da 1ª falha, segura a resposta do retry para ver "Tentando…".
    if (holding) {
      retryCalls++
      await new Promise<void>((resolve) => (release = resolve))
    }
    await route.fulfill(unavailable)
  })
  await page.goto('/tools')
  await hydrated(page)

  const alert = main(page).getByRole('alert')
  await expect(alert.getByText('código 503')).toBeVisible()
  holding = true
  await alert.getByRole('button', { name: 'Tentar de novo' }).click()

  const busy = alert.getByRole('button', { name: 'Tentando…' })
  await expect(busy).toHaveAttribute('aria-disabled', 'true')
  expect(retryCalls).toBe(1)
  release()
  await expect(alert.getByRole('button', { name: 'Tentar de novo' })).toBeEnabled()
  await expect(alert.getByText('código 503')).toBeVisible()
  await expect(page.getByText('O orquestrador ainda não tem tools')).toHaveCount(0)
})

for (const [path, kind, empty, create, href] of [
  ['/agents', 'agents', 'O orquestrador ainda não tem agentes', 'Criar primeiro agente', '/agents/new'],
  ['/tools', 'tools', 'O orquestrador ainda não tem tools', 'Criar primeira tool', '/tools/new']
]) {
  test(`${path} vazio: ação primária leva ao /new e "Ver primeiros passos" ao início`, async ({
    page
  }) => {
    await page.route(new RegExp(`/api/${kind}(\\?.*)?$`), (route) =>
      route.fulfill({ json: page1([]) })
    )
    await page.goto(path)
    await hydrated(page)

    await expect(main(page).getByRole('heading', { name: empty })).toBeVisible()
    await expect(main(page).getByRole('alert')).toHaveCount(0)
    await expect(main(page).getByRole('link', { name: create })).toHaveAttribute('href', href)
    await main(page).getByRole('link', { name: 'Ver primeiros passos' }).click()
    await expect(page).toHaveURL('/')
  })
}

test('/agents: o termo da busca (markup e operador Mongo) é renderizado como texto no vazio do filtro e "Limpar filtros" devolve a lista', async ({
  page
}) => {
  const searches: string[] = []
  await page.route(/\/api\/agents(\?.*)?$/, (route) => {
    const search = new URL(route.request().url()).searchParams.get('search')
    if (search) searches.push(search)
    return route.fulfill({ json: page1(search ? [] : [agent]) })
  })
  await page.goto('/agents')
  await hydrated(page)
  await expect(page.getByRole('link', { name: 'Agente Alfa' })).toBeVisible()

  const hostile = '<img src=x onerror=alert(1)>{"$ne":null}'
  await page.getByLabel('Buscar').fill(hostile)

  await expect(page.getByText('Nenhum agente encontrado para', { exact: false })).toBeVisible()
  await expect(main(page).getByText(hostile)).toBeVisible()
  await expect(main(page).locator('img')).toHaveCount(0)
  await expect(page.getByText('O orquestrador ainda não tem agentes')).toHaveCount(0)
  expect(searches.at(-1)).toBe(hostile)

  await page.getByRole('button', { name: 'Limpar filtros' }).click()
  await expect(page.getByRole('link', { name: 'Agente Alfa' })).toBeVisible()
  await expect(page.getByLabel('Buscar')).toBeFocused()
})

test('/agents/nao-existe: 404 do detalhe com chip 404, h1, id em mono e volta para a lista', async ({
  page
}) => {
  await page.route(/\/api\/agents\/nao-existe$/, (route) =>
    route.fulfill({ status: 404, json: { success: false, error: 'não encontrado' } })
  )
  await page.route(/\/api\/agents(\?.*)?$/, (route) => route.fulfill({ json: page1([agent]) }))
  await page.goto('/agents/nao-existe')

  const alert = main(page).getByRole('alert')
  await expect(alert.getByRole('heading', { level: 1, name: 'Agente não encontrado' })).toBeVisible()
  await expect(alert.getByText('404', { exact: true })).toBeVisible()
  await expect(alert.getByText('nao-existe')).toHaveClass(/font-mono/)
  await expect(alert.getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0)
  await alert.getByRole('link', { name: 'Voltar para agentes' }).click()
  await expect(page).toHaveURL('/agents')
})

test('/tools/<id> com 503: "Tentar de novo" e o link de volta; sucesso abre o editor', async ({
  page
}) => {
  let up = false
  await page.route(/\/api\/tools\/clima$/, (route) =>
    up
      ? route.fulfill({ json: { success: true, data: tool } })
      : route.fulfill(unavailable)
  )
  await page.goto('/tools/clima')
  await hydrated(page)

  const alert = main(page).getByRole('alert')
  await expect(alert.getByText('código 503')).toBeVisible()
  await expect(alert.getByRole('link', { name: 'Voltar para tools' })).toBeVisible()
  up = true
  await alert.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Editar tool' })).toBeFocused()
})

test.describe('404 de rota', () => {
  test('sub-rota sem página e caminho hostil: 404 na casca, sem executar nada', async ({ page }) => {
    const dialogs: string[] = []
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message())
      void dialog.dismiss()
    })

    for (const path of ['/agents/x/y', '/%3Cscript%3Ealert(1)%3C%2Fscript%3E', '/playground/nope']) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(404)
      await expect(main(page).getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible()
    }
    expect(dialogs).toEqual([])
  })

  test('em EN, textos em inglês e <title> próprio', async ({ page, context }) => {
    await context.addCookies([{ name: 'locale', value: 'en', url: APP_URL }])
    await page.goto('/nope')

    await expect(main(page).getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
    await expect(main(page).getByRole('link', { name: 'Go to home' })).toHaveAttribute('href', '/')
    await expect(page).toHaveTitle('Page not found · Orchestrator Playground')
  })

  test('no celular (390 px): o botão aparece e não há rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/rota-inexistente')

    const link = main(page).getByRole('link', { name: 'Ir para o início' })
    await expect(link).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test('/playground em 390 px com o orquestrador fora: o erro aparece sem abrir o Sheet, sem rolagem horizontal', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/playground/agents', (route) =>
    route.fulfill({ status: 503, json: { success: false, error: 'unreachable' } })
  )
  await page.goto('/playground')

  const alert = page.getByRole('alert').filter({ hasText: 'Não foi possível conectar ao orquestrador' })
  await expect(alert).toBeVisible()
  await expect(alert.getByRole('button', { name: 'Tentar de novo' })).toBeVisible()
  await expect(page.getByPlaceholder('Conecte o orquestrador para conversar')).toBeDisabled()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
