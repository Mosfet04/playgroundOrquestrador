import { expect, test, type Page } from '@playwright/test'

import { hydrated } from './hydration'
import { saveAndConfirm } from './saveReview'

// QA do QA1-06 (#15): o que o e2e do dev não alcança. "Testar agora" depois de
// salvar, Avançar do browser (Navigation API), menu do celular e "Sair".
// Nada grava no fake: o agente é servido por rota (GET e PUT com estado, como o
// orquestrador), porque os outros specs contam o seed.

const draftDialog = (page: Page) => page.getByRole('dialog', { name: 'Descartar alterações?' })
const keep = (page: Page) => page.getByRole('button', { name: 'Continuar editando' })
const discard = (page: Page) => page.getByRole('button', { name: 'Descartar e sair' })
const nameField = (page: Page) => page.getByLabel(/^Nome \*/)
const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' })
const status = (page: Page) => page.locator('[aria-live="polite"][aria-atomic="true"]')

// /agents -> "Novo agente": a lista fica uma entrada atrás no histórico.
async function openNewAgent(page: Page) {
  await page.goto('/agents')
  await hydrated(page)
  await page.getByRole('link', { name: 'Novo agente' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Novo agente' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Salvar' })).toBeEnabled()
}

// O agente-beta com GET e PUT em memória: o PUT grava o corpo e sobe a versão.
async function serveBeta(page: Page) {
  const { data } = await (await page.request.get('/api/agents/agente-beta')).json()
  let doc = data
  await page.route('**/api/agents/agente-beta', async (route) => {
    if (route.request().method() === 'PUT') {
      doc = { ...doc, ...route.request().postDataJSON(), version: doc.version + 1 }
      return route.fulfill({ json: { success: true, data: doc, runtimeRevision: 9 } })
    }
    return route.fulfill({ json: { success: true, data: doc } })
  })
}

async function openBeta(page: Page) {
  await serveBeta(page)
  await page.goto('/agents/agente-beta')
  await hydrated(page)
  await expect(page.getByRole('combobox', { name: /^Provedor \*/ })).toBeEnabled()
}

test.describe('"Testar agora" (P4-03) depois de salvar', () => {
  test('limpo logo após o Salvar: o link navega sem aviso', async ({ page }) => {
    await openBeta(page)
    await nameField(page).fill('Beta salvo')
    await saveAndConfirm(page)

    const link = status(page).getByRole('link', { name: 'Testar agora no playground' })
    await link.click()

    await expect(page).toHaveURL('/playground?agent=agente-beta')
    await expect(draftDialog(page)).toHaveCount(0)
  })

  // Spec § 5.3 prevê "editar de novo e clicar em Testar agora ⇒ aviso", mas o
  // status "aplicada" some na 1ª mudança de valor (P4-01 § 3.3): com o formulário
  // sujo o link não existe. O aviso vale então para os outros links, e a base
  // passa a ser o valor salvo.
  test('editar de novo: o link some; o menu avisa; voltar ao valor salvo limpa', async ({ page }) => {
    await openBeta(page)
    await nameField(page).fill('Beta salvo')
    await saveAndConfirm(page)
    const link = status(page).getByRole('link', { name: 'Testar agora no playground' })
    await expect(link).toBeVisible()

    await nameField(page).fill('Beta outra vez')
    await expect(link).toHaveCount(0)
    const playground = mainNav(page).getByRole('link', { name: 'Playground' })
    await playground.click()
    await expect(draftDialog(page)).toBeVisible()
    await keep(page).click()
    await expect(page).toHaveURL('/agents/agente-beta')
    await expect(nameField(page)).toHaveValue('Beta outra vez')

    await nameField(page).fill('Beta salvo')
    await playground.click()
    await expect(page).toHaveURL('/playground')
    await expect(draftDialog(page)).toHaveCount(0)
  })
})

test.describe('Voltar/Avançar do browser (Navigation API)', () => {
  test('Avançar com rascunho: aviso; a URL fica; "Continuar editando" mantém; "Descartar e sair" avança', async ({
    page
  }) => {
    await openNewAgent(page)
    // Uma entrada à frente: lista -> formulário -> Teams (limpo) e Voltar do browser ao formulário.
    await mainNav(page).getByRole('link', { name: 'Teams' }).click()
    await expect(page).toHaveURL('/teams')
    await page.evaluate(() => history.back())
    await expect(page).toHaveURL('/agents/new')
    await expect(page.getByRole('button', { name: 'Salvar' })).toBeEnabled()
    expect(await page.evaluate(() => 'navigation' in window)).toBe(true)

    await nameField(page).fill('Rascunho')
    await page.evaluate(() => history.forward())
    await expect(draftDialog(page)).toBeVisible()
    await expect(page).toHaveURL('/agents/new')
    await keep(page).click()
    await expect(nameField(page)).toHaveValue('Rascunho')

    // A entrada de Teams segue à frente: um segundo Avançar ainda é um passo.
    await page.evaluate(() => history.forward())
    await expect(draftDialog(page)).toBeVisible()
    await discard(page).click()
    await expect(page).toHaveURL('/teams')
    // O router seguiu o popstate (a página carrega por Suspense: o item ativo basta).
    await expect(mainNav(page).getByRole('link', { name: 'Teams' })).toHaveAttribute('aria-current', 'page')
  })

  // BUG-QA1-06-QA-2 (MINOR, só com 2 Voltar na mesma tarefa, tempo que o clique humano
  // não alcança; com um quadro de intervalo o guard segura): o 2º `history.back()`
  // já está na fila e o `history.go(+1)` do guard é descartado. O browser fica na
  // lista (URL /agents) com o formulário e o aviso ainda na tela; "Descartar e
  // sair" (go(-1)) não tem para onde ir.
  test.fail('BUG-QA1-06-QA-2: dois Voltar na mesma tarefa: a URL fica na do formulário', async ({ page }) => {
    await openNewAgent(page)
    await nameField(page).fill('Rascunho')

    await page.evaluate(() => {
      history.back()
      history.back()
    })
    await expect(draftDialog(page)).toBeVisible()
    await expect(page).toHaveURL('/agents/new')
    await expect(nameField(page)).toHaveValue('Rascunho')
  })
})

test.describe('celular (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('link do menu com rascunho: aviso; "Continuar editando" fica; "Descartar e sair" navega e o Sheet fecha', async ({
    page
  }) => {
    await openNewAgent(page)
    await nameField(page).fill('Rascunho')

    const menuButton = page.getByRole('button', { name: 'Abrir menu' })
    await menuButton.click()
    const sheet = page.getByRole('dialog', { name: 'Menu' })
    await sheet.getByRole('link', { name: 'Teams' }).click()

    await expect(draftDialog(page)).toBeVisible()
    await expect(keep(page)).toBeFocused()
    await keep(page).click()
    await expect(draftDialog(page)).toBeHidden()
    await expect(page).toHaveURL('/agents/new')
    await expect(nameField(page)).toHaveValue('Rascunho')
    // O menu segue aberto (o clique não chegou ao link) e o link tem o foco de volta.
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('link', { name: 'Teams' })).toBeFocused()

    await sheet.getByRole('link', { name: 'Teams' }).click()
    await expect(draftDialog(page)).toBeVisible()
    // Botões do aviso em largura total, "Continuar editando" em cima (spec § 5.4).
    const [keepBox, discardBox] = await Promise.all([keep(page).boundingBox(), discard(page).boundingBox()])
    expect(keepBox!.y).toBeLessThan(discardBox!.y)
    await discard(page).click()

    await expect(page).toHaveURL('/teams')
    await expect(sheet).toBeHidden()
    await expect(draftDialog(page)).toBeHidden()
  })
})

test.describe('"Sair" com rascunho', () => {
  // O POST de logout é contado; a sessão do teste é só o cookie (stateless).
  async function countLogouts(page: Page, respond?: 'fail') {
    const logouts: string[] = []
    await page.route('**/api/auth/logout', async (route) => {
      logouts.push(route.request().method())
      if (respond === 'fail') return route.fulfill({ status: 500, json: { success: false } })
      return route.continue()
    })
    return logouts
  }

  test('"Continuar editando": nenhum POST de logout e a sessão segue válida', async ({ page }) => {
    const logouts = await countLogouts(page)
    await openNewAgent(page)
    await nameField(page).fill('Rascunho')

    const signOut = page.getByRole('button', { name: 'Sair' })
    await signOut.click()
    await expect(draftDialog(page)).toBeVisible()
    await keep(page).click()
    await expect(draftDialog(page)).toBeHidden()

    expect(logouts).toEqual([])
    await expect(page).toHaveURL('/agents/new')
    await expect(nameField(page)).toHaveValue('Rascunho')
    await expect(signOut).toBeFocused()
    await expect(signOut).not.toHaveAttribute('aria-busy')
    expect((await page.request.get('/api/agents')).status()).toBe(200)
  })

  test('"Descartar e sair": um POST de logout, vai ao login e sem o diálogo nativo', async ({ page }) => {
    const logouts = await countLogouts(page)
    const native: string[] = []
    page.on('dialog', (dialog) => {
      native.push(dialog.type())
      void dialog.dismiss()
    })
    await openNewAgent(page)
    await nameField(page).fill('Rascunho')

    await page.getByRole('button', { name: 'Sair' }).click()
    await discard(page).click()

    await expect(page).toHaveURL(/\/login/)
    expect(logouts).toEqual(['POST'])
    expect(native).toEqual([])
    expect((await page.request.get('/api/agents')).status()).toBe(401)
  })

  // BUG-QA1-06-QA-1 (corrigido, D-QA1-06-6): se o logout falha (500) depois de
  // "Descartar e sair", a pessoa fica no formulário com o rascunho; a próxima
  // interação rearma o guard.
  test('BUG-QA1-06-QA-1: logout falha depois de "Descartar e sair": o rascunho segue protegido', async ({
    page
  }) => {
    await countLogouts(page, 'fail')
    await openNewAgent(page)
    await nameField(page).fill('Rascunho')

    await page.getByRole('button', { name: 'Sair' }).click()
    await discard(page).click()
    await expect(page.getByText('Não foi possível sair')).toBeVisible()
    await expect(page).toHaveURL('/agents/new')

    await mainNav(page).getByRole('link', { name: 'Teams' }).click()
    await expect(draftDialog(page)).toBeVisible()
  })
})
