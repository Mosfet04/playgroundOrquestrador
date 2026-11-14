import { expect, test } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'

// QA P4-03: histórico do navegador no playground depois que a URL perde o
// ?session= (D-P4-03-2/R1 esvaziam a conversa nessa transição).

// Regressão do BUG-P4-03-QA-1: Voltar/Avançar para ?session=X depois do
// esvaziamento carrega a conversa de X (antes ficava vazia com a sessão na URL
// e a próxima mensagem seguiria em X sem o usuário ver o histórico).
test('BUG-P4-03-QA-1: sessão X -> "Playground" sem sessão -> Voltar: a conversa X reaparece', async ({ page }) => {
  await page.goto('/playground?agent=agente-alfa')
  await hydrated(page)
  const composer = page.getByRole('textbox', { name: 'Mensagem para Agente Alfa' })
  await composer.fill('pergunta qa')
  await composer.press('Enter')
  await expect(page.getByText('Agente Alfa recebeu: pergunta qa')).toBeVisible()
  await expect(page).toHaveURL(/[?&]session=/)
  const withSession = page.url()

  // Link da navegação: mesma página, a URL perde o ?session= sem remontar.
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Playground' })
    .click()
  await expect(page).not.toHaveURL(/session=/)
  await expect(page.getByText('Agente Alfa recebeu: pergunta qa')).toHaveCount(0)

  await page.goBack()
  await expect(page).toHaveURL(withSession)
  // A URL aponta a sessão X: a conversa dela deve estar na tela.
  await expect(page.getByText('Agente Alfa recebeu: pergunta qa')).toBeVisible()
})

// Stream em andamento (retido no fake) quando a URL perde a sessão: a conversa
// esvazia, o run termina sem erro na tela e o composer volta. Agente Beta: as
// sessões do fake são globais e a lista do Alfa é contada por outros specs.
test('stream em andamento e a URL perde o ?session=: conversa vazia, sem erro, composer volta', async ({
  page,
  request
}) => {
  await page.goto('/playground?agent=agente-beta')
  await hydrated(page)
  const composer = page.getByRole('textbox', { name: 'Mensagem para Agente Beta' })
  await composer.fill('segure até liberar')
  await composer.press('Enter')
  await expect(page).toHaveURL(/[?&]session=/)
  await expect(page.getByRole('log').getByText('abrir_troca')).toBeVisible()

  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Playground' })
    .click()
  await expect(page).not.toHaveURL(/session=/)
  await expect(page.getByRole('log').getByText('abrir_troca')).toHaveCount(0)

  expect((await request.post(`${FAKE_ORCHESTRATOR_URL}/hold/release?agent=agente-beta`)).ok()).toBe(true)
  // Fim do run: o botão deixa de citar "aguarde a resposta terminar".
  await expect(page.getByRole('button', { name: /^Enviar mensagem/ })).not.toHaveAccessibleName(/aguarde/)
  await expect(page.getByRole('log').getByText('recebeu: segure até liberar')).toHaveCount(0)
  await expect(page.getByRole('log').getByText(/interrompid|falhou|erro/i)).toHaveCount(0)
})
