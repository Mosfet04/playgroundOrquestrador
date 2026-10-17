import { expect, test, type Page, type Route } from '@playwright/test'

import { APP_URL, FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'

// QA do P1-03: o que o navigation.spec.ts do dev não cobre (id hostil,
// carregando/500, teclado na navegação, criação por rota, voltar do
// playground com parâmetros, salvar + voltar). Até a P3 as rotas /api/* leem o
// Mongo: respondem por page.route.

const agent = {
  id: 'agente alfa',
  nome: 'Agente Alfa',
  model: 'llama3.2',
  factoryIaModel: 'ollama',
  descricao: 'Responde perguntas',
  prompt: 'Você é o Alfa.',
  active: true,
  tools_ids: []
}
const hostile = { ...agent, id: 'a/b?c#d <x>', nome: '<img src=x onerror=alert(1)>' }
const emptyTools = {
  success: true,
  data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }
}
const listOf = (data: unknown[]) => ({
  success: true,
  data: { data, total: data.length, page: 1, limit: 10, totalPages: 1 }
})

const expectNavigation = expect.configure({ timeout: 15_000 })
const mainNav = (page: Page) =>
  page.getByRole('navigation', { name: 'Navegação principal' })
const trail = (page: Page) =>
  page.getByRole('navigation', { name: 'Você está em' })

/** Mock de /api/agents*, /api/tools* e /api/dashboard/*. `requested` guarda as URLs de detalhe pedidas. */
async function mockApi(
  page: Page,
  agents: (typeof agent)[],
  handlers: { detail?: (route: Route) => Promise<void> | void } = {}
) {
  const requested: string[] = []
  await page.route(/\/api\/tools(\?.*)?$/, (route) => route.fulfill({ json: emptyTools }))
  await page.route(/\/api\/dashboard\//, (route) =>
    route.fulfill({ status: 503, json: { success: false, error: 'indisponível' } })
  )
  await page.route(/\/api\/agents(\/[^?]*)?(\?.*)?$/, async (route) => {
    const { pathname } = new URL(route.request().url())
    const raw = pathname.slice('/api/agents/'.length)
    if (!raw) return route.fulfill({ json: listOf(agents) })
    if (route.request().method() === 'PUT') {
      requested.push(`PUT ${raw}`)
      return route.fulfill({ json: { success: true, message: 'Agente salvo' } })
    }
    requested.push(raw)
    if (handlers.detail) return handlers.detail(route)
    const found = agents.find((entry) => encodeURIComponent(entry.id) === raw)
    return found
      ? route.fulfill({ json: { success: true, data: found } })
      : route.fulfill({ status: 404, json: { success: false, error: 'não encontrado' } })
  })
  return requested
}

test('id hostil: o link codifica, o editor carrega o id literal e nada executa', async ({
  page
}) => {
  const requested = await mockApi(page, [hostile])
  let dialogs = 0
  page.on('dialog', async (dialog) => {
    dialogs += 1
    await dialog.dismiss()
  })

  await page.goto('/agents')
  await hydrated(page)
  const link = page.getByRole('link', { name: hostile.nome })
  const href = '/agents/a%2Fb%3Fc%23d%20%3Cx%3E'
  await expect(link).toHaveAttribute('href', href)
  await link.click()

  await expectNavigation(page).toHaveURL(href)
  await expect(page.getByLabel(/ID do agente/)).toHaveValue(hostile.id)
  await expect(trail(page).getByText(hostile.nome)).toHaveAttribute('aria-current', 'page')
  expect(requested).toContain('a%2Fb%3Fc%23d%20%3Cx%3E')
  await expect(page.locator('main img[src="x"]')).toHaveCount(0)
  expect(dialogs).toBe(0)

  await page.reload()
  await expect(page.getByLabel(/ID do agente/)).toHaveValue(hostile.id)
  expect(dialogs).toBe(0)
})

test('id com sequência % inválida: o Next responde 400 antes da rota, sem exceção nem requisição ao BFF', async ({
  page
}) => {
  const requested = await mockApi(page, [agent])
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const response = await page.goto('/agents/%E0%A4%A')

  expect(response?.status()).toBe(400)
  expect(requested).toEqual([])
  expect(errors).toEqual([])
})

test('enquanto o detalhe carrega a casca já está desenhada; depois o editor aparece', async ({
  page
}) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  await mockApi(page, [agent], {
    detail: async (route) => {
      await gate
      await route.fulfill({ json: { success: true, data: agent } })
    }
  })
  await page.goto('/agents/agente%20alfa', { waitUntil: 'domcontentloaded' })

  await expect(mainNav(page)).toBeVisible()
  await expect(trail(page).getByText('agente alfa')).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('main [aria-busy="true"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Editar agente' })).toHaveCount(0)

  // O estado "carregando" já vem no HTML do servidor: o fetch só sai depois da
  // hidratação, que no `next dev` sob carga passa de 5 s.
  release()
  await expectNavigation(page.getByLabel(/ID do agente/)).toHaveValue(agent.id)
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await expect(trail(page).getByText('Agente Alfa')).toBeVisible()
})

test('erro 500 no detalhe: "Não foi possível carregar" com o código, link de volta e casca intacta', async ({
  page
}) => {
  await mockApi(page, [agent], {
    detail: (route) =>
      route.fulfill({ status: 500, json: { success: false, error: 'falha' } })
  })
  await page.goto('/agents/agente%20alfa')

  const alert = page.getByRole('main').getByRole('alert')
  await expect(alert.getByText('Não foi possível carregar o agente')).toBeVisible()
  await expect(alert.getByText('código 500')).toBeVisible()
  await expect(alert.getByText('agente alfa')).toBeVisible()
  await expect(alert).not.toContainText('falha')
  await expect(mainNav(page)).toBeVisible()
  await alert.getByRole('link', { name: 'Voltar para agentes' }).click()
  await expectNavigation(page).toHaveURL('/agents')
})

test('falha de rede no detalhe: bloco de erro, sem tela vazia', async ({ page }) => {
  await mockApi(page, [agent], { detail: (route) => route.abort() })
  await page.goto('/agents/agente%20alfa')

  await expect(
    page.getByRole('main').getByRole('alert').getByText('Não foi possível carregar o agente')
  ).toBeVisible()
  await expect(mainNav(page)).toBeVisible()
})

test('/agents/new: deep link, recarga e voltar para a lista', async ({ page }) => {
  const requested = await mockApi(page, [agent])
  await page.goto('/agents')
  await hydrated(page)
  await page.getByRole('link', { name: 'Novo agente' }).click()
  await expectNavigation(page).toHaveURL('/agents/new')
  await expect(page.getByRole('heading', { level: 1, name: 'Novo agente' })).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL('/agents/new')
  await expect(page.getByRole('heading', { level: 1, name: 'Novo agente' })).toBeVisible()
  await expect(page.getByLabel(/ID do agente/)).toHaveValue('')
  await expect(mainNav(page).getByRole('link', { name: 'Agentes' })).toHaveAttribute(
    'aria-current',
    'true'
  )
  expect(requested).toEqual([])

  // Depois da recarga, a entrada /agents do histórico é de outro documento: o
  // goBack é uma carga completa (RSC + hidratação + GET da lista), não um
  // popstate. No `next dev` sob carga isso passa de 5 s; o mesmo prazo do
  // expectNavigation vale. O snapshot da falha já mostrava o h1.
  await page.goBack()
  await expectNavigation(page).toHaveURL('/agents')
  await expectNavigation(
    page.getByRole('heading', { level: 1, name: 'Gerenciamento de agentes' })
  ).toBeVisible()
})

test('salvar o editor navega para a lista (push): voltar reabre o editor', async ({ page }) => {
  const requested = await mockApi(page, [agent])
  await page.goto('/agents')
  await hydrated(page)
  await page.getByRole('link', { name: 'Agente Alfa' }).click()
  await expectNavigation(page).toHaveURL('/agents/agente%20alfa')
  await expect(page.getByLabel(/ID do agente/)).toHaveValue(agent.id)
  await hydrated(page)
  await page.getByRole('button', { name: /Atualizar|Salvar/ }).click()
  await expectNavigation(page).toHaveURL('/agents')
  expect(requested).toContain('PUT agente%20alfa')

  await page.goBack()
  await expect(page).toHaveURL('/agents/agente%20alfa')
  await expect(page.getByLabel(/ID do agente/)).toHaveValue(agent.id)
})

test('teclado: Tab até um item da navegação e Enter navega; o item destino fica ativo', async ({
  page
}) => {
  await mockApi(page, [agent])
  await page.goto('/')
  await hydrated(page)
  await page.keyboard.press('Tab') // Pular para o conteúdo
  for (const name of ['Início', 'Playground', 'Agentes']) {
    await page.keyboard.press('Tab')
    await expect(mainNav(page).getByRole('link', { name })).toBeFocused()
  }
  await page.keyboard.press('Enter')

  await expectNavigation(page).toHaveURL('/agents')
  const current = mainNav(page).locator('[aria-current]')
  await expect(current).toHaveCount(1)
  await expect(current).toHaveAccessibleName('Agentes')
})

test('rota fora do mapa: a página 404 do Next, sem exceção', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const response = await page.goto('/nao-existe')

  expect(response?.status()).toBe(404)
  await expect(page.getByText('404')).toBeVisible()
  expect(errors).toEqual([])
})

test('Playground -> Início -> Voltar devolve ?agent= e ?session= e as mensagens', async ({
  page
}) => {
  // A 1ª carga do /playground compila o chunk do chat no `next dev`; com a
  // suíte em paralelo a hidratação passa dos 30 s padrão.
  test.slow()
  await page.route(
    (url) => ![APP_URL, FAKE_ORCHESTRATOR_URL].includes(url.origin),
    (route) => route.abort()
  )
  await page.goto('/playground')
  await hydrated(page)
  const sidebar = page.locator('aside')
  await sidebar.getByText('http://localhost:7777').click()
  await sidebar.getByRole('textbox').fill(FAKE_ORCHESTRATOR_URL)
  await sidebar.getByRole('textbox').press('Enter')
  await sidebar.getByRole('combobox').filter({ hasText: 'Agente Alfa' }).click()
  await page.getByRole('option', { name: 'Agente Beta' }).click()
  const chatInput = page.getByPlaceholder('Pergunte qualquer coisa')
  await chatInput.fill('Ida e volta')
  await chatInput.press('Enter')
  await expect(page.getByText('Agente Beta recebeu: Ida e volta')).toBeVisible()
  await expect(page).toHaveURL(/[?&]session=/)
  const url = page.url()

  await mainNav(page).getByRole('link', { name: 'Início' }).click()
  await expectNavigation(page).toHaveURL('/')

  await page.goBack()
  await expectNavigation(page).toHaveURL(url)
  await hydrated(page)
  await expect(page.getByText('Agente Beta recebeu: Ida e volta')).toBeVisible()
  await expect(
    page.locator('aside').getByRole('combobox').filter({ hasText: 'Agente Beta' })
  ).toBeVisible()
})
