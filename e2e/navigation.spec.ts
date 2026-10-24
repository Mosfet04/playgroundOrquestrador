import { expect, test, type Page, type Route } from '@playwright/test'

import { APP_URL } from '../playwright.config'
import { hydrated } from './hydration'

// P1-03: cada seção tem URL própria (deep link, voltar, recarga). Até a P3,
// /api/agents* e /api/tools* leem o Mongo: aqui respondem
// por page.route.

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
const tool = {
  id: 'clima',
  name: 'Clima',
  description: 'Previsão do tempo',
  route: 'https://api.example.test/clima',
  http_method: 'GET',
  parameters: []
}
const AGENT_PATH = `/agents/${encodeURIComponent(agent.id)}`
const TITLE = 'Playground do Orquestrador'

const page1 = <T,>(data: T[]) => ({
  success: true,
  data: { data, total: data.length, page: 1, limit: 100, totalPages: 1 }
})

// Lista em /api/<kind>; detalhe em /api/<kind>/<id> (200 com o item ou 404).
const serveCollection = <T extends { id: string }>(kind: string, items: T[]) =>
  async (route: Route) => {
    const { pathname } = new URL(route.request().url())
    const id = pathname.slice(`/api/${kind}/`.length)
    if (!id) return route.fulfill({ json: page1(items) })
    const item = items.find((entry) => entry.id === decodeURIComponent(id))
    return item
      ? route.fulfill({ json: { success: true, data: item } })
      : route.fulfill({
          status: 404,
          json: { success: false, error: 'não encontrado' }
        })
  }

const mockManagementApi = async (page: Page) => {
  await page.route(/\/api\/agents(\/[^?]*)?(\?.*)?$/, serveCollection('agents', [agent]))
  await page.route(/\/api\/tools(\/[^?]*)?(\?.*)?$/, serveCollection('tools', [tool]))
}

const mainNav = (page: Page) =>
  page.getByRole('navigation', { name: 'Navegação principal' })
const trail = (page: Page) =>
  page.getByRole('navigation', { name: 'Você está em' })

test.beforeEach(async ({ page }) => {
  await mockManagementApi(page)
})

test('deep link /agents/<id> abre o editor; voltar retorna à lista; recarga preserva', async ({
  page
}) => {
  await page.goto('/agents')
  await expect(page.getByRole('heading', { level: 1, name: 'Gerenciamento de agentes' })).toBeVisible()

  const nameLink = page.getByRole('link', { name: 'Agente Alfa' })
  await expect(nameLink).toHaveAttribute('href', AGENT_PATH)
  await nameLink.click()

  await expect(page).toHaveURL(AGENT_PATH)
  await expect(page.getByRole('heading', { level: 1, name: 'Editar agente' })).toBeVisible()
  await expect(page.getByLabel(/ID do agente/)).toHaveValue(agent.id)
  await expect(mainNav(page).getByRole('link', { name: 'Agentes' })).toHaveAttribute(
    'aria-current',
    'true'
  )
  await expect(trail(page).getByText('Agente Alfa')).toHaveAttribute('aria-current', 'page')
  await expect(trail(page).getByRole('link', { name: 'Agentes' })).toHaveAttribute('href', '/agents')
  await expect(page).toHaveTitle(`${agent.id} · Agentes · ${TITLE}`)

  await page.goBack()
  await expect(page).toHaveURL('/agents')
  await expect(page.getByRole('heading', { level: 1, name: 'Gerenciamento de agentes' })).toBeVisible()

  await page.goForward()
  await expect(page.getByLabel(/ID do agente/)).toHaveValue(agent.id)
  await page.reload()
  await expect(page).toHaveURL(AGENT_PATH)
  await expect(page.getByLabel(/ID do agente/)).toHaveValue(agent.id)
  await expect(page.getByRole('heading', { name: 'Gerenciamento de agentes' })).toHaveCount(0)
})

test('"Voltar" do editor leva à lista; "Novo agente" abre /agents/new', async ({ page }) => {
  await page.goto(AGENT_PATH)
  await page.getByRole('link', { name: 'Voltar' }).click()
  await expect(page).toHaveURL('/agents')

  await page.getByRole('link', { name: 'Novo agente' }).click()
  await expect(page).toHaveURL('/agents/new')
  await expect(page.getByRole('heading', { level: 1, name: 'Novo agente' })).toBeVisible()
  await expect(trail(page).getByText('Novo agente')).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveTitle(`Novo agente · ${TITLE}`)
})

for (const [path, message, back] of [
  ['/agents/nao-existe', 'Agente não encontrado', 'Voltar para agentes'],
  ['/tools/nao-existe', 'Tool não encontrada', 'Voltar para tools']
]) {
  test(`id inexistente em ${path}: alerta no conteúdo com a casca intacta`, async ({
    page
  }) => {
    await page.goto(path)

    const alert = page.getByRole('main').getByRole('alert')
    await expect(alert.getByText(message)).toBeVisible()
    await expect(alert.getByText('nao-existe')).toBeVisible()
    await expect(mainNav(page)).toBeVisible()
    await expect(trail(page)).toBeVisible()

    await alert.getByRole('link', { name: back }).click()
    await expect(page).toHaveURL(path.replace('/nao-existe', ''))
  })
}

test('deep link /tools/<id> abre o editor da tool', async ({ page }) => {
  await page.goto('/tools/clima')
  await expect(page.getByRole('heading', { level: 1, name: 'Editar tool' })).toBeVisible()
  await expect(trail(page).getByText('Clima')).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveTitle(`clima · Tools · ${TITLE}`)
})

test('cada rota tem o <title> do mapa e um só item ativo', async ({ page }) => {
  for (const [path, title, active] of [
    ['/', 'Início', 'Início'],
    ['/playground', 'Playground', 'Playground'],
    ['/agents', 'Agentes', 'Agentes'],
    ['/tools', 'Tools', 'Tools'],
    ['/tools/new', 'Nova tool', 'Tools'],
    ['/dashboard', 'Dashboard', 'Dashboard']
  ]) {
    await page.goto(path)
    await expect(page).toHaveTitle(`${title} · ${TITLE}`)
    const current = mainNav(page).locator('[aria-current]')
    await expect(current).toHaveCount(1)
    await expect(current).toHaveAccessibleName(active)
  }
})

test('/playground?agent=…&session=… sobrevive à recarga com o agente e as mensagens', async ({
  page
}) => {
  // Só o app: o chat vai pelo BFF (P2-03).
  await page.route(
    (url) => url.origin !== APP_URL,
    (route) => route.abort()
  )
  await page.goto('/playground')
  await hydrated(page)
  const sidebar = page.locator('aside')
  await sidebar.getByRole('combobox').filter({ hasText: 'Agente Alfa' }).click()
  await page.getByRole('option', { name: 'Agente Beta' }).click()

  const chatInput = page.getByPlaceholder('Escreva uma mensagem para Agente Beta')
  await chatInput.fill('Olá, recarga')
  await chatInput.press('Enter')
  await expect(page.getByText('Agente Beta recebeu: Olá, recarga')).toBeVisible()
  await expect(page).toHaveURL(/[?&]session=/)

  const url = page.url()
  expect(new URL(url).searchParams.get('agent')).toBe('agente-beta')
  await page.reload()

  expect(page.url()).toBe(url)
  await expect(page.getByText('Agente Beta recebeu: Olá, recarga')).toBeVisible()
  await expect(
    sidebar.getByRole('combobox').filter({ hasText: 'Agente Beta' })
  ).toBeVisible()
  await expect(mainNav(page).getByRole('link', { name: 'Playground' })).toHaveAttribute(
    'aria-current',
    'page'
  )
  // O link da navegação não leva os parâmetros.
  await expect(mainNav(page).getByRole('link', { name: 'Playground' })).toHaveAttribute(
    'href',
    '/playground'
  )
})

test('teclado: 1º Tab mostra "Pular para o conteúdo", que leva ao <main>', async ({
  page
}) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Pular para o conteúdo' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeVisible()

  await page.keyboard.press('Tab')
  await expect(mainNav(page).getByRole('link', { name: 'Início' })).toBeFocused()

  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Enter')
  await expect(page.locator('main#conteudo')).toBeFocused()
})

for (const width of [390, 1023, 1440]) {
  test(`nenhuma rota rola na horizontal em ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    for (const path of ['/', '/playground', '/agents', AGENT_PATH, '/tools', '/dashboard']) {
      await page.goto(path)
      await expect(page.getByRole('main')).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow, path).toBeLessThanOrEqual(0)
    }
  })
}

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('menu: Sheet com o item ativo; item navega e fecha; Esc devolve o foco', async ({
    page
  }) => {
    await page.goto('/agents')
    await expect(mainNav(page)).toBeHidden()

    const menuButton = page.getByRole('button', { name: 'Abrir menu' })
    await menuButton.click()
    const sheet = page.getByRole('dialog', { name: 'Menu' })
    await expect(sheet.getByRole('link', { name: 'Agentes' })).toHaveAttribute('aria-current', 'page')
    await expect(sheet.getByRole('combobox', { name: 'Tema' })).toBeVisible()

    await sheet.getByRole('link', { name: 'Tools' }).click()
    await expect(page).toHaveURL('/tools')
    await expect(sheet).toBeHidden()

    await menuButton.click()
    await expect(sheet).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await expect(menuButton).toBeFocused()
  })

  test('playground: o painel de sessões e agente abre no Sheet do cabeçalho', async ({
    page
  }) => {
    await page.goto('/playground')
    await expect(page.getByRole('combobox', { name: /Alterar tema/ })).toBeHidden()

    await page.getByRole('button', { name: 'Abrir sessões e agente' }).click()
    const panel = page.getByRole('dialog', { name: 'Sessões e agente' })
    await expect(panel.getByText('Sessões', { exact: true })).toBeVisible()
    // P2-03: o Sheet não tem o bloco Endpoint.
    await expect(panel.getByText('Endpoint', { exact: true })).toHaveCount(0)
  })

  test('o Sheet fecha quando a janela passa de 1024 px', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Abrir menu' }).click()
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible()

    await page.setViewportSize({ width: 1280, height: 844 })
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeHidden()
    await expect(mainNav(page)).toBeVisible()
  })
})
