import { expect, request as playwrightRequest, test } from '@playwright/test'

import { APP_URL } from '../playwright.config'
import { hydrated } from './hydration'
import { TEST_ENV } from './test-env'

// QA P2-03: o BFF do chat contra o app real (next start na CI). Sessão e
// Origin passam pelo middleware de verdade (o matcher conta), ids que
// decodificam para `/` ou `\\` na URL, teto de 256 KB e exclusão de sessão
// pela tela (o fake só aceita DELETE com a chave admin). Complementa
// chat.spec.ts e chat-bff.spec.ts.

const SECRETS = [
  TEST_ENV.ORCHESTRATOR_API_KEY_RUN,
  TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN,
  TEST_ENV.ORCHESTRATOR_URL,
  ':7790'
]
const expectNoSecret = (text: string) => {
  for (const secret of SECRETS) expect(text).not.toContain(secret)
}

test('sem cookie ⇒ 401 no GET; com cookie e sem Origin ⇒ 403 no POST do run', async ({
  request
}) => {
  const anonymous = await playwrightRequest.newContext({
    baseURL: APP_URL,
    storageState: { cookies: [], origins: [] }
  })
  const noCookie = await anonymous.get('/api/playground/agents')
  const text = await noCookie.text()
  await anonymous.dispose()
  expect(noCookie.status()).toBe(401)
  expect(JSON.parse(text)).toEqual({ success: false, error: 'unauthorized' })

  const noOrigin = await request.post(
    '/api/playground/agents/agente-alfa/runs',
    { data: { message: 'oi' } }
  )
  expect(noOrigin.status()).toBe(403)
  expect(await noOrigin.json()).toEqual({
    success: false,
    error: 'forbidden_origin'
  })
})

test('ids que decodificam para `/` ou `\\` ⇒ 400 invalid_path em GET, DELETE e run', async ({
  request
}) => {
  const headers = { origin: APP_URL }
  for (const id of ['..%2f..%2fadmin', 'a%2Fb', '%5c..%5c']) {
    const responses = [
      await request.get(`/api/playground/sessions/${id}?type=agent`, {
        headers
      }),
      await request.delete(`/api/playground/sessions/${id}`, { headers }),
      await request.post(`/api/playground/agents/${id}/runs`, {
        headers,
        data: { message: 'oi' }
      })
    ]
    for (const response of responses) {
      const text = await response.text()
      expect(response.status(), id).toBe(400)
      expect(JSON.parse(text)).toEqual({
        success: false,
        error: 'invalid_path'
      })
      expectNoSecret(text)
    }
  }
})

test('/playground?agent=..%2Fadmin: a tela segue de pé e nada sai para outra origem', async ({
  page
}) => {
  const foreign: string[] = []
  await page.route(
    (url) => url.origin !== APP_URL,
    (route) => (foreign.push(route.request().url()), route.abort())
  )
  const runs: number[] = []
  page.on('response', (response) => {
    if (/\/api\/playground\/agents\/[^/]+\/runs/.test(response.url()))
      runs.push(response.status())
  })

  await page.goto('/playground?agent=..%2Fadmin')
  await hydrated(page)
  const box = page.getByRole('textbox', { name: /^Mensagem para / })
  await expect(box).toBeEnabled()
  await box.fill('oi')
  await box.press('Enter')
  await expect.poll(() => runs.length).toBeGreaterThan(0)
  expect(runs.every((status) => status === 400 || status === 404)).toBe(true)

  await expect(page.getByRole('main')).toBeVisible()
  expect(foreign).toEqual([])
  expectNoSecret(await page.content())
})

test('corpo do run acima de 256 KB ⇒ 413 no app real, sem chegar ao orquestrador', async ({
  request
}) => {
  const big = await request.post('/api/playground/agents/agente-alfa/runs', {
    headers: { origin: APP_URL },
    data: { message: 'x', pad: 'y'.repeat(300_000) }
  })

  expect(big.status()).toBe(413)
  expect(await big.json()).toEqual({
    success: false,
    error: 'payload_too_large'
  })
})

test('SSE no app real: cabeçalhos do BFF, sem compressão nem Set-Cookie, sem segredo no corpo', async ({
  request
}) => {
  const response = await request.post(
    '/api/playground/agents/agente-alfa/runs',
    {
      headers: { origin: APP_URL, 'accept-encoding': 'gzip, br' },
      data: { message: 'cabecalhos' }
    }
  )
  const text = await response.text()

  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/event-stream')
  expect(response.headers()['cache-control']).toContain('no-transform')
  expect(response.headers()['content-encoding']).toBeUndefined()
  expect(response.headers()['set-cookie']).toBeUndefined()
  expect(text).toContain('RunCompleted')
  expectNoSecret(text)
  expectNoSecret(JSON.stringify(response.headers()))
})

test('excluir sessão pela tela usa a chave admin: a sessão some da lista e do orquestrador', async ({
  page,
  request
}) => {
  const foreign: string[] = []
  await page.route(
    (url) => url.origin !== APP_URL,
    (route) => (foreign.push(route.request().url()), route.abort())
  )
  const title = `apagar ${Date.now()}`
  await page.goto('/playground?agent=agente-beta')
  await hydrated(page)
  const box = page.getByRole('textbox', { name: 'Mensagem para Agente Beta' })
  await expect(box).toBeEnabled()
  await box.fill(title)
  await box.press('Enter')
  await expect(page.getByText(`Agente Beta recebeu: ${title}`)).toBeVisible()
  const row = page
    .locator('aside')
    .getByRole('button', { name: new RegExp(`^${title}`) })
  await expect(row).toBeVisible()

  const deletes: number[] = []
  page.on('response', (response) => {
    if (response.request().method() === 'DELETE')
      deletes.push(response.status())
  })
  await page
    .locator('aside')
    .getByRole('button', { name: `Excluir sessão "${title}"` })
    .click()
  await page
    .getByRole('dialog', { name: 'Excluir sessão' })
    .getByRole('button', { name: 'Excluir', exact: true })
    .click()

  await expect(row).toHaveCount(0)
  await expect.poll(() => deletes).toEqual([200])
  const sessions = await request.get(
    '/api/playground/sessions?type=agent&component_id=agente-beta'
  )
  expect(JSON.stringify(await sessions.json())).not.toContain(title)
  expect(foreign).toEqual([])
})
