import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import { APP_URL, FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'

// QA P1-04. Complementa e2e/i18n.spec.ts: cookie hostil no request, idioma
// único por tela (V-P1-04-5/6), títulos em EN (V-P1-04-8), persistência ao
// navegar após a troca, teclado, troca em andamento, duas abas, a sessão do
// chat intacta (critério de aceite) e a server action como fronteira.
// Dados mockados em ASCII e neutros: o que vem do orquestrador não é traduzido
// e não pode mascarar texto da UI.

const agent = {
  id: 'alfa',
  nome: 'Alfa',
  model: 'llama3.2',
  factoryIaModel: 'ollama',
  descricao: 'Answers',
  prompt: 'You are Alfa.',
  active: true,
  tools_ids: []
}
const tool = {
  id: 'clima',
  name: 'Clima',
  description: 'Forecast',
  route: 'https://api.example.test/clima',
  http_method: 'GET',
  parameters: []
}
const stats = {
  activeAgents: 1,
  totalAgents: 1,
  uniqueUsers: 2,
  totalSessions: 3,
  totalAgentSessions: 2,
  totalTeamSessions: 1,
  sessionsInPeriod: 3,
  totalTokens: 1234567,
  models: [{ name: 'llama3.2', provider: 'ollama', count: 2 }],
  embeddingModels: [{ name: 'embed-x', provider: 'openai', count: 1 }],
  activityOverTime: [{ time: '2026-10-15', sessions: 3, agentSessions: 2, teamSessions: 1 }]
}
const tokenRows = [
  { name: 'alfa', type: 'agent', inputTokens: 100, outputTokens: 50, totalTokens: 150 }
]
const list = <T,>(data: T[]) => ({
  success: true,
  data: { data, total: data.length, page: 1, limit: 100, totalPages: 1 }
})

async function mockApi(page: Page) {
  const serve = (kind: string, items: { id: string }[]) =>
    page.route(new RegExp(`/api/${kind}(/[^?]*)?(\\?.*)?$`), (route) => {
      const { pathname } = new URL(route.request().url())
      const id = pathname.slice(`/api/${kind}/`.length)
      const item = items.find((entry) => entry.id === id)
      return !id || pathname === `/api/${kind}`
        ? route.fulfill({ json: list(items) })
        : item
          ? route.fulfill({ json: { success: true, data: item } })
          : route.fulfill({ status: 404, json: { success: false, error: 'nao encontrado' } })
    })
  await serve('agents', [agent])
  await serve('tools', [tool])
  await page.route(/\/api\/dashboard\/stats/, (route) =>
    route.fulfill({ json: { success: true, data: stats } })
  )
  await page.route(/\/api\/dashboard\/tokens/, (route) =>
    route.fulfill({ json: { success: true, data: tokenRows } })
  )
}

const setLocaleCookie = (context: BrowserContext, value: string) =>
  context.addCookies([{ name: 'locale', value, url: APP_URL }])
const html = (page: Page) => page.locator('html')
const expectSwitch = expect.configure({ timeout: 15_000 })
const expectNavigation = expect.configure({ timeout: 15_000 })

const markPage = (page: Page) =>
  page.evaluate(() => Object.assign(window, { __qaSentinel: 'mesma página' }))
const pageMark = (page: Page) =>
  page.evaluate(() => (window as unknown as { __qaSentinel?: string }).__qaSentinel)

const desktopTrigger = (page: Page) => page.getByRole('combobox', { name: /Idioma:|Language:/ })

async function openLanguageMenu(page: Page) {
  await hydrated(page)
  await desktopTrigger(page).click()
}

// Texto visível, valores de atributos lidos pelo usuário e o <title>.
async function visibleUiText(page: Page) {
  const body = await page.locator('body').innerText()
  const attributes = await page
    .locator('[aria-label],[placeholder],[title],[alt]')
    .evaluateAll((elements) =>
      elements.flatMap((el) =>
        ['aria-label', 'placeholder', 'title', 'alt'].map((a) => el.getAttribute(a) ?? '')
      )
    )
  return [body, ...attributes, await page.title()].join('\n')
}

// Fora: termos do glossário (Team, Tool, Playground, Dashboard, RAG, endpoint,
// header, token, prompt) e nomes próprios.
const PORTUGUESE =
  /[áàâãéêíóôõúç]|\b(Salvar|Salvando|Cancelar|Excluir|Excluindo|Buscar|Filtros|Voltar|Editar|Carregando|Novo|Nova|Ativo|Ativa|Inativo|Inativa|Agente|Agentes|Descrição|Rota|Instruções|Parâmetros|Obrigatório|Nenhum|Nenhuma|Provedor|Modelo|Selecione|Mostrar|Ocultar|Tema|Idioma|Início|Testar|Configurar|Observar|Sessões|Sessão|Menu principal|Pular)\b/
const ENGLISH =
  /\b(Save|Saving|Cancel|Delete|Deleting|Search|Filters|Back|Edit|Loading|New|Active|Inactive|Description|Route|Instructions|Parameters|Required|Provider|Select|Show|Hide|Theme|Language|Home|Skip to content|Deletar|Sessions|Session|Agent|Agents)\b|ferramenta/

const MANAGEMENT_ROUTES = [
  '/',
  '/agents',
  '/agents/new',
  '/agents/alfa',
  '/tools',
  '/tools/new',
  '/tools/clima',
  '/dashboard'
]

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test.describe('cookie hostil no request (sem browser)', () => {
  test.use({ locale: 'en-US' })

  // Só o que o pipeline real exercita (parse do header Cookie do servidor);
  // os valores inválidos comuns estão em tests/i18n/request.test.ts.
  for (const value of ['en%00', 'x'.repeat(4000)]) {
    test(`locale=${value.slice(0, 30)} -> 200 em pt-BR`, async ({ request }) => {
      const response = await request.get('/agents', {
        headers: { cookie: `locale=${value}`, 'accept-language': 'en-US,en;q=0.9' }
      })
      expect(response.status()).toBe(200)
      const text = await response.text()
      expect(text).toMatch(/<html[^>]*lang="pt-BR"/)
      expect(text).toContain('Playground do Orquestrador')
    })
  }

  test('cookie duplicado: vale um idioma válido, sem erro', async ({ request }) => {
    const response = await request.get('/agents', {
      headers: { cookie: 'locale=fr; locale=en' }
    })
    expect(response.status()).toBe(200)
    expect(await response.text()).toMatch(/<html[^>]*lang="(pt-BR|en)"/)
  })
})

test('GET /agents com cookie en no request devolve <html lang="en"> já no HTML do servidor', async ({
  request
}) => {
  const response = await request.get('/agents', { headers: { cookie: 'locale=en' } })
  const text = await response.text()
  expect(text).toMatch(/<html[^>]*lang="en"/)
  expect(text).toContain('Agents · Orchestrator Playground')
  expect(text).not.toContain('Agentes · Playground do Orquestrador')
})

test.describe('uma tela, um idioma (V-P1-04-5 e V-P1-04-6)', () => {
  for (const route of MANAGEMENT_ROUTES) {
    test(`pt-BR ${route}: nada em inglês`, async ({ page }) => {
      await page.goto(route)
      await expect(page.locator('main h1, main [role="alert"]').first()).toBeVisible()
      if (route === '/dashboard') await expect(page.getByText('1.234.567')).toBeVisible()
      const text = await visibleUiText(page)
      expect(text.match(new RegExp(ENGLISH, 'g'))).toBeNull()
      expect(text).not.toMatch(/Provider\b/)
    })

    test(`EN ${route}: nada em português`, async ({ page, context }) => {
      await setLocaleCookie(context, 'en')
      await page.goto(route)
      await expect(page.locator('main h1, main [role="alert"]').first()).toBeVisible()
      if (route === '/dashboard') await expect(page.getByText('1,234,567')).toBeVisible()
      expect((await visibleUiText(page)).match(new RegExp(PORTUGUESE, 'g'))).toBeNull()
    })
  }

  test('EN: dialog de excluir (agente e tool) e legendas dos gráficos', async ({
    page,
    context
  }) => {
    await setLocaleCookie(context, 'en')
    await page.goto('/agents')
    await hydrated(page)
    await page.getByRole('button', { name: 'Delete agent' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete agent' })
    await expect(dialog.getByRole('button', { name: 'Delete' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
    expect(await dialog.innerText()).not.toMatch(PORTUGUESE)
    await page.keyboard.press('Escape')

    await page.goto('/tools')
    await hydrated(page)
    await page.getByRole('button', { name: 'Delete tool' }).click()
    const toolDialog = page.getByRole('dialog', { name: 'Delete tool' })
    expect(await toolDialog.innerText()).not.toMatch(PORTUGUESE)

    await page.goto('/dashboard')
    await expect(page.getByText('Agent sessions').first()).toBeVisible()
    await expect(page.getByText('Team sessions').first()).toBeVisible()
  })

  test('pt-BR: dialog de excluir usa "Excluir" (nunca "Deletar")', async ({ page }) => {
    await page.goto('/tools')
    await hydrated(page)
    await page.getByRole('button', { name: 'Excluir tool' }).click()
    const dialog = page.getByRole('dialog', { name: 'Excluir tool' })
    await expect(dialog.getByRole('button', { name: 'Excluir' })).toBeVisible()
    expect(await dialog.innerText()).not.toMatch(ENGLISH)
  })
})

// V-P1-04-8 em EN (o pt-BR já está em navigation.spec.ts, "cada rota tem o <title>").
for (const [route, title] of [
  ['/', 'Home'],
  ['/agents', 'Agents'],
  ['/agents/new', 'New agent'],
  ['/agents/alfa', 'alfa · Agents'],
  ['/tools', 'Tools'],
  ['/tools/new', 'New tool'],
  ['/tools/clima', 'clima · Tools'],
  ['/dashboard', 'Dashboard'],
  ['/playground', 'Playground']
]) {
  test(`V-P1-04-8: <title> em EN em ${route}`, async ({ page, context }) => {
    await setLocaleCookie(context, 'en')
    await page.goto(route)
    await expect(page).toHaveTitle(`${title} · Orchestrator Playground`)
  })
}

test('o idioma persiste ao navegar entre rotas depois da troca (client e hard navigation)', async ({
  page,
  context
}) => {
  await page.goto('/agents')
  await markPage(page)
  await openLanguageMenu(page)
  await page.getByRole('option', { name: 'English' }).click()
  await expectSwitch(html(page)).toHaveAttribute('lang', 'en')

  // navegação client-side pelo menu
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Dashboard' }).click()
  await expectNavigation(page).toHaveURL('/dashboard')
  await expect(page).toHaveTitle('Dashboard · Orchestrator Playground')
  await expect(page.getByRole('heading', { name: 'Active agents' })).toBeVisible()
  await expect(html(page)).toHaveAttribute('lang', 'en')
  expect(await pageMark(page)).toBe('mesma página')

  // voltar
  await page.goBack()
  await expectNavigation(page).toHaveURL('/agents')
  await expectNavigation(page.getByRole('heading', { level: 1, name: 'Agent management' })).toBeVisible()
  await expect(html(page)).toHaveAttribute('lang', 'en')

  // navegação completa: o cookie vai junto
  await page.goto('/tools/new')
  await expect(html(page)).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { level: 1, name: 'New tool' })).toBeVisible()
  expect((await context.cookies()).filter((c) => c.name === 'locale')).toHaveLength(1)
})

test('voltar de EN para pt-BR pelo seletor também funciona, e o cookie fica com o último', async ({
  page,
  context
}) => {
  await setLocaleCookie(context, 'en')
  await page.goto('/agents')
  await markPage(page)
  await openLanguageMenu(page)
  await page.getByRole('option', { name: 'Português (Brasil)' }).click()

  await expectSwitch(html(page)).toHaveAttribute('lang', 'pt-BR')
  await expect(page).toHaveTitle('Agentes · Playground do Orquestrador')
  await expect(desktopTrigger(page)).toHaveText('PT')
  expect(await pageMark(page)).toBe('mesma página')
  const cookie = (await context.cookies()).find((c) => c.name === 'locale')
  expect(cookie).toMatchObject({ value: 'pt-BR', httpOnly: true, sameSite: 'Lax', path: '/' })
})

test('teclado: Esc fecha sem trocar; Enter + seta + Enter troca; o foco fica no seletor', async ({
  page
}) => {
  await page.goto('/agents')
  const trigger = desktopTrigger(page)
  await hydrated(page)
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(html(page)).toHaveAttribute('lang', 'pt-BR')

  // Seta + Enter até a server action sair. O Radix refoca a opção atual
  // quando posiciona o menu (item-aligned); sob carga isso acontece depois da
  // 1ª seta, que então se perde e o Enter escolhe o idioma que já estava
  // ativo (sem POST). Reabre e repete: com 2 itens a seta é idempotente.
  const listbox = page.getByRole('listbox')
  const posts: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST') posts.push(request.url())
  })
  await expect(async () => {
    if (!(await listbox.isVisible())) await page.keyboard.press('Enter')
    await expect(page.getByRole('option', { name: 'Português (Brasil)' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('option', { name: 'English' })).toBeFocused({ timeout: 1000 })
    await page.keyboard.press('Enter')
    await expect.poll(() => posts.length, { timeout: 2000 }).toBe(1)
  }).toPass({ timeout: 40_000 })
  await expectSwitch(html(page)).toHaveAttribute('lang', 'en')
  await expect(desktopTrigger(page)).toBeFocused()
})

test('troca em andamento: trigger ocupado (aria-busy), uma só action, e libera ao fim', async ({
  page
}) => {
  await page.goto('/agents')
  // aquece a action (1ª compilação do next dev) trocando e voltando uma vez
  await openLanguageMenu(page)
  await page.getByRole('option', { name: 'English' }).click()
  await expectSwitch(html(page)).toHaveAttribute('lang', 'en')

  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const actions: string[] = []
  await page.route('**/agents', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    actions.push(route.request().postData() ?? '')
    await gate
    return route.continue()
  })

  await openLanguageMenu(page)
  await page.getByRole('option', { name: 'Português (Brasil)' }).click()
  const trigger = desktopTrigger(page)
  await expect(trigger).toHaveAttribute('aria-busy', 'true')
  await expect(trigger).toHaveAttribute('aria-disabled', 'true')
  await expect(trigger).not.toHaveAttribute('disabled')
  await expect(trigger).toBeFocused()

  // 2ª escolha durante a troca é ignorada
  // (aria-disabled: o Playwright o trata como desabilitado, então force)
  await trigger.click({ force: true })
  await page.getByRole('option', { name: 'Português (Brasil)' }).click()

  release()
  await expectSwitch(html(page)).toHaveAttribute('lang', 'pt-BR')
  await expect(desktopTrigger(page)).toHaveAttribute('aria-busy', 'false')
  // O Next enfileira as actions: com o guard quebrado, a 2ª só sairia depois
  // da 1ª terminar, então a checagem tem de vir depois do aria-busy voltar.
  expect(actions).toEqual(['["pt-BR"]'])
})

test('duas abas: a troca numa vale na outra ao recarregar (cookie compartilhado)', async ({
  page,
  context
}) => {
  await page.goto('/agents')
  const other = await context.newPage()
  await mockApi(other)
  await other.goto('/tools')
  await expect(html(other)).toHaveAttribute('lang', 'pt-BR')

  await openLanguageMenu(page)
  await page.getByRole('option', { name: 'English' }).click()
  await expectSwitch(html(page)).toHaveAttribute('lang', 'en')

  // (a aba B pode ou não atualizar sozinha: o `next dev` manda refresh às
  // abas quando compila; por isso só se afirma o que vale depois do reload)
  await other.reload()
  await expect(html(other)).toHaveAttribute('lang', 'en')
  await expect(other.getByRole('heading', { level: 1, name: 'Tool management' })).toBeVisible()
})

test.describe('sessão do chat não recarrega na troca de idioma', () => {
  test('o /playground mantém as mensagens, o agente e a página; a casca troca', async ({
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
    const sidebar = page.locator('aside')
    await sidebar.getByText('http://localhost:7777').click()
    await sidebar.getByRole('textbox').fill(FAKE_ORCHESTRATOR_URL)
    await sidebar.getByRole('textbox').press('Enter')
    await sidebar.getByRole('combobox').filter({ hasText: 'Agente Alfa' }).click()
    await page.getByRole('option', { name: 'Agente Beta' }).click()
    const chatInput = page.getByPlaceholder('Ask anything')
    await chatInput.fill('Ola, idioma')
    await chatInput.press('Enter')
    await expect(page.getByText('Agente Beta recebeu: Ola, idioma')).toBeVisible()
    await expect(page).toHaveURL(/[?&]session=/)
    const url = page.url()
    await markPage(page)

    await openLanguageMenu(page)
    await page.getByRole('option', { name: 'English' }).click()
    await expectSwitch(html(page)).toHaveAttribute('lang', 'en')

    expect(await pageMark(page)).toBe('mesma página')
    expect(page.url()).toBe(url)
    await expect(page.getByText('Agente Beta recebeu: Ola, idioma')).toBeVisible()
    await expect(
      sidebar.getByRole('combobox').filter({ hasText: 'Agente Beta' })
    ).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Playground' })
    ).toHaveAttribute('aria-current', 'page')
    await expect(page).toHaveTitle('Playground · Orchestrator Playground')

    // a conversa segue funcionando depois da troca
    await chatInput.fill('Segunda')
    await chatInput.press('Enter')
    await expect(page.getByText('Agente Beta recebeu: Segunda')).toBeVisible()
  })
})

test.describe('server action como fronteira', () => {
  // Captura o id da action no 1º POST do seletor e o repete na mão.
  async function captureAction(page: Page) {
    const posted = page.waitForRequest((request) => request.method() === 'POST')
    await page.goto('/agents')
    await openLanguageMenu(page)
    await page.getByRole('option', { name: 'English' }).click()
    const request = await posted
    await expectSwitch(html(page)).toHaveAttribute('lang', 'en')
    return {
      id: request.headers()['next-action']!,
      body: request.postData()!,
      contentType: request.headers()['content-type']!
    }
  }

  test('valor fora da lista ou payload hostil: erro e nenhum Set-Cookie de locale', async ({
    page,
    request
  }) => {
    const action = await captureAction(page)
    for (const body of ['["fr"]', '["EN"]', '[""]', '[null]', '[{"$ne":1}]', '[["en"]]', '[]']) {
      const response = await request.post('/agents', {
        headers: {
          'next-action': action.id,
          'content-type': action.contentType,
          origin: APP_URL,
          host: new URL(APP_URL).host
        },
        data: body
      })
      const setCookie = response.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie')
      expect(setCookie.filter((h) => /locale=/.test(h.value)), `body ${body}`).toEqual([])
      expect(await response.text()).not.toMatch(/Error:|at \w+ \(|node_modules/)
    }
  })

  test('Origin de outro site é recusado pelo Next (sem Set-Cookie)', async ({ page, request }) => {
    const action = await captureAction(page)
    const response = await request.post('/agents', {
      headers: {
        'next-action': action.id,
        'content-type': action.contentType,
        origin: 'https://evil.example'
      },
      data: '["en"]'
    })
    expect(response.status()).toBeGreaterThanOrEqual(400)
    expect(
      response.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie')
    ).toEqual([])
  })
})
