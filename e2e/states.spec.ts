import { expect, test, type Page } from '@playwright/test'

import { APP_URL, FAKE_ORCHESTRATOR_URL } from '../playwright.config'

// P1-05: orquestrador fora ⇒ erro com "Tentar de novo", nunca tela vazia; rota
// inexistente ⇒ 404 do app, dentro da casca. Até a P3, /api/agents* lê o
// Mongo: aqui responde por page.route.

const TITLE = 'Playground do Orquestrador'
const page1 = <T,>(data: T[]) => ({
  success: true,
  data: { data, total: data.length, page: 1, limit: 10, totalPages: 1 }
})
const agent = {
  id: 'alfa',
  nome: 'Agente Alfa',
  model: 'llama3.2',
  factoryIaModel: 'ollama',
  active: true,
  tools_ids: []
}

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' })

test('/agents com a API fora: bloco de erro, sem toast; "Tentar de novo" carrega a lista', async ({
  page
}) => {
  let up = false
  await page.route(/\/api\/agents(\?.*)?$/, (route) =>
    up ? route.fulfill({ json: page1([agent]) }) : route.abort()
  )
  await page.goto('/agents')

  const alert = page.getByRole('main').getByRole('alert')
  await expect(alert.getByRole('heading', { name: 'Não foi possível carregar os agentes' })).toBeVisible()
  await expect(alert.getByText('offline')).toBeVisible()
  await expect(page.getByText('O orquestrador ainda não tem agentes')).toHaveCount(0)
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
  await expect(mainNav(page)).toBeVisible()

  up = true
  await alert.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(page.getByRole('link', { name: 'Agente Alfa' })).toBeVisible()
  // O anúncio de rota do Next também é role="alert": olha só o conteúdo.
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
})

test('/agents com 503: chip "código 503"', async ({ page }) => {
  await page.route(/\/api\/agents(\?.*)?$/, (route) =>
    route.fulfill({ status: 503, json: { success: false, error: 'indisponível' } })
  )
  await page.goto('/agents')

  await expect(page.getByRole('main').getByRole('alert').getByText('código 503')).toBeVisible()
})

// R2 (review): o foco vai ao h1 do conteúdo novo, depois do commit, e não a
// um h1 que logo é desmontado.
test('/dashboard: "Tentar de novo" com sucesso leva o foco ao h1 da página', async ({ page }) => {
  let up = false
  await page.route(/\/api\/dashboard\/stats/, (route) =>
    up
      ? route.fulfill({
          json: {
            success: true,
            data: {
              activeAgents: 0,
              totalAgents: 0,
              uniqueUsers: 0,
              totalSessions: 0,
              totalAgentSessions: 0,
              totalTeamSessions: 0,
              sessionsInPeriod: 0,
              totalTokens: 0,
              models: [],
              embeddingModels: [],
              activityOverTime: []
            }
          }
        })
      : route.abort()
  )
  await page.route(/\/api\/dashboard\/tokens/, (route) =>
    route.fulfill({ json: { success: true, data: [] } })
  )
  await page.goto('/dashboard')

  const alert = page.getByRole('main').getByRole('alert')
  await expect(alert).toContainText('Não foi possível carregar o dashboard')
  up = true
  await alert.getByRole('button', { name: 'Tentar de novo' }).click()

  await expect(page.getByText('Agentes ativos', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeFocused()
})

test('/agents/<id>: "Tentar de novo" após 503 abre o editor com o foco no h1', async ({ page }) => {
  let up = false
  await page.route(/\/api\/agents\/alfa$/, (route) =>
    up
      ? route.fulfill({ json: { success: true, data: agent } })
      : route.fulfill({ status: 503, json: { success: false, error: 'indisponível' } })
  )
  await page.route(/\/api\/tools(\?.*)?$/, (route) => route.fulfill({ json: page1([]) }))
  await page.goto('/agents/alfa')

  const alert = page.getByRole('main').getByRole('alert')
  await expect(alert.getByText('código 503')).toBeVisible()
  up = true
  await alert.getByRole('button', { name: 'Tentar de novo' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Editar agente' })).toBeFocused()
})

test('/playground com o fake orchestrator desligado: erro na conversa, composer desabilitado e "Endpoint desconectado"', async ({
  page
}) => {
  // Endpoint salvo = o fake; o fake "desligado" = conexão recusada pelo browser.
  await page.addInitScript((endpoint) => {
    window.localStorage.setItem(
      'endpoint-storage',
      JSON.stringify({ state: { selectedEndpoint: endpoint }, version: 0 })
    )
  }, FAKE_ORCHESTRATOR_URL)
  let fakeUp = false
  await page.route(
    (url) => url.origin !== APP_URL,
    (route) =>
      fakeUp && new URL(route.request().url()).origin === FAKE_ORCHESTRATOR_URL
        ? route.continue()
        : route.abort()
  )
  await page.goto('/playground')

  const alert = page.getByRole('alert').filter({ hasText: 'Não foi possível conectar ao orquestrador' })
  await expect(alert).toBeVisible()
  await expect(alert.getByText(FAKE_ORCHESTRATOR_URL)).toBeVisible()
  await expect(alert.getByText('offline')).toBeVisible()
  await expect(page.getByText(/Agent UI open source/)).toHaveCount(0)
  await expect(page.getByPlaceholder('Conecte o orquestrador para conversar')).toBeDisabled()

  const panel = page.locator('aside')
  await expect(panel.getByText('Endpoint desconectado. Conecte o endpoint para ver o histórico.')).toBeVisible()
  await expect(panel.getByText('Modo')).toHaveCount(0)

  fakeUp = true
  await alert.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(page.getByRole('heading', { name: /^Converse com / })).toBeVisible()
  await expect(page.getByPlaceholder('Pergunte qualquer coisa')).toBeEnabled()
})

test('rota inexistente: 404 do app dentro da casca, com o <title> e status 404', async ({ page }) => {
  const response = await page.goto('/rota-inexistente')
  expect(response?.status()).toBe(404)

  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeVisible()
  await expect(main.getByText('/rota-inexistente')).toBeVisible()
  await expect(main.getByRole('link', { name: 'Ir para o início' })).toHaveAttribute('href', '/')
  await expect(mainNav(page)).toBeVisible()
  await expect(mainNav(page).locator('[aria-current]')).toHaveCount(0)
  await expect(
    page.getByRole('navigation', { name: 'Você está em' }).getByText('Página não encontrada')
  ).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveTitle(`Página não encontrada · ${TITLE}`)
})
