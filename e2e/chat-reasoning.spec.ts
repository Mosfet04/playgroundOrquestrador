import { expect, test, type Page } from '@playwright/test'

import { APP_URL } from '../playwright.config'
import { hydrated } from './hydration'

// AG3-04: o painel de raciocínio do agno 3 no chat (docs/design/AG3-04.md, § 7)
// com o cenário `raciocine passo a passo` do fake. Usa o Agente Beta para não
// criar sessão na lista do Agente Alfa que o e2e/i18n.spec.ts conta.
const askForReasoning = async (page: Page, { mobile = false } = {}) => {
  await page.route(
    (url) => url.origin !== APP_URL,
    (route) => route.abort()
  )
  await page.goto('/playground')
  if (mobile) {
    // Em 390 o seletor de agente fica no Sheet do painel, que só abre
    // hidratado (o clique antes disso se perde: repete).
    const trigger = page.getByRole('button', { name: /Abrir sessões e agente/ })
    await expect(async () => {
      await trigger.click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 1000 })
    }).toPass()
    await page.getByRole('dialog').getByRole('combobox', { name: 'Agente: Agente Alfa' }).click()
    await page.getByRole('option', { name: 'Agente Beta' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  } else {
    await hydrated(page)
    await page.locator('aside').getByRole('combobox', { name: 'Agente: Agente Alfa' }).click()
    await page.getByRole('option', { name: 'Agente Beta' }).click()
  }
  const composer = page.getByRole('textbox', { name: 'Mensagem para Agente Beta' })
  await expect(composer).toBeEnabled()
  await composer.fill('raciocine passo a passo')
  await composer.press('Enter')
  await expect(page.getByText('Agente Beta recebeu: raciocine passo a passo')).toBeVisible()
  await expect(page.getByText('1,4 s · 812 tokens')).toBeVisible()
}

test('chat: dois passos recolhidos, sem chip de think/analyze nem passo repetido', async ({
  page
}) => {
  await askForReasoning(page)

  const steps = page.getByRole('list', { name: 'Raciocínio' }).getByRole('listitem')
  await expect(steps).toHaveCount(2)
  await expect(steps.nth(0)).toContainText('Passo 1')
  await expect(steps.nth(0)).toContainText('Entender o pedido')
  await expect(steps.nth(0)).toContainText('confiança 80%')
  await expect(steps.nth(1)).toContainText('Passo 2')
  await expect(steps.nth(1)).toContainText('Validar a resposta')
  await expect(steps.nth(1)).toContainText('confiança 90%')
  await expect(page.locator('details[open]')).toHaveCount(0)

  // O cenário só chama think e analyze: ambos viram passo, nenhum vira chip.
  await expect(page.getByRole('list', { name: 'Chamadas de tool' })).toHaveCount(0)
  await expect(page.getByText(/^(think|analyze)$/)).toHaveCount(0)
})

test('chat: o teclado abre o passo e mostra só os campos que vieram', async ({ page }) => {
  await askForReasoning(page)

  const first = page.locator('details', { hasText: 'Entender o pedido' })
  await first.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(first).toHaveAttribute('open', '')
  await expect(first.getByRole('term')).toHaveText(['Ação', 'Raciocínio', 'Próxima ação'])
  await expect(first.getByText('Continuar')).toBeVisible()

  const second = page.locator('details', { hasText: 'Validar a resposta' })
  await second.locator('summary').click()
  await expect(second.getByRole('term')).toHaveText(['Resultado', 'Raciocínio', 'Próxima ação'])
  await expect(second.getByText('Resposta final')).toBeVisible()

  await first.locator('summary').focus()
  await page.keyboard.press('Space')
  await expect(first).not.toHaveAttribute('open', '')
})

test.describe('celular 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('o painel não rola na horizontal e o resumo tem 44 px de toque', async ({ page }) => {
    await askForReasoning(page, { mobile: true })

    const summary = page.locator('details summary').first()
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await summary.click()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
