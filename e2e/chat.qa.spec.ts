import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import { APP_URL } from '../playwright.config'
import { hydrated } from './hydration'

// QA P1-06 (docs/design/P1-06.md, § 8): o chat no browser. Complementa
// e2e/chat.spec.ts (fluxo e stream) e os testes de componente do dev
// (tests/components/PlaygroundChat.test.tsx, PlaygroundSidebar.test.tsx).
// Foco: geometria real, foco/Tab, reduced-motion, 390 px, Sheet, EN, team e
// entrada hostil.
//
// "segure até liberar" retém o stream no fake. O POST /hold/release solta por
// agente (`?agent=`; e2e/i18n.spec.ts solta só o Agente Alfa); estes testes não
// o chamam: o stream retido morre com a página. As sessões do fake são globais e por agente: os testes que
// enviam "segure até liberar" usam o Agente Beta, para a sessão não aparecer
// na lista do Agente Alfa que o e2e/i18n.spec.ts conta.

const HOLD = 'segure até liberar'

const open = async (page: Page, { path = '/playground', mobile = false } = {}) => {
  // P2-03: só o app (o chat vai pelo BFF).
  await page.route(
    (url) => url.origin !== APP_URL,
    (route) => route.abort()
  )
  await page.goto(path)
  // Em 390 o painel está no Sheet (o seletor de tema fica no menu): o clique
  // que se perde antes da hidratação é repetido até o diálogo abrir.
  if (mobile) {
    const trigger = page.getByRole('button', { name: /Abrir sessões e agente|Open sessions/ })
    await expect(async () => {
      await trigger.click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 1000 })
    }).toPass()
    await page.keyboard.press('Escape')
  } else await hydrated(page)
}

const pickBeta = async (page: Page) => {
  await page.locator('aside').getByRole('combobox', { name: 'Agente: Agente Alfa' }).click()
  await page.getByRole('option', { name: 'Agente Beta' }).click()
  await expect(page.getByRole('textbox', { name: 'Mensagem para Agente Beta' })).toBeEnabled()
}

const composer = (page: Page) => page.getByRole('textbox', { name: /^(Mensagem para|Message to) / })
const send = async (page: Page, message: string) => {
  await composer(page).fill(message)
  await composer(page).press('Enter')
}
const setLocale = (context: BrowserContext, value: 'pt-BR' | 'en') =>
  context.addCookies([{ name: 'locale', value, url: APP_URL }])

test.describe('desktop 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('V-P1-06-1: painel de 288 px com a ordem aprovada; sem "Agent UI", "Modo" nem a caixa de modelo', async ({
    page
  }) => {
    await open(page)
    const aside = page.locator('aside')
    await expect(aside.getByRole('combobox', { name: 'Agente: Agente Alfa' })).toBeVisible()

    expect((await aside.boundingBox())?.width).toBe(288)
    const ys = await Promise.all(
      [
        aside.getByText('Conversar com', { exact: true }),
        aside.getByRole('group', { name: 'Conversar com' }),
        aside.getByRole('combobox', { name: 'Agente: Agente Alfa' }),
        aside.getByRole('button', { name: 'Nova conversa' }),
        aside.getByText('Sessões', { exact: true })
      ].map(async (locator) => (await locator.boundingBox())!.y)
    )
    // rótulo <= segmentado < cartão < nova conversa < sessões (sem Endpoint, P2-03)
    expect(ys[0]).toBeLessThanOrEqual(ys[1])
    expect(ys.slice(1)).toEqual([...ys.slice(1)].sort((a, b) => a - b))
    expect(new Set(ys.slice(1)).size).toBe(4)
    await expect(aside.getByText('Endpoint', { exact: true })).toHaveCount(0)

    await expect(aside.getByText('Agent UI')).toHaveCount(0)
    await expect(aside.getByText('Modo', { exact: true })).toHaveCount(0)
    // provider/modelo no cartão
    await expect(aside.getByRole('combobox', { name: 'Agente: Agente Alfa' })).toContainText(
      'Fake/fake-model'
    )
    // sem alvo "Nova conversa" habilitado antes de haver mensagens
    await expect(aside.getByRole('button', { name: 'Nova conversa' })).toBeDisabled()
  })

  test('V-P1-06-3: recolher deixa trilho de 48 px; Tab não entra no conteúdo escondido; o foco fica no botão', async ({
    page
  }) => {
    await open(page)
    const aside = page.locator('aside')
    await expect(composer(page)).toBeEnabled()

    await aside.getByRole('button', { name: 'Recolher painel de sessões' }).click()
    const expand = aside.getByRole('button', { name: 'Expandir painel de sessões' })
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    await expect(expand).toBeFocused()
    expect((await aside.boundingBox())?.width).toBe(48)

    // Nenhuma parada de Tab cai dentro do painel além do próprio botão.
    const insideAside: boolean[] = []
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      insideAside.push(
        await page.evaluate(() => !!document.activeElement?.closest('aside'))
      )
    }
    expect(insideAside.filter(Boolean).length).toBeLessThanOrEqual(1)
    await expect(aside.getByRole('button', { name: 'Nova conversa' })).toBeHidden()

    await expand.focus()
    await page.keyboard.press('Enter')
    await expect(aside.getByRole('button', { name: 'Recolher painel de sessões' })).toBeFocused()
    expect((await aside.boundingBox())?.width).toBe(288)
  })

  test('V-P1-06-4/5/8: conversa, bolhas, chips, métricas e composer de 48 px com foco visível', async ({
    page
  }) => {
    await open(page)
    await expect(composer(page)).toBeEnabled()
    await expect(page.getByText('Enter envia · Shift+Enter quebra linha')).toBeVisible()
    await expect(page.getByText('para', { exact: true })).toBeVisible()
    expect((await composer(page).boundingBox())!.height).toBeGreaterThanOrEqual(48)

    await composer(page).focus()
    const card = composer(page).locator('xpath=..')
    const [boxShadow, borderColor] = await card.evaluate((el) => {
      const style = getComputedStyle(el)
      return [style.boxShadow, style.borderColor]
    })
    expect(boxShadow).not.toBe('none')
    const primary = await page.evaluate(() => {
      const probe = document.createElement('i')
      probe.style.color = 'hsl(var(--primary))'
      document.body.append(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return color
    })
    expect(borderColor).toBe(primary)

    await send(page, 'Olá')
    const log = page.getByRole('log')
    await expect(page.getByText('1,4 s · 812 tokens')).toBeVisible()
    // bolha do usuário à direita da coluna central, resposta com nome e modelo
    const user = await log.getByText('Olá', { exact: true }).boundingBox()
    const reply = await log.getByText('Agente Alfa recebeu: Olá').boundingBox()
    expect(user!.x).toBeGreaterThan(reply!.x)
    // coluna central de até 768 px; a bolha do usuário encosta na borda direita
    const column = (await log.boundingBox())!
    expect(column.width).toBeLessThanOrEqual(768)
    expect(Math.abs(user!.x + user!.width - (column.x + column.width))).toBeLessThanOrEqual(1)
    expect(reply!.x).toBeLessThan(column.x + 60) // avatar de 28 + gap, à esquerda
    await expect(log.getByText('fake-model', { exact: true })).toBeVisible()
    // texto da resposta (markdown) em 16/24, sem espaçamento de letras
    const replyText = await log.getByText('Agente Alfa recebeu: Olá').evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing
      }
    })
    expect(replyText).toEqual({ fontSize: '16px', lineHeight: '24px', letterSpacing: 'normal' })
    // 2 chips: ok e erro; erro sem tempo
    const chips = log.getByRole('list', { name: 'Chamadas de tool' }).getByRole('listitem')
    await expect(chips.nth(1)).not.toContainText(' s')
    await expect(chips.nth(1)).toHaveAttribute('title', 'Tool falhou')
    await expect(chips.nth(0)).toHaveAttribute('title', 'Tool concluída em 0,18 s')
    // métricas só uma vez, depois do fim; nada de "gerando"
    await expect(page.getByText('gerando', { exact: true })).toHaveCount(0)
    await expect(page.getByText('executando')).toHaveCount(0)
  })

  test('V-P1-06-6/9/16: stream retido, chip "executando", Enviar com o motivo e anúncio; textarea segue editável', async ({
    page
  }) => {
    await open(page)
    await expect(composer(page)).toBeEnabled()
    await pickBeta(page)
    await send(page, HOLD)

    const log = page.getByRole('log')
    await expect(log).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByRole('status')).toHaveText('Agente Beta está respondendo…')
    const tools = log.getByRole('list', { name: 'Chamadas de tool' })
    await expect(tools.getByRole('listitem').nth(1)).toContainText('abrir_troca')
    await expect(tools.getByRole('listitem').nth(1)).toContainText('executando')
    await expect(tools.getByRole('listitem').nth(0)).toContainText('0,18 s')
    await expect(page.getByText('gerando', { exact: true })).toBeVisible()
    await expect(page.locator('.stream-caret')).toHaveCount(1)
    await expect(page.getByText('tokens')).toHaveCount(0)

    // Enviar: desabilitado, com o motivo; o textarea segue editável.
    await composer(page).fill('próxima')
    await expect(
      page.getByRole('button', { name: 'Enviar mensagem (aguarde a resposta terminar)' })
    ).toBeDisabled()
    // Enter durante o stream não envia (o textarea só ganha a quebra de linha).
    await composer(page).press('Enter')
    await expect(composer(page)).toHaveValue(/^próxima/)
    await expect(log.getByText('próxima')).toHaveCount(0)
  })

  test('V-P1-06-7: reduced-motion para cursor, "gerando" e "executando"', async ({
    page
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page)
    await expect(composer(page)).toBeEnabled()
    await pickBeta(page)
    await send(page, HOLD)
    await expect(page.getByText('executando')).toBeVisible()

    const animations = await page.evaluate(() => {
      const names = (selector: string, pseudo?: string) =>
        [...document.querySelectorAll(selector)].map(
          (el) => getComputedStyle(el, pseudo).animationName
        )
      const caret = document.querySelector('.stream-caret')
      return {
        liveDots: names('.live-dot'),
        caret: caret?.lastElementChild
          ? getComputedStyle(caret.lastElementChild, '::after').animationName
          : null
      }
    })
    expect(animations.liveDots.length).toBeGreaterThanOrEqual(2) // gerando + executando
    expect(animations.liveDots.every((name) => name === 'none')).toBe(true)
    expect(animations.caret).toBe('none')
  })

  // P2-03: sem o ponto do Endpoint; o "Conectando…" fica até a carga pelo
  // BFF terminar, e a falha termina no bloco offline com o composer travado.
  test('V-P1-06-10: Conectando… até a carga terminar; offline termina no bloco de erro', async ({
    page
  }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/playground/agents', async (route) => {
      await gate
      await route.fulfill({ status: 503, json: { success: false, error: 'unreachable' } })
    })
    await open(page)

    await expect(page.getByText('Conectando ao orquestrador…')).toBeVisible()
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
    release()
    const alert = page.getByRole('alert').filter({ hasText: 'Não foi possível conectar ao orquestrador' })
    await expect(alert.getByText('offline')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Enviar mensagem (orquestrador desconectado)' })
    ).toBeDisabled()
    await expect(page.getByText('para', { exact: true })).toHaveCount(0)
  })

  test('V-P1-06-14: conversa vazia com as iniciais do agente', async ({ page }) => {
    await open(page)
    await expect(page.getByRole('log').getByText('AA', { exact: true })).toBeVisible()
  })

  test('V-P1-06-4 (team): cartão, composer e avatar mostram o team', async ({
    page
  }) => {
    // O team vem do fake (P2-03), pelo BFF.
    await open(page)
    const aside = page.locator('aside')
    await expect(composer(page)).toBeEnabled()
    await aside.getByRole('button', { name: 'Team', exact: true }).click()
    await expect(aside.getByRole('button', { name: 'Team', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(aside.getByRole('button', { name: 'Agente', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    await expect(aside.getByRole('combobox', { name: 'Team: Time Suporte' })).toContainText(
      'Fake/fake-model'
    )
    await expect(
      page.getByRole('textbox', { name: 'Mensagem para Time Suporte' })
    ).toBeEnabled()
    await expect(page.getByRole('log').getByText('TS', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/team=time-suporte/)
  })

  test('entrada hostil: nome com HTML e mensagem com <script> viram texto, sem executar', async ({
    page
  }) => {
    await page.route('**/api/playground/agents', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.data[0].label = '<img src=x onerror="window.__pwned=1"> Alfa'
      await route.fulfill({ response, json: body })
    })
    await open(page)
    await expect(composer(page)).toBeEnabled()
    await send(page, '<script>window.__pwned=2</script><b>negrito</b>')

    await expect(page.getByText('1,4 s · 812 tokens')).toBeVisible()
    await expect(
      page.getByRole('log').getByText('<script>window.__pwned=2</script><b>negrito</b>', {
        exact: true
      })
    ).toBeVisible()
    await expect(page.locator('main img[src="x"], aside img[src="x"], main script')).toHaveCount(0)
    // O <b> da resposta do agente é do markdown (rehype-raw + sanitize
    // padrão): P2-04. A bolha do usuário e o resto do chat não interpretam.
    // Aqui só se confere que o negrito herda 16/24 do bloco.
    const bold = await page.getByRole('log').locator('b').evaluate((el) => {
      const style = getComputedStyle(el)
      return { fontSize: style.fontSize, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing }
    })
    expect(bold).toEqual({ fontSize: '16px', lineHeight: '24px', letterSpacing: 'normal' })
    await expect(page.getByRole('log').locator('script, img')).toHaveCount(0)
    expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined()
    await expect(
      page.locator('aside').getByRole('combobox', { name: /^Agente: <img/ })
    ).toBeVisible()
  })

  test('EN: métricas "1.4 s · 812 tokens", chips "done"/"error" e Enviar em inglês', async ({
    page,
    context
  }) => {
    await setLocale(context, 'en')
    await open(page)
    await expect(composer(page)).toBeEnabled()
    await expect(page.getByRole('textbox', { name: 'Message to Agente Alfa' })).toBeVisible()
    await expect(page.getByText('Enter sends · Shift+Enter adds a line')).toBeVisible()
    await send(page, 'Hello')

    await expect(page.getByText('1.4 s · 812 tokens')).toBeVisible()
    const chips = page.getByRole('list', { name: 'Tool calls' }).getByRole('listitem')
    await expect(chips).toHaveText(['consultar_pedido0.18 sdone', 'abrir_trocaerror'])
    await expect(chips.nth(0)).toHaveAttribute('title', 'Tool finished in 0.18 s')
  })
})

test.describe('celular 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  const noHorizontalScroll = (page: Page) =>
    page.evaluate(
      () =>
        document.documentElement.scrollWidth <= window.innerWidth &&
        document.body.scrollWidth <= window.innerWidth
    )

  test('V-P1-06-12: Enviar 44x44 só ícone, sem dica, nome sem modelo, subtítulo id · modelo e sem rolagem horizontal', async ({
    page
  }) => {
    await open(page, { mobile: true })
    await expect(composer(page)).toBeEnabled()
    await expect(page.getByText('Enter envia · Shift+Enter quebra linha')).toBeHidden()
    await expect(page.getByText('agente-alfa · fake-model')).toBeVisible()

    await send(page, 'Olá')
    await expect(page.getByText('1,4 s · 812 tokens')).toBeVisible()
    const sendButton = page.getByRole('button', { name: 'Enviar mensagem (escreva uma mensagem)' })
    const box = (await sendButton.boundingBox())!
    expect(Math.round(box.width)).toBe(44)
    expect(Math.round(box.height)).toBe(44)
    await expect(sendButton.getByText('Enviar', { exact: true })).toBeHidden()
    // modelo some abaixo de md na bolha (fica só no subtítulo do cabeçalho)
    await expect(page.getByRole('log').getByText('fake-model')).toBeHidden()
    expect(await noHorizontalScroll(page)).toBe(true)
  })

  test('V-P1-06-12: palavra gigante do usuário e da resposta não gera rolagem horizontal', async ({
    page
  }) => {
    await open(page, { mobile: true })
    await expect(composer(page)).toBeEnabled()
    await send(page, 'x'.repeat(400))

    await expect(page.getByText('1,4 s · 812 tokens')).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)
  })

  test('V-P1-06-12: nome de agente enorme sem espaços não gera rolagem horizontal', async ({
    page
  }) => {
    await page.route('**/api/playground/agents', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.data[0].label = 'N'.repeat(200)
      await route.fulfill({ response, json: body })
    })
    await open(page, { mobile: true })
    await expect(page.getByRole('textbox', { name: /^Mensagem para N+/ })).toBeEnabled()
    expect(await noHorizontalScroll(page)).toBe(true)
  })

  test('V-P1-06-13: Sheet com respiro de 16 px, "Fechar" ao lado de "Conversar com", alvos de 44 px; Esc devolve o foco', async ({
    page
  }) => {
    await open(page, { mobile: true })
    const trigger = page.getByRole('button', { name: 'Abrir sessões e agente' })
    await trigger.click()

    const dialog = page.getByRole('dialog')
    await expect.poll(async () => (await dialog.boundingBox())!.x).toBe(0) // fim da animação
    const dialogBox = (await dialog.boundingBox())!
    expect(Math.round(dialogBox.width)).toBe(320)
    const label = (await dialog.getByText('Conversar com', { exact: true }).boundingBox())!
    expect(label.x - dialogBox.x).toBeGreaterThanOrEqual(16)
    const close = dialog.getByRole('button', { name: 'Fechar', exact: true })
    const closeBox = (await close.boundingBox())!
    expect(closeBox.width).toBeGreaterThanOrEqual(44)
    expect(closeBox.height).toBeGreaterThanOrEqual(44)
    // mesma linha: o centro vertical do rótulo cai dentro do botão
    expect(label.y + label.height / 2).toBeGreaterThan(closeBox.y)
    expect(label.y + label.height / 2).toBeLessThan(closeBox.y + closeBox.height)
    // o Sheet não tem o botão de recolher
    await expect(dialog.getByRole('button', { name: 'Recolher painel de sessões' })).toHaveCount(0)

    // foco preso: Tab várias vezes nunca sai do diálogo
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
        true
      )
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('V-P1-06-15: EN a 390 não corta nem rola na horizontal', async ({ page, context }) => {
    await setLocale(context, 'en')
    await open(page, { mobile: true })
    await expect(composer(page)).toBeEnabled()
    await send(page, 'Hello')
    await expect(page.getByText('1.4 s · 812 tokens')).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)

    await page.getByRole('button', { name: /Open sessions/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Chat with', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'New chat' })).toBeVisible()
    // Nada passa da borda do Sheet nem fica com o texto cortado. (O "Fechar"
    // usa margem negativa de propósito, por isso não se olha o scrollWidth da
    // linha, só o retângulo dos controles.)
    await expect.poll(async () => (await dialog.boundingBox())!.x).toBe(0) // fim da animação
    const sheet = (await dialog.boundingBox())!
    const controls = [
      dialog.getByText('Chat with', { exact: true }),
      dialog.getByRole('button', { name: 'Agent', exact: true }),
      dialog.getByRole('button', { name: 'Team', exact: true }),
      dialog.getByRole('button', { name: 'New chat' }),
      dialog.getByRole('button', { name: 'Close', exact: true })
    ]
    for (const control of controls) {
      const box = (await control.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(sheet.x)
      expect(box.x + box.width).toBeLessThanOrEqual(sheet.x + sheet.width)
      expect(await control.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
  })
})
