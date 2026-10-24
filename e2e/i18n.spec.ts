import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import { APP_URL, FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'

// P1-04: idioma em cookie, sem prefixo na URL (decisão 0011). Sem cookie é
// pt-BR; trocar pelo seletor chama a server action que grava o cookie e
// devolve a rota re-renderizada (D-P1-04-5): textos, `lang` e <title> mudam
// sem recarregar. Até a P3 /api/agents* e /api/tools* leem o Mongo: aqui
// respondem por page.route (o dashboard, como os demais, também).

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
const stats = {
  activeAgents: 1,
  totalAgents: 1,
  peakDailyUsers: 2,
  totalSessions: 3,
  totalAgentSessions: 2,
  totalTeamSessions: 1,
  totalTokens: 1234567,
  models: [],
  embeddingModels: [],
  activityOverTime: [{ time: '2026-10-15', sessions: 3, agentSessions: 2, teamSessions: 1 }]
}
const listOf = (data: unknown[]) => ({
  success: true,
  data: { data, total: data.length, page: 1, limit: 100, totalPages: 1 }
})

async function mockApi(page: Page) {
  await page.route(/\/api\/tools(\?.*)?$/, (route) => route.fulfill({ json: listOf([]) }))
  await page.route(/\/api\/agents(\/[^?]*)?(\?.*)?$/, (route) => {
    const { pathname } = new URL(route.request().url())
    return pathname === '/api/agents'
      ? route.fulfill({ json: listOf([agent]) })
      : route.fulfill({ json: { success: true, data: agent } })
  })
  await page.route(/\/api\/dashboard\/stats/, (route) =>
    route.fulfill({ json: { success: true, data: stats } })
  )
}

const setLocaleCookie = (context: BrowserContext, value: string) =>
  context.addCookies([{ name: 'locale', value, url: APP_URL }])

const html = (page: Page) => page.locator('html')

// Sentinela em window: some se a página recarregar.
const markPage = (page: Page) =>
  page.evaluate(() => Object.assign(window, { __i18nSentinel: 'mesma página' }))
const pageMark = (page: Page) =>
  page.evaluate(() => (window as unknown as { __i18nSentinel?: string }).__i18nSentinel)

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test.describe('navegador em inglês, sem cookie', () => {
  test.use({ locale: 'en-US' })

  test('abre em pt-BR (não usa Accept-Language)', async ({ page }) => {
    await page.goto('/agents')

    await expect(html(page)).toHaveAttribute('lang', 'pt-BR')
    await expect(page).toHaveTitle('Agentes · Playground do Orquestrador')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Gerenciamento de agentes' })
    ).toBeVisible()
  })

  test('cookie com valor fora da lista também abre em pt-BR', async ({ page, context }) => {
    await setLocaleCookie(context, 'fr')
    await page.goto('/agents')

    await expect(html(page)).toHaveAttribute('lang', 'pt-BR')
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible()
  })
})

test('com o cookie en: lang, <title> e textos em inglês', async ({ page, context }) => {
  await setLocaleCookie(context, 'en')
  await page.goto('/agents')

  await expect(html(page)).toHaveAttribute('lang', 'en')
  await expect(page).toHaveTitle('Agents · Orchestrator Playground')
  await expect(page.getByRole('heading', { level: 1, name: 'Agent management' })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(nav.getByRole('link', { name: 'Agents' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeAttached()
  await expect(page.getByPlaceholder('ID, name or description…')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(
    /Configurar|Buscar|Filtros|Novo agente|Agentes|Ativo\b/
  )

  await page.goto(`/agents/${encodeURIComponent(agent.id)}`)
  await expect(page).toHaveTitle(`${agent.id} · Agents · Orchestrator Playground`)
  await expect(page.getByRole('heading', { level: 1, name: 'Edit agent' })).toBeVisible()
})

test('trocar o idioma em /agents/new mantém a rota e o form, sem recarregar; o cookie vale no reload', async ({
  page,
  context
}) => {
  await page.goto('/agents/new')
  await page.getByLabel('ID do agente *').fill('agente-novo')
  await page.getByLabel('Nome *').fill('Agente Novo')
  await markPage(page)

  const trigger = page.getByRole('combobox', {
    name: 'Idioma: Português (Brasil). Alterar idioma'
  })
  await expect(trigger).toHaveText('PT')
  await hydrated(page)
  await trigger.click()
  const options = page.getByRole('option')
  await expect(options).toHaveText(['Português (Brasil)', 'English'])
  await expect(options.nth(0)).toHaveAttribute('lang', 'pt-BR')
  await expect(options.nth(1)).toHaveAttribute('lang', 'en')
  await page.getByRole('option', { name: 'English' }).click()

  await expect(html(page)).toHaveAttribute('lang', 'en')
  await expect(page).toHaveTitle('New agent · Orchestrator Playground')
  await expect(page).toHaveURL('/agents/new')
  await expect(page.getByLabel('Agent ID *')).toHaveValue('agente-novo')
  await expect(page.getByLabel('Name *')).toHaveValue('Agente Novo')
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
  const englishTrigger = page.getByRole('combobox', {
    name: 'Language: English. Change language'
  })
  await expect(englishTrigger).toHaveText('EN')
  await expect(englishTrigger).toBeFocused()
  expect(await pageMark(page)).toBe('mesma página')

  expect(await context.cookies()).toContainEqual(
    expect.objectContaining({ name: 'locale', value: 'en' })
  )
  await page.reload()
  await expect(html(page)).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { level: 1, name: 'New agent' })).toBeVisible()
})

test('dashboard: números e eixo de datas no formato do idioma', async ({ page, context }) => {
  await page.goto('/dashboard')
  await expect(page.getByText('1.234.567')).toBeVisible()
  await expect(page.locator('svg').getByText('15 de out.', { exact: true })).toBeVisible()

  await setLocaleCookie(context, 'en')
  await page.reload()
  await expect(page.getByText('1,234,567')).toBeVisible()
  await expect(page.locator('svg').getByText('Oct 15', { exact: true })).toBeVisible()
})

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('o idioma fica no menu, abaixo do tema; trocar mantém o Sheet aberto e o foco', async ({
    page
  }) => {
    await page.goto('/agents')
    await expect(page.getByRole('combobox', { name: /Alterar idioma/ })).toBeHidden()

    await hydrated(page)
    await page.getByRole('button', { name: 'Abrir menu' }).click()
    const sheet = page.getByRole('dialog', { name: 'Menu' })
    const theme = sheet.getByRole('combobox', { name: 'Tema' })
    const language = sheet.getByRole('combobox', { name: 'Idioma' })
    await expect(language).toHaveText('Português (Brasil)')
    const [themeBox, languageBox] = [await theme.boundingBox(), await language.boundingBox()]
    expect(languageBox!.y).toBeGreaterThan(themeBox!.y)
    expect(languageBox!.width).toBeCloseTo(themeBox!.width, 0)
    // O nome inteiro cabe no trigger (w-44), sem corte (V-P1-04-4). Mede com a
    // IBM Plex carregada: a fonte de fallback é mais larga.
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    const clipped = await language.evaluate((trigger) => {
      const value = trigger.querySelector('span')!
      return value.scrollWidth > value.clientWidth
    })
    expect(clipped).toBe(false)
    await markPage(page)

    await language.click()
    await page.getByRole('option', { name: 'English' }).click()

    await expect(html(page)).toHaveAttribute('lang', 'en')
    const menu = page.getByRole('dialog', { name: 'Menu' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('combobox', { name: 'Language' })).toHaveText('English')
    await expect(menu.getByRole('combobox', { name: 'Language' })).toBeFocused()
    await expect(menu.getByRole('combobox', { name: 'Theme' })).toBeVisible()
    expect(await pageMark(page)).toBe('mesma página')
  })
})

// P1-04b: a troca de idioma com a conversa aberta não remonta o chat. O fake
// segura o último delta de "segure até liberar" até o POST /hold/release.
test('playground: trocar o idioma no meio do stream mantém mensagens, stream, composer, agente e URL', async ({
  page,
  request
}) => {
  await page.route(
    (url) => url.origin !== APP_URL,
    (route) => route.abort()
  )
  await page.goto('/playground')
  await hydrated(page)
  const sidebar = page.locator('aside')
  const composer = page.getByPlaceholder('Escreva uma mensagem para Agente Alfa')
  await expect(composer).toBeEnabled()

  await composer.fill('segure até liberar')
  await composer.press('Enter')
  await expect(page.getByText('Agente Alfa recebeu:')).toBeVisible()
  await composer.fill('rascunho')
  await expect(page).toHaveURL(/[?&]session=/)
  const url = page.url()
  expect(url).toContain('agent=agente-alfa')
  await expect(
    page.getByRole('button', { name: 'Enviar mensagem (aguarde a resposta terminar)' })
  ).toBeDisabled()
  await markPage(page)

  await page.getByRole('combobox', { name: /Alterar idioma/ }).click()
  await page.getByRole('option', { name: 'English' }).click()
  await expect(html(page)).toHaveAttribute('lang', 'en')

  await expect(sidebar.getByText('New chat')).toBeVisible()
  await expect(sidebar.getByText('Sessions')).toBeVisible()
  await expect(page.getByPlaceholder('Write a message to Agente Alfa')).toHaveValue('rascunho')
  // a mensagem do usuário e a sessão criada na lista do painel
  await expect(page.getByText('segure até liberar', { exact: true })).toHaveCount(2)
  await expect(page.getByText('Agente Alfa recebeu:')).toBeVisible()
  // ainda em stream: o envio segue bloqueado
  await expect(
    page.getByRole('button', { name: 'Send message (wait for the response to finish)' })
  ).toBeDisabled()
  expect(page.url()).toBe(url)
  expect(await pageMark(page)).toBe('mesma página')

  expect((await request.post(`${FAKE_ORCHESTRATOR_URL}/hold/release?agent=agente-alfa`)).ok()).toBe(true)
  await expect(page.getByText('Agente Alfa recebeu: segure até liberar')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled()
  await expect(page.getByPlaceholder('Write a message to Agente Alfa')).toHaveValue('rascunho')
  await expect(sidebar.getByRole('combobox').filter({ hasText: 'Agente Alfa' })).toBeVisible()
  expect(page.url()).toBe(url)
})
