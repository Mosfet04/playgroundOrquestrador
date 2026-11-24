import { expect, test } from '@playwright/test'

import { APP_URL } from '../playwright.config'
import { hydrated } from './hydration'

// QA AG3-03: o cenário de reasoning do fake (think/analyze, ReasoningStep,
// ReasoningCompleted, RunCompleted com reasoning_steps) chega ao chat pelo BFF
// sem quebrá-lo. O painel de passos e os chips de think/analyze são do
// AG3-04 (e2e/chat-reasoning.spec.ts). Usa o Agente Beta
// para não criar sessão na lista do Agente Alfa que o e2e/i18n.spec.ts conta.
test('chat: o stream de reasoning do agno 3 completa, mostra a resposta e não dá erro de stream', async ({
  page
}) => {
  await page.route(
    (url) => url.origin !== APP_URL,
    (route) => route.abort()
  )
  await page.goto('/playground')
  await hydrated(page)
  await page.locator('aside').getByRole('combobox', { name: 'Agente: Agente Alfa' }).click()
  await page.getByRole('option', { name: 'Agente Beta' }).click()

  const composer = page.getByRole('textbox', { name: 'Mensagem para Agente Beta' })
  await expect(composer).toBeEnabled()
  await composer.fill('raciocine passo a passo')
  await composer.press('Enter')

  await expect(
    page.getByText('Agente Beta recebeu: raciocine passo a passo')
  ).toBeVisible()
  await expect(page.getByText('1,4 s · 812 tokens')).toBeVisible()
  await expect(page.getByRole('log')).not.toHaveAttribute('aria-busy')
  await expect(page.getByRole('group', { name: 'Erro na resposta' })).toHaveCount(0)
  await expect(composer).toBeEnabled()
})
