import { expect, test, type APIRequestContext } from '@playwright/test'

import { APP_URL, FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { TEST_ENV } from './test-env'

// QA AG3-02: em 390 px a barra lateral vive no Sheet do cabeçalho; depois da
// mensagem de "conversa de outro usuário", "Nova conversa" tem de estar ao
// alcance e destravar o envio (o e2e do dev usa 1440 px).

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

async function createForeignSession(
  request: APIRequestContext,
  sessionId: string,
  message: string
) {
  const response = await request.post(
    `${FAKE_ORCHESTRATOR_URL}/agents/agente-beta/runs`,
    {
      headers: { Authorization: `Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_RUN}` },
      multipart: { message, session_id: sessionId, user_id: 'outro-usuario', stream: 'true' }
    }
  )
  expect(response.status()).toBe(200)
  await response.text()
}

test('390: sessão alheia, mensagem própria e "Nova conversa" no Sheet destrava o envio', async ({
  page,
  request
}) => {
  const stamp = Date.now()
  const foreignId = `alheia390-${stamp}`
  await createForeignSession(request, foreignId, `conversa alheia ${stamp}`)
  await page.route(
    (url) => url.origin !== APP_URL,
    (route) => route.abort()
  )

  await page.goto(`/playground?agent=agente-beta&session=${foreignId}`)
  await expect(
    page.getByText(`Agente Beta recebeu: conversa alheia ${stamp}`)
  ).toBeVisible()

  const composer = page.getByRole('textbox', { name: 'Mensagem para Agente Beta' })
  await expect(async () => {
    await composer.fill('posso continuar?')
    await composer.press('Enter')
    await expect(
      page.getByText('Esta conversa é de outro usuário. Comece uma nova.')
    ).toBeVisible({ timeout: 2000 })
  }).toPass()
  await expect(page.getByText(/Session not found/i)).toHaveCount(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(0)

  await page.getByRole('button', { name: 'Abrir sessões e agente' }).click()
  const panel = page.getByRole('dialog', { name: 'Sessões e agente' })
  await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0)
  const newChat = panel.getByRole('button', { name: 'Nova conversa' })
  await expect(newChat).toBeVisible()
  await expect(newChat).toBeEnabled()
  const box = await newChat.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await newChat.click()

  await expect(page).not.toHaveURL(/session=/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(
    page.getByText('Esta conversa é de outro usuário. Comece uma nova.')
  ).toHaveCount(0)

  // Conversa nova: o envio volta a funcionar.
  await composer.fill('agora sim')
  await composer.press('Enter')
  await expect(page.getByText('Agente Beta recebeu: agora sim')).toBeVisible()
  await expect(
    page.getByText('Esta conversa é de outro usuário. Comece uma nova.')
  ).toHaveCount(0)
})
