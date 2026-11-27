import { expect, test, type Page } from '@playwright/test'

import { hydrated } from './hydration'

// QA1-02: a lista de sessões depois do envio (#4), a conversa ancorada perto
// do composer (#7) e a aba Agente/Team no reload (D-QA1-0-4).

const composer = (page: Page) => page.getByRole('textbox', { name: /^Mensagem para / })

const send = async (page: Page, message: string) => {
  await composer(page).fill(message)
  await composer(page).press('Enter')
}

const openPlayground = async (page: Page) => {
  await page.goto('/playground')
  await hydrated(page)
  await expect(composer(page)).toBeEnabled()
  return page.locator('aside')
}

// A linha da sessão é um botão com o título e o horário.
const sessionRow = (page: Page, title: string) =>
  page.locator('aside').getByRole('button', { name: new RegExp(`^${title}`) })

test('sessão aberta, envio com erro do modelo e depois com resposta: a sessão segue destacada na lista', async ({
  page
}) => {
  await openPlayground(page)
  const title = `sessão ${Date.now()}`
  await send(page, title)
  await expect(page.getByText(`Agente Alfa recebeu: ${title}`)).toBeVisible()

  // Reabrir a sessão pela URL, como no QA ("Ola").
  await page.reload()
  await hydrated(page)
  await expect(sessionRow(page, title)).toHaveAttribute('aria-current', 'true')

  await send(page, 'falhe o run')
  await expect(page.getByRole('log')).not.toHaveAttribute('aria-busy')
  await expect(sessionRow(page, title)).toHaveAttribute('aria-current', 'true')
  await expect(page.getByText(/Nenhuma sessão ainda/)).toHaveCount(0)

  await send(page, 'de novo')
  await expect(page.getByText('Agente Alfa recebeu: de novo')).toBeVisible()
  await expect(page.getByRole('log')).not.toHaveAttribute('aria-busy')
  await expect(sessionRow(page, title)).toHaveAttribute('aria-current', 'true')
})

test('conversa nova com outro agente: a sessão criada fica destacada depois do run', async ({ page }) => {
  const sidebar = await openPlayground(page)
  await sidebar.getByRole('combobox').filter({ hasText: 'Agente Alfa' }).click()
  await page.getByRole('option', { name: 'Agente Beta' }).click()
  await expect(page.getByRole('textbox', { name: 'Mensagem para Agente Beta' })).toBeEnabled()

  const title = `nova ${Date.now()}`
  await send(page, title)
  await expect(page.getByText(`Agente Beta recebeu: ${title}`)).toBeVisible()
  await expect(page.getByRole('log')).not.toHaveAttribute('aria-busy')

  await expect(sessionRow(page, title)).toHaveAttribute('aria-current', 'true')
})

test('poucas mensagens: a conversa fica logo acima do composer', async ({ page }) => {
  await openPlayground(page)
  const title = `perto ${Date.now()}`
  await send(page, title)
  const reply = page.getByText(`Agente Alfa recebeu: ${title}`)
  await expect(reply).toBeVisible()

  const replyBox = await reply.boundingBox()
  const composerBox = await composer(page).boundingBox()
  // Entre a resposta e o campo: a linha de métricas e os respiros da conversa
  // e do composer, nada do vazio da área (que fica no topo).
  expect(composerBox!.y - (replyBox!.y + replyBox!.height)).toBeLessThan(120)
})

test('reload com a aba Team ativa volta na aba Team, mesmo antes da carga seguinte', async ({ page }) => {
  const sidebar = await openPlayground(page)
  const isAgentsList = (url: string) => new URL(url).pathname === '/api/playground/agents'
  // A troca de aba relê agents e teams; o orquestrador lento (cold start)
  // segura essa leitura (a requisição fica sem resposta, a URL já tem de levar
  // a aba). Ela nunca é continuada: continuar uma requisição da página que está
  // sendo recarregada trava o reload do Chromium (flake de ~5%, medido).
  await page.route('**/api/playground/agents', () => undefined, { times: 1 })
  const slowRead = page.waitForRequest((request) => isAgentsList(request.url()))

  await sidebar.getByRole('button', { name: 'Team', exact: true }).click()
  await slowRead
  await expect(page).toHaveURL(/[?&]team=time-suporte/)
  // O sinal de "carregou" é a resposta da lista de agents da página nova (a da
  // antiga nunca responde; sob carga a sidebar fica em skeleton até ela):
  // espera-se por ela, não por um prazo fixo da asserção.
  const agentsLoaded = page.waitForResponse((response) => isAgentsList(response.url()) && response.ok())
  await page.reload()
  await hydrated(page)
  await agentsLoaded

  await expect(sidebar.getByRole('button', { name: 'Team', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.getByRole('textbox', { name: 'Mensagem para Time Suporte' })).toBeEnabled()
})
