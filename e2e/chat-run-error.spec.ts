import { expect, test, type Page } from '@playwright/test'

// QA1-03 (docs/design/QA1-03.md): o erro do modelo pelo fake (503 "high
// demand" e erro pydantic de parâmetro) vira frase por código, com o texto do
// provedor só em "Detalhes técnicos" e o Reenviar na mesma sessão; ao reabrir,
// a pergunta sem resposta fica marcada. A classificação e o saneamento do BFF
// estão em tests/app/api/playgroundChat.test.ts. Sessões no Agente Beta.

const composer = (page: Page) => page.getByRole('textbox', { name: 'Mensagem para Agente Beta' })
const errorBlock = (page: Page) => page.getByRole('group', { name: 'Erro na resposta' })
const userBubbles = (page: Page, text: string) =>
  page.getByRole('log').getByText(text, { exact: true })

// O composer só habilita com a página hidratada e o agente carregado.
const open = async (page: Page) => {
  await page.goto('/playground?agent=agente-beta')
  await expect(composer(page)).toBeEnabled()
}

const send = async (page: Page, message: string) => {
  await composer(page).fill(message)
  await composer(page).press('Enter')
}

// Corpo de cada POST de run que o browser manda ao BFF.
const runBodies = (page: Page) => {
  const bodies: unknown[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/playground\/agents\/[^/]+\/runs$/.test(request.url()))
      bodies.push(request.postDataJSON())
  })
  return bodies
}

const sessionOf = (page: Page) => new URL(page.url()).searchParams.get('session')

test('503 "high demand": frase própria, detalhes no colapsável e Reenviar na mesma sessão', async ({
  page
}) => {
  await open(page)
  const bodies = runBodies(page)
  await send(page, 'sobrecarregue uma vez')

  const error = errorBlock(page)
  await expect(error.getByRole('alert')).toHaveText(
    'O modelo está sobrecarregado. Tente de novo em instantes.'
  )
  await expect(error.getByRole('alert')).toHaveClass(/text-destructive/)
  await expect(page.getByText(/high demand/)).toBeHidden()
  const toggle = error.getByRole('button', { name: 'Detalhes técnicos' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(error.getByRole('region', { name: 'Detalhes técnicos' })).toContainText(
    '503 UNAVAILABLE'
  )
  await expect(page).toHaveURL(/[?&]session=/)
  const session = sessionOf(page)

  await error.getByRole('button', { name: 'Reenviar' }).click()

  await expect(page.getByText('Agente Beta recebeu: sobrecarregue uma vez')).toBeVisible()
  await expect(errorBlock(page)).toHaveCount(0)
  await expect(userBubbles(page, 'sobrecarregue uma vez')).toHaveCount(1)
  await expect(composer(page)).toBeFocused()
  expect(sessionOf(page)).toBe(session)
  expect(bodies).toEqual([
    { message: 'sobrecarregue uma vez' },
    { message: 'sobrecarregue uma vez', session_id: session }
  ])
})

test('erro pydantic: a frase cita o parâmetro; o texto pydantic só no colapsável', async ({
  page
}) => {
  await open(page)
  await send(page, 'parametro invalido')

  const error = errorBlock(page)
  await expect(error.getByRole('alert')).toHaveText(
    'O modelo recusou o parâmetro temperature. Ajuste-o na configuração do agente.'
  )
  await expect(page.getByText(/validation error|pydantic/)).toBeHidden()
  await error.getByRole('button', { name: 'Detalhes técnicos' }).click()
  await expect(error.getByRole('region', { name: 'Detalhes técnicos' })).toContainText(
    '1 validation error for GenerateContentConfig'
  )
})

test('reabrir a sessão depois do erro: a pergunta sem resposta fica marcada e o Reenviar não a duplica', async ({
  page
}) => {
  await open(page)
  const bodies = runBodies(page)
  const first = `antes do erro ${Date.now()}`
  await send(page, first)
  await expect(page.getByText(`Agente Beta recebeu: ${first}`)).toBeVisible()
  await send(page, 'falhe o run')
  await expect(errorBlock(page)).toBeVisible()
  const session = sessionOf(page)

  await page.reload()
  await expect(composer(page)).toBeEnabled()

  const log = page.getByRole('log')
  await expect(userBubbles(page, 'falhe o run')).toHaveCount(1)
  await expect(log.getByText('sem resposta', { exact: true })).toHaveCount(1)
  await expect(errorBlock(page)).toHaveCount(0)

  await log.getByRole('button', { name: 'Reenviar' }).click()

  // O run falha de novo: a bolha de erro volta e a pergunta segue uma só.
  await expect(errorBlock(page).getByRole('alert')).toHaveText(
    'O modelo está sobrecarregado. Tente de novo em instantes.'
  )
  await expect(userBubbles(page, 'falhe o run')).toHaveCount(1)
  await expect(log.getByText('sem resposta', { exact: true })).toHaveCount(0)
  expect(bodies.at(-1)).toEqual({ message: 'falhe o run', session_id: session })
})

// D-QA1-03-5: o run que falha depois de uma tool grava a tool call sem texto;
// ao reabrir, ela não conta como resposta.
test('reabrir depois do erro que veio após uma tool: a pergunta fica sem resposta, com Reenviar', async ({
  page
}) => {
  await open(page)
  await send(page, 'falhe depois da tool')
  await expect(errorBlock(page)).toBeVisible()
  await expect(page).toHaveURL(/[?&]session=/)

  await page.reload()
  await expect(composer(page)).toBeEnabled()

  const log = page.getByRole('log')
  await expect(userBubbles(page, 'falhe depois da tool')).toHaveCount(1)
  await expect(log.getByText('sem resposta', { exact: true })).toHaveCount(1)
  await expect(log.getByRole('button', { name: 'Reenviar' })).toBeVisible()
})

test('390 px: Reenviar com altura de toque e nada rola na horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  await send(page, 'parametro invalido')

  const resend = errorBlock(page).getByRole('button', { name: 'Reenviar' })
  await expect(resend).toBeVisible()
  await errorBlock(page).getByRole('button', { name: 'Detalhes técnicos' }).click()
  expect((await resend.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  const panel = await errorBlock(page).getByRole('region', { name: 'Detalhes técnicos' }).boundingBox()
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(390)
  // Só o `main` rola (QA1-01): nada nele passa da largura.
  expect(
    await page.locator('main').evaluate((main) => main.scrollWidth <= main.clientWidth)
  ).toBe(true)
})
