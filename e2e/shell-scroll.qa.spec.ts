import { expect, test, type Page } from '@playwright/test'

import { hydrated } from './hydration'

// QA1-01 (QA): o que o spec do dev não alcança. Sheet, Dialog e o listbox do
// Select abrem por portal no <body>; com a casca travada (`overflow-clip`) e o
// <main> como único scroller, precisam continuar visíveis e alcançáveis sem
// mexer no documento. E o /login, fora da casca, continua rolando o documento.

const documentLocked = (page: Page) =>
  page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight
  }))

async function expectDocumentLocked(page: Page) {
  const m = await documentLocked(page)
  expect(m.scrollY).toBe(0)
  expect(m.scrollHeight).toBe(m.innerHeight)
}

test.describe('portais com a casca travada', () => {
  test('Sheet mobile abre com o main rolado, em viewport baixa, e Sair é alcançável', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 360 })
    await page.goto('/agents/new')
    await hydrated(page)
    await page.getByRole('switch', { name: 'Habilitar RAG' }).click()
    // O form assenta (seção RAG montada) antes de rolar: a altura não muda depois.
    await expect(page.getByRole('textbox', { name: 'Nome do documento *' })).toBeVisible()
    const main = page.locator('main#conteudo')
    await main.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    const scrolled = await main.evaluate((el) => el.scrollTop)
    expect(scrolled).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Abrir menu' }).click()
    const sheet = page.getByRole('dialog', { name: 'Menu' })
    await expect(sheet).toBeInViewport()
    // 360 px de altura: o rodapé do Sheet (Sair) tem de ser alcançável rolando o Sheet.
    const signOut = sheet.getByRole('button', { name: /^Sair/ })
    await signOut.scrollIntoViewIfNeeded()
    await expect(signOut).toBeInViewport()
    const last = sheet.getByRole('link', { name: 'Dashboard' })
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeInViewport()
    await expectDocumentLocked(page)

    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expectDocumentLocked(page)
    expect(await main.evaluate((el) => el.scrollTop)).toBe(scrolled)
  })

  test('Dialog de revisão em viewport baixa: botões alcançáveis, documento imóvel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 300 })
    await page.goto('/agents/agente-beta')
    await hydrated(page)
    await page.getByLabel(/^Nome \*/).fill('Agente Beta editado')
    await page.getByRole('button', { name: /^Salvar$/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Revisar antes de salvar' })
    await expect(dialog).toBeInViewport()
    const confirm = dialog.getByRole('button', { name: 'Confirmar e salvar' })
    await confirm.scrollIntoViewIfNeeded()
    await expect(confirm).toBeInViewport()
    await expectDocumentLocked(page)
    // O Dialog cabe na tela (max-h do viewport) em vez de vazar pelo documento.
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.y).toBeGreaterThanOrEqual(0)
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(300)
    await expect(dialog.getByRole('button', { name: 'Voltar' })).toBeInViewport()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('listbox do Select (portal) abre dentro da tela com o main rolado', async ({ page }) => {
    await page.setViewportSize({ width: 1367, height: 500 })
    await page.goto('/agents/new')
    await hydrated(page)
    const provider = page.getByRole('combobox', { name: /^Provedor \*/ })
    await provider.scrollIntoViewIfNeeded()
    expect(await page.locator('main#conteudo').evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    await provider.click()
    const listbox = page.getByRole('listbox')
    await expect(listbox).toBeInViewport()
    await expect(listbox.getByRole('option').first()).toBeInViewport()
    await expectDocumentLocked(page)
    await page.keyboard.press('Escape')
    await expect(listbox).toHaveCount(0)
  })
})

test.describe('/login fora da casca', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('em viewport baixa o documento rola e o botão Entrar é alcançável', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 300 })
    await page.goto('/login')
    await hydrated(page)
    const m = await documentLocked(page)
    expect(m.scrollHeight).toBeGreaterThan(m.innerHeight)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await expect(page.getByRole('button', { name: /^Entrar$/ })).toBeInViewport()
  })
})
