import { expect, test as setup } from '@playwright/test'

import { AUTH_STATE, FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'
import { TEST_USER } from './test-env'

// P4-05: o fake reaproveitado (fora da CI) pode ter ficado degradado ou fora
// do ar se o settings.health.spec.ts foi interrompido; tudo começa saudável.
setup('fake orchestrator saudável', async ({ request }) => {
  const response = await request.post(`${FAKE_ORCHESTRATOR_URL}/test/health?mode=healthy`)
  expect(response.status()).toBe(200)
})

// P2-01: entra uma vez pela tela de login; os testes do projeto `chromium`
// começam com este cookie de sessão (storageState).
setup('entra com o usuário de teste', async ({ page }) => {
  await page.goto('/login')
  await hydrated(page)
  await page.getByLabel('Usuário').fill(TEST_USER.username)
  await page.getByLabel('Senha').fill(TEST_USER.password)
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page).toHaveURL('/')
  await page.context().storageState({ path: AUTH_STATE })
})
