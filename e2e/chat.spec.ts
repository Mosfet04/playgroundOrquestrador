import { expect, test, type Page } from '@playwright/test'

import { APP_URL, FAKE_ORCHESTRATOR_URL } from '../playwright.config'

// Abre o playground e aponta o endpoint para o fake pela sidebar, como o usuário faz.
const openPlaygroundOnFake = async (page: Page) => {
  // Do browser só passam o app e o fake: bloqueia o endpoint padrão
  // (localhost:7777) e a rede externa que o chat usa (ipify e monitoramento do
  // FingerprintJS). As fontes do next/font/google são baixadas pelo servidor
  // do Next, fora deste bloqueio (decisão 0004, resolvido no P1-01).
  const allowedOrigins = [APP_URL, FAKE_ORCHESTRATOR_URL]
  await page.route(
    (url) => !allowedOrigins.includes(url.origin),
    (route) => route.abort()
  )

  await page.goto('/')
  await page.getByRole('button', { name: /^Playground/ }).click()

  const sidebar = page.locator('aside')
  await sidebar.getByText('http://localhost:7777').click()
  const endpointInput = sidebar.getByRole('textbox')
  await endpointInput.fill(FAKE_ORCHESTRATOR_URL)
  await endpointInput.press('Enter')
  return sidebar
}

const sendMessage = async (page: Page, message: string) => {
  const chatInput = page.getByPlaceholder('Ask anything')
  await chatInput.fill(message)
  await chatInput.press('Enter')
}

test('chat: aponta o endpoint para o fake, escolhe o agente e recebe a resposta final', async ({
  page
}) => {
  const sidebar = await openPlaygroundOnFake(page)

  await sidebar.getByRole('combobox').filter({ hasText: 'Agente Alfa' }).click()
  await page.getByRole('option', { name: 'Agente Beta' }).click()
  await expect(
    sidebar.getByRole('combobox').filter({ hasText: 'Agente Beta' })
  ).toBeVisible()

  await sendMessage(page, 'Olá, fake')

  await expect(page.getByText('Agente Beta recebeu: Olá, fake')).toBeVisible()
})

// BUG-P0-03-1: o chat ignora os deltas `RunContent` do agno 2.5 e só mostra o
// texto no `RunCompleted`. O fake segura o RunCompleted por 3 s para esta
// mensagem; os deltas chegam em ~100 ms. Vira teste normal no P0-06.
test.fail(
  'chat: mostra o texto parcial em stream antes do RunCompleted (BUG-P0-03-1)',
  async ({ page }) => {
    await openPlaygroundOnFake(page)
    await expect(page.getByPlaceholder('Ask anything')).toBeEnabled()

    // O prazo de 1,5 s conta da resposta do POST /runs, não do Enter: a
    // navegação e o início da requisição não entram na janela.
    const runResponse = page.waitForResponse((r) => r.url().endsWith('/runs'))
    await sendMessage(page, 'segure o RunCompleted')
    await runResponse

    await expect(
      page.getByText('Agente Alfa recebeu: segure o RunCompleted')
    ).toBeVisible({ timeout: 1500 })
  }
)
