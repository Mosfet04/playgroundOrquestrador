import { expect, test, type APIRequestContext } from '@playwright/test'

import { APP_URL, FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'
import { TEST_ENV, TEST_USER } from './test-env'

// AG3-02 (D-AG3-02-1): a barra lateral lista só as sessões do usuário logado,
// e o envio numa sessão de outro dono mostra a mensagem própria (o fake
// responde 404 "Session not found" como o agno 3.1.12). O histórico de sessão
// alheia aberta por ?session= continua visível.

const OWNED_TITLE = 'pergunta da conversa propria'
const FOREIGN_TITLE = 'pergunta da conversa alheia'

// Cria a sessão direto no fake, com o dono escolhido (o run do orquestrador).
async function createSession(
  request: APIRequestContext,
  { sessionId, message, userId }: { sessionId: string; message: string; userId: string }
) {
  const response = await request.post(
    `${FAKE_ORCHESTRATOR_URL}/agents/agente-beta/runs`,
    {
      headers: { Authorization: `Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_RUN}` },
      multipart: { message, session_id: sessionId, user_id: userId, stream: 'true' }
    }
  )
  expect(response.status()).toBe(200)
  await response.text()
}

test.use({ viewport: { width: 1440, height: 900 } })

test('lista só as sessões do login; a alheia abre com histórico e o envio mostra a mensagem própria', async ({
  page,
  request
}) => {
  const stamp = Date.now()
  const ownedId = `dono-${stamp}`
  const foreignId = `alheia-${stamp}`
  await createSession(request, {
    sessionId: ownedId,
    message: `${OWNED_TITLE} ${stamp}`,
    userId: TEST_USER.username
  })
  await createSession(request, {
    sessionId: foreignId,
    message: `${FOREIGN_TITLE} ${stamp}`,
    userId: 'outro-usuario'
  })
  await page.route(
    (url) => url.origin !== APP_URL,
    (route) => route.abort()
  )

  await page.goto('/playground?agent=agente-beta')
  await hydrated(page)
  const aside = page.locator('aside')
  await expect(aside.getByText(`${OWNED_TITLE} ${stamp}`)).toBeVisible()
  await expect(aside.getByText(`${FOREIGN_TITLE} ${stamp}`)).toHaveCount(0)

  await page.goto(`/playground?agent=agente-beta&session=${foreignId}`)
  await hydrated(page)
  await expect(
    page.getByText(`Agente Beta recebeu: ${FOREIGN_TITLE} ${stamp}`)
  ).toBeVisible()

  const composer = page.getByRole('textbox', { name: 'Mensagem para Agente Beta' })
  await composer.fill('posso continuar?')
  await composer.press('Enter')

  await expect(
    page.getByText('Esta conversa é de outro usuário. Comece uma nova.')
  ).toBeVisible()
  await expect(page.getByText(/Session not found/i)).toHaveCount(0)
  await expect(aside.getByRole('button', { name: 'Nova conversa' })).toBeEnabled()
})
