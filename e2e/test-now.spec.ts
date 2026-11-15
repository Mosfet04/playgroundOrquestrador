import { expect, test, type Page } from '@playwright/test'

import { hydrated } from './hydration'
import { saveAndConfirm } from './saveReview'

// P4-03: salvar -> "Testar agora". O link do status "aplicada" abre o
// playground, na mesma aba, com a entidade selecionada e a conversa vazia, sem
// ?session=; Voltar reabre o editor. Só o PUT é interceptado (a escrita
// mudaria o fake, que os outros specs contam); a leitura vem do fake (no team, o documento do `time-config` com o id do
// `time-suporte`, o único que o playground lista).

const status = (page: Page) => page.locator('[aria-live="polite"][aria-atomic="true"]')

// Responde o PUT como o BFF responderia a uma escrita aplicada na revisão 9.
const applied = (data: { version: number }) => ({
  success: true,
  data: { ...data, version: data.version + 1 },
  runtimeRevision: 9
})

test('agent: salvar, "Testar agora" abre o playground com conversa vazia e Voltar reabre o editor', async ({
  page
}) => {
  // Conversa anterior no playground: o store sobrevive à navegação client-side.
  await page.goto('/playground?agent=agente-alfa')
  await hydrated(page)
  const composer = page.getByRole('textbox', { name: 'Mensagem para Agente Alfa' })
  await composer.fill('conversa antiga')
  await composer.press('Enter')
  await expect(page.getByText('Agente Alfa recebeu: conversa antiga')).toBeVisible()

  const { data: alfa } = await (await page.request.get('/api/agents/agente-alfa')).json()
  await page.route('**/api/agents/agente-alfa', (route) =>
    route.request().method() === 'PUT' ? route.fulfill({ json: applied(alfa) }) : route.continue()
  )
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Agentes' }).click()
  await page.getByRole('link', { name: 'Agente Alfa' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Editar agente' })).toBeVisible()
  await expect(page.getByLabel(/^ID do agente/)).toHaveValue('agente-alfa')
  await hydrated(page)
  // O seed tem o RAG ligado sem nome de documento: sem ele a validação local segura o envio.
  await page.getByRole('textbox', { name: 'Nome do documento *' }).fill('manual')
  await page.getByLabel(/^Nome \*/).fill('Agente Alfa editado')
  await saveAndConfirm(page)

  const link = status(page).getByRole('link', { name: 'Testar agora no playground' })
  await expect(link).toHaveAttribute('href', '/playground?agent=agente-alfa')
  await expect(link).not.toHaveAttribute('target')
  // Posição relativa (o visual em px é do design QA): link à direita do texto.
  const text = (await status(page).getByText(/Mudança aplicada/).boundingBox())!
  const box = (await link.boundingBox())!
  expect(box.x).toBeGreaterThan(text.x + text.width)
  await link.click()

  await expect(page).toHaveURL('/playground?agent=agente-alfa')
  await expect(page.getByRole('heading', { name: 'Converse com Agente Alfa' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Agente: Agente Alfa' })).toBeVisible()
  // (A mensagem aparece na lista de sessões da lateral: só a resposta é da conversa.)
  await expect(page.getByText('Agente Alfa recebeu: conversa antiga')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Mensagem para Agente Alfa' })).toBeEnabled()

  await page.goBack()
  await expect(page).toHaveURL('/agents/agente-alfa')
  await expect(page.getByRole('heading', { level: 1, name: 'Editar agente' })).toBeVisible()
})

test('team: salvar, "Testar agora" abre o playground no modo team com conversa vazia', async ({ page }) => {
  const { data } = await (await page.request.get('/api/teams/time-config')).json()
  const suporte = { ...data, id: 'time-suporte', nome: 'Time Suporte' }
  await page.route('**/api/teams/time-suporte', (route) =>
    route.fulfill({
      json: route.request().method() === 'PUT' ? applied(suporte) : { success: true, data: suporte }
    })
  )
  await page.goto('/teams/time-suporte')
  await expect(page.getByRole('heading', { level: 1, name: 'Editar team' })).toBeVisible()
  await hydrated(page)
  await page.getByLabel(/^Nome/).fill('Time Suporte editado')
  await saveAndConfirm(page)

  const link = status(page).getByRole('link', { name: 'Testar agora no playground' })
  await expect(link).toHaveAttribute('href', '/playground?team=time-suporte')
  await link.click()

  await expect(page).toHaveURL('/playground?team=time-suporte')
  await expect(page.getByRole('combobox', { name: 'Team: Time Suporte' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Converse com Time Suporte' })).toBeVisible()
})
