import {
  expect,
  request as playwrightRequest,
  test,
  type Page
} from '@playwright/test'

import { APP_URL, FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'

// P2-03: o chat roda pelo BFF. O browser só fala com o próprio app: qualquer
// outra origem (o fake, rede externa) é registrada e abortada, e o teste
// confere que nada saiu. As fontes são servidas pelo app (decisões 0004 e 0008).
const openPlayground = async (page: Page, path = '/playground') => {
  const foreign: string[] = []
  await page.route(
    (url) => url.origin !== APP_URL,
    (route) => {
      foreign.push(route.request().url())
      return route.abort()
    }
  )
  await page.goto(path)
  await hydrated(page)
  return { sidebar: page.locator('aside'), foreign }
}

// O rótulo do composer leva o nome do agente (P1-06).
const composer = (page: Page) =>
  page.getByRole('textbox', { name: /^Mensagem para / })

const sendMessage = async (page: Page, message: string) => {
  const chatInput = composer(page)
  await chatInput.fill(message)
  await chatInput.press('Enter')
}

test('chat pelo BFF: escolhe o agente e recebe a resposta final, sem requisição a outra origem', async ({
  page
}) => {
  const { sidebar, foreign } = await openPlayground(page)
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))

  await sidebar.getByRole('combobox').filter({ hasText: 'Agente Alfa' }).click()
  await page.getByRole('option', { name: 'Agente Beta' }).click()
  await expect(
    sidebar.getByRole('combobox').filter({ hasText: 'Agente Beta' })
  ).toBeVisible()

  await sendMessage(page, 'Olá, fake')

  await expect(page.getByText('Agente Beta recebeu: Olá, fake')).toBeVisible()
  // P1-06 (D-P1-06-2): chips com o tempo da tool e o erro, e as métricas do
  // RunCompleted do fake.
  const tools = page.getByRole('list', { name: 'Chamadas de tool' })
  await expect(tools.getByRole('listitem')).toHaveText([
    'consultar_pedido0,18 sconcluída',
    'abrir_trocaerro'
  ])
  await expect(page.getByText('1,4 s · 812 tokens')).toBeVisible()
  await expect(page.getByRole('log')).not.toHaveAttribute('aria-busy')
  // A sessão criada aparece na lista (sessões pelo BFF).
  await expect(
    sidebar.getByRole('button', { name: /^Olá, fake/ })
  ).toBeVisible()

  expect(
    requests.some((url) =>
      url.startsWith(`${APP_URL}/api/playground/agents/agente-beta/runs`)
    )
  ).toBe(true)
  expect(requests.filter((url) => !url.startsWith(APP_URL))).toEqual([])
  expect(foreign).toEqual([])
})

// BUG-P0-03-1 (corrigido no P0-06): o chat anexa os deltas `RunContent` do
// agno 2.5. O fake segura o RunCompleted por 3 s para esta mensagem; os deltas
// chegam em ~100 ms.
test('chat: mostra o texto parcial em stream antes do RunCompleted (BUG-P0-03-1)', async ({
  page
}) => {
  await openPlayground(page)
  await expect(composer(page)).toBeEnabled()

  // O prazo de 1,5 s conta da resposta do POST /runs, não do Enter: a
  // navegação e o início da requisição não entram na janela.
  const runResponse = page.waitForResponse((r) => r.url().endsWith('/runs'))
  await sendMessage(page, 'segure o RunCompleted')
  await runResponse

  await expect(
    page.getByText('Agente Alfa recebeu: segure o RunCompleted')
  ).toBeVisible({ timeout: 1500 })
  // Ainda sem o RunCompleted: "gerando" no lugar das métricas (P1-06).
  await expect(page.getByText('gerando', { exact: true })).toBeVisible()
  await expect(page.getByRole('log')).toHaveAttribute('aria-busy', 'true')
  await expect(page.getByText('1,4 s · 812 tokens')).toBeVisible({
    timeout: 5000
  })
  await expect(page.getByText('gerando', { exact: true })).toHaveCount(0)
})

// Risco do P2-03: buffering do stream no BFF em `next start` (a CI roda o
// build). Os eventos têm de chegar antes do fim do run, que o fake segura 3 s.
test('BFF repassa o stream sem buffer: o 1º evento chega bem antes do RunCompleted', async ({
  page
}) => {
  await openPlayground(page)

  const timings = await page.evaluate(async () => {
    const started = performance.now()
    const response = await fetch('/api/playground/agents/agente-alfa/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'segure o RunCompleted' })
    })
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let text = ''
    let firstContent: number | null = null
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      if (firstContent === null && text.includes('RunContent'))
        firstContent = performance.now() - started
    }
    return {
      firstContent,
      total: performance.now() - started,
      completed: text.includes('RunCompleted')
    }
  })

  expect(timings.completed).toBe(true)
  expect(timings.firstContent).not.toBeNull()
  expect(timings.total - timings.firstContent!).toBeGreaterThan(2000)
})

test('chat em modo Team pelo BFF: eventos do team, métricas e sessão do team', async ({
  page
}) => {
  const { sidebar } = await openPlayground(page)
  await expect(composer(page)).toBeEnabled()

  await sidebar.getByRole('button', { name: 'Team', exact: true }).click()
  await expect(
    sidebar.getByRole('combobox', { name: 'Team: Time Suporte' })
  ).toBeVisible()
  await expect(page).toHaveURL(/team=time-suporte/)
  const message = `time ${Date.now()}`
  await page
    .getByRole('textbox', { name: 'Mensagem para Time Suporte' })
    .fill(message)
  await page
    .getByRole('textbox', { name: 'Mensagem para Time Suporte' })
    .press('Enter')

  await expect(page.getByText(`Time Suporte recebeu: ${message}`)).toBeVisible()
  await expect(page.getByText('1,4 s · 812 tokens')).toBeVisible()
  await expect(
    sidebar.getByRole('button', { name: new RegExp(`^${message}`) })
  ).toBeVisible()
})

test('fechar a aba no meio do stream: o abort chega ao orquestrador', async ({
  page,
  request
}) => {
  const aborts = async () =>
    (
      (await (await request.get(`${FAKE_ORCHESTRATOR_URL}/aborts`)).json()) as {
        entity: string
        message: string
      }[]
    ).filter(
      (run) =>
        run.entity === 'agente-beta' && run.message === 'segure o RunCompleted'
    ).length
  const before = await aborts()
  const { sidebar } = await openPlayground(page)
  await sidebar.getByRole('combobox').filter({ hasText: 'Agente Alfa' }).click()
  await page.getByRole('option', { name: 'Agente Beta' }).click()
  await expect(
    page.getByRole('textbox', { name: 'Mensagem para Agente Beta' })
  ).toBeEnabled()

  await page
    .getByRole('textbox', { name: 'Mensagem para Agente Beta' })
    .fill('segure o RunCompleted')
  await page
    .getByRole('textbox', { name: 'Mensagem para Agente Beta' })
    .press('Enter')
  await expect(
    page.getByText('Agente Beta recebeu: segure o RunCompleted')
  ).toBeVisible()
  await page.close()

  await expect.poll(aborts, { timeout: 5000 }).toBeGreaterThan(before)
})

// D-P2-03-4 (decisão 0020): "Nova conversa" no meio do run aborta o run no
// orquestrador. Usa o team (nenhum outro teste segura o run dele).
test('"Nova conversa" no meio do stream aborta o run no orquestrador', async ({
  page,
  request
}) => {
  const aborts = async () =>
    (
      (await (await request.get(`${FAKE_ORCHESTRATOR_URL}/aborts`)).json()) as {
        entity: string
        message: string
      }[]
    ).filter(
      (run) =>
        run.entity === 'time-suporte' && run.message === 'segure o RunCompleted'
    ).length
  const before = await aborts()
  const { sidebar } = await openPlayground(
    page,
    '/playground?team=time-suporte'
  )
  const box = page.getByRole('textbox', { name: 'Mensagem para Time Suporte' })
  await expect(box).toBeEnabled()

  await box.fill('segure o RunCompleted')
  await box.press('Enter')
  await expect(
    page.getByText('Time Suporte recebeu: segure o RunCompleted')
  ).toBeVisible()
  await sidebar.getByRole('button', { name: 'Nova conversa' }).click()

  await expect.poll(aborts, { timeout: 5000 }).toBeGreaterThan(before)
  // a conversa nova começa limpa, sem bolha de erro do run abortado
  await expect(page.getByText(/Algo deu errado/)).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Converse com Time Suporte' })
  ).toBeVisible()
})

test('excluir sessão sem cookie: 401, sem chegar ao orquestrador', async () => {
  const anonymous = await playwrightRequest.newContext({
    baseURL: APP_URL,
    storageState: { cookies: [], origins: [] }
  })
  const response = await anonymous.delete('/api/playground/sessions/qualquer', {
    headers: { origin: APP_URL }
  })
  const body = await response.json()
  await anonymous.dispose()

  expect(response.status()).toBe(401)
  expect(body).toEqual({ success: false, error: 'unauthorized' })
})
