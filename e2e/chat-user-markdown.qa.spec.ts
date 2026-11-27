import { expect, test, type Locator, type Page } from '@playwright/test'

// QA QA1-03: o markdown da bolha do usuário medido no browser (o jsdom não
// calcula layout). Cobre as classes que os testes de componente só conferem
// por nome de classe: quebra de linha simples, quebra forçada (`<br>`) no
// parágrafo e no item de lista, e o bloco de código longo em 390 px. Sessão
// no Agente Beta; o fake responde sem LLM.

const composer = (page: Page) => page.getByRole('textbox', { name: 'Mensagem para Agente Beta' })
// A bolha do usuário não tem papel próprio: é o único bloco `primary-soft` do log.
const bubbles = (page: Page) => page.getByRole('log').locator('.bg-primary-soft')

const open = async (page: Page) => {
  await page.goto('/playground?agent=agente-beta')
  await expect(composer(page)).toBeEnabled()
}

// Envia e devolve a bolha do usuário recém-criada.
const send = async (page: Page, message: string) => {
  const before = await bubbles(page).count()
  await composer(page).fill(message)
  await composer(page).press('Enter')
  await expect(bubbles(page)).toHaveCount(before + 1)
  await expect(page.getByText(/Agente Beta recebeu:/).last()).toBeVisible()
  // O próximo Enter só vale com o run encerrado.
  await expect(page.getByRole('log')).not.toHaveAttribute('aria-busy', 'true')
  return bubbles(page).nth(before)
}

const height = async (locator: Locator) => (await locator.boundingBox())!.height
const lineHeight = (locator: Locator) =>
  locator.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))

test('quebra de linha simples e quebra forçada têm a mesma altura: duas linhas, sem linha em branco', async ({
  page
}) => {
  await open(page)
  const one = await send(page, 'linha 1')
  const simple = await send(page, 'linha 1\nlinha 2')
  const forced = await send(page, 'linha 1  \nlinha 2')

  const line = await lineHeight(one.locator('div').first())
  const oneLine = await height(one)
  // Quebra simples: uma linha a mais. A forçada (o <br> some, a quebra do
  // pre-wrap fica) tem a mesma altura, não uma linha em branco a mais.
  expect(await height(simple)).toBeCloseTo(oneLine + line, 0)
  expect(await height(forced)).toBeCloseTo(await height(simple), 0)
  expect(await forced.innerText()).toBe('linha 1\nlinha 2')
  expect(await simple.innerText()).toBe('linha 1\nlinha 2')
})

test('item de lista com quebra forçada mostra a 2ª linha; parágrafos separados não somam linhas em branco', async ({
  page
}) => {
  await open(page)
  const one = await send(page, 'linha 1')
  const item = await send(page, '- item 1  \n  continua')
  const paragraphs = await send(page, 'p1\n\np2')

  const line = await lineHeight(one.locator('div').first())
  const li = item.getByRole('listitem')
  expect(await li.innerText()).toBe('item 1\ncontinua')
  expect(await height(li)).toBeGreaterThanOrEqual(line * 2 - 1)
  // Dois parágrafos: 2 linhas + o gap-y-2 (8 px), sem linha extra do pre-wrap
  // nos "\n" entre os blocos.
  expect(await height(paragraphs)).toBeCloseTo((await height(one)) + line + 8, 0)
})

test('390 px: bloco de código longo não vaza da bolha, que fica em 80% da coluna', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  const longLine = 'x'.repeat(200)
  const bubble = await send(page, `\`\`\`\n${longLine}\n\`\`\``)

  const column = await page.getByRole('log').boundingBox()
  const box = (await bubble.boundingBox())!
  expect(box.width).toBeLessThanOrEqual(column!.width * 0.8 + 1)
  const pre = bubble.locator('pre')
  // A linha longa não alarga a bolha nem vaza dela. (O spec § 3.3 pede rolagem
  // horizontal; o `code` do renderer tem `whitespace-pre-wrap` e a linha
  // quebra. Nota para o design QA, não é falha de segurança nem de layout.)
  const preBox = (await pre.boundingBox())!
  expect(preBox.x + preBox.width).toBeLessThanOrEqual(box.x + box.width)
  expect(
    await page.locator('main').evaluate((main) => main.scrollWidth <= main.clientWidth)
  ).toBe(true)
})

test('HTML cru e javascript: no browser real: texto, sem link ativo e sem script executado', async ({
  page
}) => {
  await open(page)
  const bubble = await send(
    page,
    '<b>oi</b> <img src=x onerror="window.__pwned=1"> [x](javascript:alert(1)) [y](JaVaScRiPt:alert(2)) <javascript:alert(3)>'
  )

  await expect(bubble.locator('a, b, img, script')).toHaveCount(0)
  await expect(bubble).toContainText('<b>oi</b>')
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
})

test('imagem em markdown na bolha do usuário não dispara requisição externa', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'tracker.invalid') external.push(request.url())
  })
  await open(page)

  const bubble = await send(page, '![pixel](https://tracker.invalid/p.png)')

  await expect(bubble.locator('img')).toHaveCount(0)
  expect(external).toEqual([])
})

test('teclado no erro do run: Tab vai de Reenviar a Detalhes técnicos e Enter reenvia na mesma sessão', async ({
  page
}) => {
  await open(page)
  await composer(page).fill('sobrecarregue uma vez')
  await composer(page).press('Enter')
  const error = page.getByRole('group', { name: 'Erro na resposta' })
  const resend = error.getByRole('button', { name: 'Reenviar' })
  const details = error.getByRole('button', { name: 'Detalhes técnicos' })
  await expect(resend).toBeVisible()

  await resend.focus()
  await page.keyboard.press('Tab')
  await expect(details).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(details).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Shift+Tab')
  await expect(resend).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.getByText('Agente Beta recebeu: sobrecarregue uma vez')).toBeVisible()
  await expect(error).toHaveCount(0)
  await expect(composer(page)).toBeFocused()
})
