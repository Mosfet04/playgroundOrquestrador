import { expect, test, type Page } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'

// P2-05 (decisão 0023): o dashboard lê o /metrics e a config dos agents do
// orquestrador pelo BFF (sem Mongo: a URL do Mongo do e2e não responde). Dados
// do fake: hoje 3+1 sessões, 3 usuários, 1000 tokens; cada dia anterior 1
// sessão, 1 usuário, 100 tokens (e2e/fake-orchestrator/server.ts). O fake só
// inclui o dia de hoje depois do POST /metrics/refresh que o BFF faz antes de ler.

const card = (page: Page, title: string) =>
  page.locator('div.rounded-lg').filter({ has: page.getByText(title, { exact: true }) })

test('abre com o fake, sem Mongo; o período muda os números e o browser não fala com o orquestrador', async ({
  page
}) => {
  const toOrchestrator: string[] = []
  page.on('request', (request) => {
    if (request.url().startsWith(FAKE_ORCHESTRATOR_URL)) toOrchestrator.push(request.url())
  })
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expect(card(page, 'Agentes ativos')).toContainText('2')
  await expect(card(page, 'Agentes ativos')).toContainText('3 no total')
  await expect(card(page, 'Máx. usuários/dia')).toContainText('3')
  await expect(card(page, 'Sessões criadas')).toContainText('3 agentes · 1 team')
  await expect(card(page, 'Tokens consumidos')).toContainText('1.000')
  await expect(page.getByText('fake-model')).toBeVisible()
  await expect(page.getByText('fake-embed')).toBeVisible()
  await expect(page.getByText('Consumo de tokens por entidade')).toHaveCount(0)

  const periods = page.getByRole('main').getByRole('combobox')
  await periods.click()
  await expect(page.getByRole('option', { name: 'Última hora' })).toHaveCount(0)
  await page.getByRole('option', { name: 'Últimos 7 dias' }).click()

  await expect(card(page, 'Sessões criadas')).toContainText('9 agentes · 1 team')
  await expect(card(page, 'Tokens consumidos')).toContainText('1.600')
  await expect(card(page, 'Máx. usuários/dia')).toContainText('3')

  await periods.click()
  await page.getByRole('option', { name: 'Últimos 90 dias' }).click()
  await expect(card(page, 'Tokens consumidos')).toContainText('9.900')

  expect(toOrchestrator).toEqual([])
})

test('BFF responde 503 (orquestrador fora): estado de erro do dashboard, com "Tentar de novo"', async ({ page }) => {
  let up = false
  await page.route(/\/api\/dashboard\/stats/, (route) =>
    up ? route.continue() : route.fulfill({ status: 503, json: { success: false, error: 'unreachable' } })
  )
  await page.goto('/dashboard')

  const alert = page.getByRole('main').getByRole('alert')
  await expect(alert).toContainText('Não foi possível carregar o dashboard')
  await expect(alert.getByText('código 503')).toBeVisible()
  up = true
  await alert.getByRole('button', { name: 'Tentar de novo' }).click()

  await expect(card(page, 'Tokens consumidos')).toContainText('1.000')
})
