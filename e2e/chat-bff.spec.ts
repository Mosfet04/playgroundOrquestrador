import { expect, test, type Page } from '@playwright/test'

import { APP_URL } from '../playwright.config'
import { hydrated } from './hydration'

// P2-03 (docs/design/P2-03.md, § 6): o chat pelo BFF, sem endpoint no browser.
// Erros do BFF simulados por `page.route` nas rotas /api/playground; o
// mapeamento do orquestrador para esses códigos está em
// tests/app/api/playgroundChat.test.ts. Sessões novas vão no Agente Beta (o
// e2e/i18n.spec.ts conta as do Agente Alfa).

const RUNS = '**/api/playground/agents/*/runs'

const open = async (
  page: Page,
  path = '/playground',
  { mobile = false } = {}
) => {
  await page.route(
    (url) => url.origin !== APP_URL,
    (route) => route.abort()
  )
  await page.goto(path)
  // Em 390 o seletor de tema (sinal de hidratação) fica no menu: o Sheet do
  // painel, que só abre hidratado, faz o papel dele.
  if (mobile) {
    await openSheet(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  } else await hydrated(page)
}

// Abre o Sheet do painel (o clique antes da hidratação se perde: repete) e
// espera o fim da animação de entrada.
async function openSheet(page: Page) {
  const trigger = page.getByRole('button', {
    name: /Abrir sessões e agente|Open sessions/
  })
  await expect(async () => {
    await trigger.click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 1000 })
  }).toPass()
  const dialog = page.getByRole('dialog')
  await expect.poll(async () => (await dialog.boundingBox())?.x).toBe(0)
  return dialog
}

const composer = (page: Page) =>
  page.getByRole('textbox', { name: /^(Mensagem para|Message to) / })
const send = async (page: Page, message: string) => {
  await composer(page).fill(message)
  await composer(page).press('Enter')
}
const pickBeta = async (page: Page) => {
  await page
    .locator('aside')
    .getByRole('combobox', { name: 'Agente: Agente Alfa' })
    .click()
  await page.getByRole('option', { name: 'Agente Beta' }).click()
  await expect(
    page.getByRole('textbox', { name: 'Mensagem para Agente Beta' })
  ).toBeEnabled()
}

test.describe('desktop 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('V-P2-03-1: painel sem Endpoint, URL nem recarregar; HTML sem localhost/porta', async ({
    page
  }) => {
    await open(page)
    const aside = page.locator('aside')
    await expect(
      aside.getByRole('combobox', { name: 'Agente: Agente Alfa' })
    ).toBeVisible()

    await expect(aside.getByText(/endpoint/i)).toHaveCount(0)
    await expect(
      aside.getByRole('button', { name: /Recarregar|endpoint/i })
    ).toHaveCount(0)
    // A lista de sessões vai até a borda inferior do painel.
    const panel = (await aside.boundingBox())!
    const list = (await aside
      .getByText('Sessões', { exact: true })
      .locator('..')
      .boundingBox())!
    expect(
      Math.abs(list.y + list.height - (panel.y + panel.height - 16))
    ).toBeLessThanOrEqual(1)
    const html = await page.content()
    // (sem o número solto: "7777" também é id de chunk do webpack)
    expect(html).not.toMatch(/localhost:\d|127\.0\.0\.1|:7790|:7777/)
  })

  test('V-P2-03-4/5: ?team= numa aba nova abre em Team, com o cartão e as sessões; sem storage, a caixa do team', async ({
    page,
    context
  }) => {
    // Cria uma sessão do team pelo próprio chat.
    await open(page, '/playground?team=time-suporte')
    const aside = page.locator('aside')
    await expect(
      aside.getByRole('button', { name: 'Team', exact: true })
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      aside.getByRole('combobox', { name: 'Team: Time Suporte' })
    ).toBeVisible()
    const message = `sessão do team ${Date.now()}`
    await send(page, message)
    await expect(
      page.getByText(`Time Suporte recebeu: ${message}`)
    ).toBeVisible()

    const fresh = await context.newPage()
    await open(fresh, '/playground?team=time-suporte')
    const freshAside = fresh.locator('aside')
    await expect(
      freshAside.getByRole('button', { name: 'Team', exact: true })
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      freshAside.getByRole('combobox', { name: 'Team: Time Suporte' })
    ).toBeVisible()
    await expect(
      freshAside.getByRole('button', { name: new RegExp(`^${message}`) })
    ).toBeVisible()

    const noStorage = await context.newPage()
    await noStorage.route('**/api/playground/teams', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.data[0].storage = false
      await route.fulfill({ response, json: body })
    })
    await open(noStorage, '/playground?team=time-suporte')
    const box = noStorage.locator('aside').getByText(/Conecte um/)
    await expect(box).toHaveText(
      'Conecte um storage ao team para ver as sessões.'
    )
    await expect(box).not.toContainText('agente')
  })

  test('V-P2-03-6: run em 503 mostra "o orquestrador não respondeu"; mensagens e composer ficam', async ({
    page
  }) => {
    await open(page)
    await pickBeta(page)
    await send(page, 'primeira')
    await expect(page.getByText('Agente Beta recebeu: primeira')).toBeVisible()

    await page.route(RUNS, (route) =>
      route.fulfill({
        status: 503,
        json: { success: false, error: 'unreachable' }
      })
    )
    await send(page, 'segunda')

    const bubble = page
      .getByRole('log')
      .getByText(
        'Algo deu errado durante a resposta. O orquestrador não respondeu. Confira se ele está no ar e envie de novo.'
      )
    await expect(bubble).toBeVisible()
    await expect(bubble).toHaveClass(/text-destructive/)
    await expect(page.getByText('Agente Beta recebeu: primeira')).toBeVisible()
    await expect(composer(page)).toBeEnabled()
    // a página não vira o estado offline
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
  })

  test('V-P2-03-7: stream cortado mantém o texto parcial e avisa a interrupção, sem cursor, "gerando" nem métricas', async ({
    page
  }) => {
    await page.route(RUNS, (route) =>
      route.fulfill({
        headers: { 'Content-Type': 'text/event-stream' },
        body: [
          {
            event: 'RunStarted',
            session_id: `corte-${Date.now()}`,
            created_at: 1
          },
          {
            event: 'RunContent',
            content: 'Texto parcial da resposta',
            created_at: 1
          }
        ]
          .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`)
          .join('')
      })
    )
    await open(page)
    await pickBeta(page)
    await send(page, 'corte')

    const log = page.getByRole('log')
    await expect(log.getByText('Texto parcial da resposta')).toBeVisible()
    await expect(
      log.getByText(
        'Algo deu errado durante a resposta. A resposta foi interrompida antes do fim.'
      )
    ).toBeVisible()
    await expect(page.locator('.stream-caret')).toHaveCount(0)
    await expect(page.getByText('gerando', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/tokens/)).toHaveCount(0)
    await expect(log).not.toHaveAttribute('aria-busy')
    await expect(
      page.getByText('A resposta de Agente Beta falhou')
    ).toBeAttached()
  })

  test('V-P2-03-8: sessão expirada no envio leva ao login e volta à mesma conversa', async ({
    page,
    context
  }) => {
    await open(page)
    await pickBeta(page)
    const first = `antes de expirar ${Date.now()}`
    await send(page, first)
    await expect(page.getByText(`Agente Beta recebeu: ${first}`)).toBeVisible()
    await expect(page).toHaveURL(/[?&]session=/)
    const chatUrl = new URL(page.url())
    const cookies = await context.cookies()

    await context.clearCookies()
    await send(page, 'depois de expirar')

    await expect(page).toHaveURL(/\/login\?/)
    const loginUrl = new URL(page.url())
    expect(loginUrl.searchParams.get('reason')).toBe('expired')
    expect(loginUrl.searchParams.get('next')).toBe(
      `${chatUrl.pathname}${chatUrl.search}`
    )
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      'Sua sessão expirou.'
    )

    // "Entrar" sem a tela (o limite de logins por IP é da suíte): com a sessão
    // de volta, o /login segue o `next`, como depois do login.
    await context.addCookies(cookies)
    await page.goto(loginUrl.toString())
    await expect(page).toHaveURL(chatUrl.toString())
    await expect(page.getByText(`Agente Beta recebeu: ${first}`)).toBeVisible()
  })

  test('V-P2-03-9 (1440): composer de 48 px; textareas dos formulários seguem com 40 px', async ({
    page
  }) => {
    await open(page)
    await expect(composer(page)).toBeEnabled()
    expect(Math.round((await composer(page).boundingBox())!.height)).toBe(48)

    await page.route(/\/api\/tools(\?.*)?$/, (route) =>
      route.fulfill({
        json: {
          success: true,
          data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }
        }
      })
    )
    for (const path of ['/agents/new', '/tools/new']) {
      await page.goto(path)
      const areas = page.locator('main textarea')
      await expect(areas.first()).toBeVisible()
      for (const box of await areas.all())
        expect(Math.round((await box.boundingBox())!.height), path).toBe(40)
    }
  })
})

test.describe('celular 390', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  })

  test('V-P2-03-9 (390): composer vazio de 32 px que cresce até 96 px', async ({
    page
  }) => {
    await open(page, '/playground', { mobile: true })
    const box = composer(page)
    await expect(box).toBeEnabled()
    const empty = (await box.boundingBox())!.height
    expect(empty).toBeGreaterThanOrEqual(32)
    expect(empty).toBeLessThanOrEqual(33)

    await box.fill('linha 1\nlinha 2')
    await expect
      .poll(async () => (await box.boundingBox())!.height)
      .toBeGreaterThan(empty)
    await box.fill(
      Array.from({ length: 10 }, (_, i) => `linha ${i}`).join('\n')
    )
    await expect
      .poll(async () => Math.round((await box.boundingBox())!.height))
      .toBe(96)
  })

  test('V-P2-03-1/10: Sheet sem Endpoint; lixeira 44×44 visível sem hover, com anel no Tab, abre a confirmação', async ({
    page
  }) => {
    await open(page, '/playground', { mobile: true })
    const title = `lixeira ${Date.now()}`
    const sheet = await openSheet(page)
    await sheet.getByRole('combobox', { name: 'Agente: Agente Alfa' }).click()
    await page.getByRole('option', { name: 'Agente Beta' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await send(page, title)
    await expect(page.getByText(`Agente Beta recebeu: ${title}`)).toBeVisible()

    const panel = await openSheet(page)
    await expect(panel.getByText(/endpoint/i)).toHaveCount(0)
    const row = panel.getByRole('button', { name: new RegExp(`^${title}`) })
    const trash = panel.getByRole('button', {
      name: `Excluir sessão "${title}"`
    })
    await expect(row).toBeVisible()
    await expect(trash).toBeVisible()
    expect(await trash.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
    const box = (await trash.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
    // o horário segue visível ao lado
    await expect(row.getByText(/^\d{2}:\d{2}$/)).toBeVisible()

    await row.focus()
    await page.keyboard.press('Tab')
    await expect(trash).toBeFocused()
    expect(
      await trash.evaluate((el) => getComputedStyle(el).boxShadow)
    ).not.toBe('none')

    await trash.tap()
    await expect(
      page.getByRole('dialog', { name: 'Excluir sessão' })
    ).toBeVisible()
  })

  test('V-P2-03-11: EN em 390, orquestrador fora e stream cortado, sem corte nem rolagem horizontal', async ({
    page,
    context
  }) => {
    await context.addCookies([{ name: 'locale', value: 'en', url: APP_URL }])
    let down = true
    await page.route('**/api/playground/agents', (route) =>
      down
        ? route.fulfill({
            status: 503,
            json: { success: false, error: 'unreachable' }
          })
        : route.continue()
    )
    await page.route(RUNS, (route) =>
      route.fulfill({
        headers: { 'Content-Type': 'text/event-stream' },
        body: `event: RunContent\ndata: ${JSON.stringify({ event: 'RunContent', content: 'Partial', created_at: 1 })}\n\n`
      })
    )
    await page.route(
      (url) => url.origin !== APP_URL,
      (route) => route.abort()
    )
    await page.goto('/playground')
    const sheet = await openSheet(page)
    const off = sheet.getByText(
      "Orchestrator disconnected. History shows up once it's back."
    )
    await expect(off).toBeVisible()
    const sheetBox = (await sheet.boundingBox())!
    const offBox = (await off.boundingBox())!
    expect(offBox.x + offBox.width).toBeLessThanOrEqual(
      sheetBox.x + sheetBox.width
    )
    await page.keyboard.press('Escape')

    down = false
    await page
      .getByRole('main')
      .getByRole('alert')
      .getByRole('button', { name: 'Try again' })
      .click()
    await expect(composer(page)).toBeEnabled()
    await send(page, 'cut')
    await expect(
      page.getByText('The response was cut off before it finished.', {
        exact: false
      })
    ).toBeVisible()
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
