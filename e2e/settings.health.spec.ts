import { expect, test } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'

// P4-05 (D-P4-05-4/11): orquestrador degradado (503 com o corpo dos checks) e
// fora do ar, pelo modo do fake (POST /test/health). O modo vale para o fake
// inteiro, por isso este spec roda sozinho, no fim (projeto próprio no
// playwright.config.ts), e volta o fake a `healthy` depois de cada teste.

test.describe.configure({ mode: 'serial' })

const setHealth = async (mode: 'healthy' | 'degraded' | 'down') => {
  const response = await fetch(`${FAKE_ORCHESTRATOR_URL}/test/health?mode=${mode}`, { method: 'POST' })
  expect(response.status).toBe(200)
}

test.afterEach(() => setHealth('healthy'))

test('degradado: o indicador e a /settings mostram os checks do 503; a casca segue', async ({ page }) => {
  await setHealth('degraded')
  await page.goto('/settings')
  await hydrated(page)

  const shell = page.getByRole('link', { name: /^Orquestrador degradado, revisão \d+$/ })
  await expect(shell).toContainText(/^degradado · rev\. \d+/)
  const orchestrator = page.getByRole('region', { name: 'Orquestrador' })
  await expect(orchestrator.locator('header')).toContainText('Degradado')
  await expect(orchestrator.getByRole('status')).toContainText('Algum check falhou.')
  const checks = orchestrator.getByRole('list', { name: 'Checks de saúde' }).getByRole('listitem')
  await expect(checks.nth(0)).toContainText(/Erro\s*Não respondeu\./)
  await expect(checks.nth(2)).toContainText('Não configurada')
  await expect(page.getByRole('region', { name: 'Config store' })).toContainText('Gravável')

  // A casca não quebra: navegar pelo menu segue, e o indicador continua com a
  // leitura desta carga (navegação client-side não relê).
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Agentes' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Agentes' })).toBeVisible()
  await expect(shell).toBeVisible()
})

test('fora do ar: seções em erro com "Tentar de novo", indicador "fora do ar"; volta com "Tentar de novo"', async ({
  page
}) => {
  await setHealth('down')
  await page.goto('/settings')
  await hydrated(page)

  const shell = page.getByRole('link', { name: 'Orquestrador fora do ar' })
  await expect(shell).toHaveAttribute('title', 'Orquestrador não respondeu. Veja os detalhes em Configurações.')
  const orchestrator = page.getByRole('region', { name: 'Orquestrador' })
  // Sem resposta do orquestrador, o código do BFF (spec §4).
  await expect(orchestrator.getByRole('alert')).toContainText('unreachable')
  await expect(page.getByRole('region', { name: 'Config store e provedores' }).getByRole('alert')).toContainText(
    'SCHEMA_UNAVAILABLE'
  )
  await expect(
    page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Configurações' })
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()

  await setHealth('healthy')
  await orchestrator.getByRole('button', { name: 'Tentar de novo' }).click()

  await expect(orchestrator.locator('header')).toContainText('Saudável')
  await expect(page.getByRole('link', { name: /^Orquestrador online, revisão \d+$/ })).toBeVisible()
})
