import { expect, test, type Page } from '@playwright/test'

import { APP_URL } from '../playwright.config'
import { hydrated } from './hydration'

// QA P4-01 (V-P4-01-8, -17, -18): em 390 px o status fica acima do Salvar e
// quebra sem rolagem horizontal, mesmo com o detalhe técnico longo e em EN;
// "Recarregar agente" ocupa a largura com 40 px de altura; a revisão está no
// Sheet acima de "Sair". Só o PUT é interceptado (a leitura vem do fake, que
// não é escrito: os outros specs contam os agents).

test.use({ viewport: { width: 390, height: 844 } })

const status = (page: Page) => page.locator('[aria-live="polite"][aria-atomic="true"]')

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

async function openEditor(page: Page, reply: object, httpStatus: number) {
  await page.route('**/api/agents/agente-alfa', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: httpStatus, json: reply })
      : route.continue()
  )
  await page.goto('/agents/agente-alfa')
  await hydrated(page)
  await expect(page.getByLabel(/^(ID do agente|Agent ID)/)).toHaveValue('agente-alfa')
  // O seed tem o RAG ligado sem nome de documento: sem ele a validação local
  // segura o envio.
  await page.getByRole('textbox', { name: /^(Nome do documento|Document name) \*/ }).fill('manual')
}

test('390: não confirmada e não aplicada (tipo longo) acima do Salvar, sem rolagem horizontal; revisão no Sheet', async ({
  page
}) => {
  await openEditor(page, { success: false, error: 'not_confirmed' }, 502)
  const save = page.getByRole('button', { name: 'Salvar' })
  await page.getByLabel(/^Nome \*/).fill('Agente Alfa editado no celular')
  await save.click()

  const reload = status(page).getByRole('button', { name: 'Recarregar agente' })
  await expect(reload).toBeVisible()
  const block = (await status(page).boundingBox())!
  const button = (await reload.boundingBox())!
  expect(button.height).toBe(40)
  // w-full dentro do corpo do bloco (o ícone e o padding ficam à esquerda).
  expect(button.width).toBeGreaterThan(block.width * 0.75)
  expect(block.y + block.height).toBeLessThanOrEqual((await save.boundingBox())!.y)
  expect(await noHorizontalScroll(page)).toBe(true)

  // Não aplicada com o tipo longo: o chip quebra dentro do bloco.
  await page.unroute('**/api/agents/agente-alfa')
  await page.route('**/api/agents/agente-alfa', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status: 422,
          json: { success: false, error: 'not_applied', errorType: `pydantic_core.${'Validation'.repeat(6)}Error` }
        })
      : route.continue()
  )
  await save.click()
  const code = status(page).locator('code')
  await expect(code).toHaveText(/^pydantic_core\./)
  const box = (await status(page).boundingBox())!
  const chip = (await code.boundingBox())!
  expect(chip.x + chip.width).toBeLessThanOrEqual(box.x + box.width)
  expect(await noHorizontalScroll(page)).toBe(true)

  // A revisão no Sheet, depois da divisória e acima de "Sair".
  await page.getByRole('button', { name: 'Abrir menu' }).click()
  const sheet = page.getByRole('dialog')
  const revision = sheet.getByText(/^Revisão do runtime: \d+$/)
  await expect(revision).toBeAttached()
  const signOut = sheet.getByRole('button', { name: 'Sair' })
  const line = (await revision.locator('..').boundingBox())!
  expect(line.y + line.height).toBeLessThanOrEqual((await signOut.boundingBox())!.y)
})

test('390 EN: "Not applied" sem rolagem horizontal e o indicador no Sheet', async ({ page, context }) => {
  await context.addCookies([{ name: 'locale', value: 'en', url: APP_URL }])
  await openEditor(page, { success: false, error: 'not_applied', errorType: 'ValueError' }, 422)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(status(page)).toContainText("Not applied: the orchestrator couldn't load this configuration.")
  expect(await noHorizontalScroll(page)).toBe(true)
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(page.getByRole('dialog').getByText(/^Runtime revision: \d+$/)).toBeAttached()
})
