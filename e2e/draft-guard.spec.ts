import { expect, test, type Page } from '@playwright/test'

import { hydrated } from './hydration'
import { saveAndConfirm } from './saveReview'

// QA1-06: aviso de rascunho (#15, D-QA1-06-4) e vírgula decimal nos parâmetros
// do modelo (#3, D-QA1-06-1). Nada grava no fake: o PUT é interceptado (os
// outros specs contam o seed).

const draftDialog = (page: Page) => page.getByRole('dialog', { name: 'Descartar alterações?' })
const keep = (page: Page) => page.getByRole('button', { name: 'Continuar editando' })
const discard = (page: Page) => page.getByRole('button', { name: 'Descartar e sair' })
const nameField = (page: Page) => page.getByLabel(/^Nome \*/)
const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' })

// /agents -> "Novo agente": a lista fica uma entrada atrás no histórico.
async function openNewAgent(page: Page) {
  await page.goto('/agents')
  await hydrated(page)
  await page.getByRole('link', { name: 'Novo agente' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Novo agente' })).toBeVisible()
  // Com o schema lido o formulário está completo (o Salvar só habilita com ele).
  await expect(page.getByRole('button', { name: 'Salvar' })).toBeEnabled()
}

test('Voltar com o nome digitado: aviso; Esc fica; Cancelar + "Descartar e sair" vai à lista', async ({ page }) => {
  await openNewAgent(page)
  await nameField(page).fill('Rascunho')

  await page.getByRole('link', { name: 'Voltar' }).click()
  await expect(draftDialog(page)).toBeVisible()
  await expect(keep(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(draftDialog(page)).toBeHidden()
  await expect(page).toHaveURL('/agents/new')
  await expect(nameField(page)).toHaveValue('Rascunho')
  await expect(page.getByRole('link', { name: 'Voltar' })).toBeFocused()

  await page.getByRole('link', { name: 'Cancelar' }).click()
  await discard(page).click()
  await expect(page).toHaveURL('/agents')
  await expect(page.getByRole('heading', { level: 1, name: 'Agentes' })).toBeVisible()
})

test('sem rascunho não há aviso: intocado e digitado e apagado', async ({ page }) => {
  await openNewAgent(page)
  await page.getByRole('link', { name: 'Voltar' }).click()
  await expect(page).toHaveURL('/agents')

  await page.getByRole('link', { name: 'Novo agente' }).first().click()
  await expect(page.getByRole('button', { name: 'Salvar' })).toBeEnabled()
  await nameField(page).fill('Rascunho')
  await nameField(page).fill('')
  await page.getByRole('link', { name: 'Voltar' }).click()
  await expect(page).toHaveURL('/agents')
  await expect(draftDialog(page)).toHaveCount(0)
})

test('link do menu lateral com rascunho: aviso; "Continuar editando" fica na página', async ({ page }) => {
  await openNewAgent(page)
  await nameField(page).fill('Rascunho')

  const teams = mainNav(page).getByRole('link', { name: 'Teams' })
  await teams.click()
  await expect(draftDialog(page)).toBeVisible()
  await keep(page).click()
  await expect(page).toHaveURL('/agents/new')
  await expect(teams).toBeFocused()

  await teams.click()
  await discard(page).click()
  await expect(page).toHaveURL('/teams')
})

test('Voltar do browser com rascunho: aviso com a URL do formulário; "Descartar e sair" volta à lista', async ({
  page
}) => {
  await openNewAgent(page)
  await nameField(page).fill('Rascunho')

  await page.evaluate(() => history.back())
  await expect(draftDialog(page)).toBeVisible()
  await expect(page).toHaveURL('/agents/new')
  await keep(page).click()
  await expect(nameField(page)).toHaveValue('Rascunho')

  // De novo: a entrada do formulário foi restaurada, o Voltar ainda é um passo.
  await page.evaluate(() => history.back())
  await expect(draftDialog(page)).toBeVisible()
  await discard(page).click()
  await expect(page).toHaveURL('/agents')
  await expect(page.getByRole('heading', { level: 1, name: 'Agentes' })).toBeVisible()
})

test('recarregar com rascunho pede o diálogo nativo (beforeunload)', async ({ page }) => {
  await openNewAgent(page)
  await nameField(page).fill('Rascunho')

  const dialog = page.waitForEvent('dialog')
  const reload = page.reload()
  const unload = await dialog
  expect(unload.type()).toBe('beforeunload')
  await unload.accept()
  await reload
  await expect(nameField(page)).toHaveValue('')
})

test.describe('temperature com vírgula decimal (agent existente)', () => {
  // O seed do agente-beta: ollama, sem parâmetros. O PUT é respondido como aplicado.
  async function openBeta(page: Page, puts: unknown[]) {
    const { data: beta } = await (await page.request.get('/api/agents/agente-beta')).json()
    await page.route('**/api/agents/agente-beta', async (route) => {
      if (route.request().method() !== 'PUT') return route.continue()
      puts.push(route.request().postDataJSON())
      await route.fulfill({ json: { success: true, data: { ...beta, version: beta.version + 1 }, runtimeRevision: 9 } })
    })
    await page.goto('/agents/agente-beta')
    await hydrated(page)
    // Edição sem mudança: o Salvar fica aria-disabled; o schema lido libera o provedor.
    await expect(page.getByRole('combobox', { name: /^Provedor \*/ })).toBeEnabled()
    await page.getByRole('button', { name: 'Adicionar parâmetro' }).click()
    await page.getByRole('combobox', { name: 'Nome do parâmetro 1' }).click()
    await page.getByRole('option', { name: 'temperature' }).click()
    return page.getByRole('textbox', { name: 'Valor de temperature' })
  }

  test('0,7: chip "número" e o PUT leva 0.7', async ({ page }) => {
    const puts: { model_params?: Record<string, unknown> }[] = []
    const value = await openBeta(page, puts)

    await value.fill('0,7')
    await expect(page.getByRole('listitem').filter({ has: value }).getByText('número')).toBeVisible()
    await saveAndConfirm(page)

    await expect.poll(() => puts.length).toBe(1)
    expect(puts[0].model_params).toStrictEqual({ temperature: 0.7 })
  })

  test('abc: erro na linha e nenhum PUT', async ({ page }) => {
    const puts: unknown[] = []
    const value = await openBeta(page, puts)

    await value.fill('abc')
    await page.getByRole('button', { name: 'Salvar' }).click()

    await expect(page.getByText('temperature precisa ser um número (ex.: 0,7 ou 0.7).')).toBeVisible()
    await expect(value).toHaveAttribute('aria-invalid', 'true')
    await expect(value).toBeFocused()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(puts).toEqual([])
  })
})
