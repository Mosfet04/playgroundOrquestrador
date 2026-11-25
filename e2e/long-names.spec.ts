import { expect, test, type Locator, type Page } from '@playwright/test'

import { hydrated } from './hydration'

// QA1-04: com nome de agent/team de 110 caracteres, nada vaza do contêiner, o
// nome completo fica no `title` e a página não ganha rolagem horizontal. O
// teste mede bounding boxes (a classe não conta como prova). Os dados vêm de
// page.route: o nome longo não entra no seed do fake nem muda as contagens dos
// outros specs.

const LONG = 'Assistente de relacionamento com o cliente para pedidos, trocas, devoluções e reembolsos em todos os canais'
const LONG_MODEL = 'modelo-com-nome-muito-comprido-para-testar-o-corte-do-texto-na-tela'
const LONG_PARAM = 'parametro_longo_'.repeat(3).slice(0, 40)
const LONG_ENTITY = { id: 'entidade-longa', label: LONG }
const SHORT_ENTITY = { id: 'entidade-curta', label: 'Agente Curto' }

const VIEWPORTS = [
  { name: 'desktop', size: { width: 1367, height: 889 } },
  { name: 'mobile', size: { width: 390, height: 844 } }
] as const
const SCHEMES = ['light', 'dark'] as const

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox()
  if (!rect) throw new Error('elemento sem bounding box')
  return { ...rect, right: rect.x + rect.width, bottom: rect.y + rect.height }
}

// O Sheet e o dropdown entram com animação: mede-se só depois que ela termina.
const settled = (locator: Locator) =>
  locator.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((a) => a.finished)))

// O `title` só aparece no hover se o elemento que recebe o mouse o tem (ou tem um
// ancestral com ele): mede-se o hit-test no centro, não o atributo.
const hoverTitle = async (locator: Locator) => {
  await locator.scrollIntoViewIfNeeded()
  return locator.evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect()
    return document.elementFromPoint(x + width / 2, y + height / 2)?.closest('[title]')?.getAttribute('title') ?? null
  })
}

// Texto cortado: o conteúdo é mais largo que a caixa.
const isClipped = (locator: Locator) =>
  locator.evaluate((element) => element.scrollWidth > element.clientWidth)

// V11: nem o documento nem o `main` ganham rolagem horizontal.
async function expectNoPageScroll(page: Page) {
  const metrics = await page.evaluate(() => {
    const main = document.querySelector('main#conteudo')
    return {
      documentWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      mainScroll: main?.scrollWidth ?? 0,
      mainClient: main?.clientWidth ?? 0
    }
  })
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.innerWidth)
  expect(metrics.mainScroll).toBeLessThanOrEqual(metrics.mainClient)
}

const playgroundEntity = (entity: { id: string; label: string }) => ({
  value: entity.id,
  label: entity.label,
  model: { provider: 'ollama', model: LONG_MODEL },
  storage: true
})

async function mockPlaygroundEntities(page: Page) {
  const entities = [LONG_ENTITY, SHORT_ENTITY].map(playgroundEntity)
  await page.route(/\/api\/playground\/(agents|teams)$/, (route) =>
    route.fulfill({ json: { success: true, data: entities } })
  )
}

const agentConfig = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  model: 'llama3.2',
  factoryIaModel: 'ollama',
  descricao: '',
  prompt: '',
  active: true,
  tools_ids: [],
  version: 1,
  ...extra
})

const entityTrigger = (page: Page, label: string) =>
  page.getByRole('combobox', { name: new RegExp(`^(Agente|Team): ${label}$`) })

for (const { name, size } of VIEWPORTS) {
  for (const colorScheme of SCHEMES) {
    test.describe(`nomes longos em ${name} (${size.width}x${size.height}), tema ${colorScheme}`, () => {
      test.use({ viewport: size, colorScheme })
      const isDesktop = name === 'desktop'

      test('playground: composer, estado vazio, seletor e dropdown (V1-V4, V8)', async ({ page }) => {
        await mockPlaygroundEntities(page)
        const composer = (label: string) => page.getByRole('textbox', { name: `Mensagem para ${label}` })

        // O seletor de tema fica escondido no cabeçalho do celular: o composer habilitado é o sinal de página pronta.
        await page.goto(`/playground?agent=${SHORT_ENTITY.id}`)
        await expect(composer(SHORT_ENTITY.label)).toBeEnabled()
        const shortHeight = (await box(composer(SHORT_ENTITY.label))).height

        await page.goto(`/playground?agent=${LONG_ENTITY.id}`)
        const textarea = composer(LONG)
        await expect(textarea).toBeEnabled()

        // V4: placeholder numa linha, curto, sem crescer a textarea nem cobrir o chip.
        const placeholder = await textarea.getAttribute('placeholder')
        expect(placeholder?.length).toBeLessThanOrEqual(40)
        const lines = await textarea.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }))
        expect(lines.scroll).toBeLessThanOrEqual(lines.client)
        const textareaBox = await box(textarea)
        expect(Math.abs(textareaBox.height - shortHeight)).toBeLessThanOrEqual(1)
        const chipBox = await box(page.getByText(/^para entidade-longa$/))
        expect(chipBox.y).toBeGreaterThanOrEqual(textareaBox.bottom)

        // V8: título do estado vazio dentro do contêiner, com margem de 24 px.
        const title = page.getByRole('heading', { level: 2, name: `Converse com ${LONG}` })
        await expect(title).toHaveAttribute('title', LONG)
        const titleBox = await box(title)
        const holderBox = await box(title.locator('xpath=..'))
        expect(titleBox.x).toBeGreaterThanOrEqual(holderBox.x + 24)
        expect(titleBox.right).toBeLessThanOrEqual(holderBox.right - 24)
        await expectNoPageScroll(page)

        if (!isDesktop) {
          await page.getByRole('button', { name: 'Abrir sessões e agente' }).click()
          await settled(page.getByRole('dialog'))
        }

        // V1 e V2: o nome termina em reticências antes do chevron, dentro do trigger.
        const trigger = entityTrigger(page, LONG)
        const triggerBox = await box(trigger)
        const nameText = trigger.getByText(LONG, { exact: true })
        const modelText = trigger.getByText(`ollama/${LONG_MODEL}`, { exact: true })
        const chevronBox = await box(trigger.locator('svg'))
        const nameBox = await box(nameText)
        expect(nameBox.x).toBeGreaterThanOrEqual(triggerBox.x + 12)
        expect(nameBox.right).toBeLessThanOrEqual(chevronBox.x)
        expect(chevronBox.right).toBeLessThanOrEqual(triggerBox.right)
        expect(chevronBox.width).toBeGreaterThanOrEqual(16)
        expect(await isClipped(nameText)).toBe(true)
        expect(await hoverTitle(nameText)).toBe(LONG)
        expect(await hoverTitle(modelText)).toBe(`ollama/${LONG_MODEL}`)
        expect(await isClipped(modelText)).toBe(true)
        expect((await box(modelText)).right).toBeLessThanOrEqual(chevronBox.x)

        // V3: dropdown nunca mais largo que o trigger nem que a viewport; itens truncados.
        await trigger.click()
        const listbox = page.getByRole('listbox')
        await settled(listbox)
        const listBox = await box(listbox)
        expect(listBox.width).toBeLessThanOrEqual(triggerBox.width + 1)
        expect(listBox.right).toBeLessThanOrEqual(size.width - 16)
        const longItem = listbox.getByRole('option').filter({ hasText: LONG })
        const shortItem = listbox.getByRole('option').filter({ hasText: SHORT_ENTITY.label })
        expect(await isClipped(longItem.getByText(LONG, { exact: true }))).toBe(true)
        expect(Math.abs((await box(longItem)).height - (await box(shortItem)).height)).toBeLessThanOrEqual(1)
        await page.keyboard.press('Escape')
      })

      test('agents: tabela com colunas fixas e nome truncado (V5, V6)', async ({ page }) => {
        const shortRows = [agentConfig('curto', 'Agente Curto'), agentConfig('outro', 'Outro Agente')]
        let rows = shortRows
        await page.route(/\/api\/agents(\?.*)?$/, (route) =>
          route.fulfill({
            json: { success: true, data: { data: rows, total: rows.length, page: 1, limit: 100, totalPages: 1 } }
          })
        )
        const columnWidths = () => page.locator('th').evaluateAll((cells) => cells.map((th) => th.getBoundingClientRect().width))
        const openList = async () => {
          await page.goto('/agents')
          await hydrated(page)
          await expect(page.getByRole('link', { name: 'Agente Curto' })).toBeVisible()
        }

        await openList()
        const before = isDesktop ? await columnWidths() : []
        rows = [...shortRows, agentConfig('longo', LONG, { model: LONG_MODEL })]
        await openList()

        const link = page.getByRole('link', { name: LONG })
        await expect(link).toHaveAttribute('title', LONG)
        expect(await isClipped(link)).toBe(true)
        if (isDesktop) {
          // V5: colunas com a mesma largura com nome curto e longo.
          expect(await page.getByRole('table').evaluate((table) => getComputedStyle(table).tableLayout)).toBe('fixed')
          const after = await columnWidths()
          expect(after).toHaveLength(before.length)
          after.forEach((width, index) => expect(Math.abs(width - before[index])).toBeLessThanOrEqual(1))
          // O chip do modelo fica na coluna Modelo.
          const modelHead = await box(page.getByRole('columnheader', { name: 'Modelo' }))
          const chip = page.getByText(`ollama/${LONG_MODEL}`, { exact: true })
          expect((await box(chip)).right).toBeLessThanOrEqual(modelHead.right)
        } else {
          const itemBox = await box(link.locator('xpath=ancestor::li'))
          expect((await box(link)).right).toBeLessThanOrEqual(itemBox.right)
        }
        await expectNoPageScroll(page)
      })

      test('team: título do cabeçalho e cards de membros (V6, V7)', async ({ page }) => {
        const members = [
          agentConfig('curto', 'Agente Curto'),
          agentConfig('longo', LONG, { descricao: 'Atende pedidos, trocas e devoluções em todos os canais da loja.' }),
          agentConfig('longo-inativo', `${LONG} (inativo)`, { active: false }),
          agentConfig('curto-inativo', 'Inativo Curto', {
            active: false,
            descricao: 'Descrição curta de uma linha.'
          }),
          agentConfig('terceiro', 'Terceiro')
        ]
        await page.route(/\/api\/agents(\?.*)?$/, (route) =>
          route.fulfill({
            json: { success: true, data: { data: members, total: members.length, page: 1, limit: 100, totalPages: 1 } }
          })
        )
        await page.route(/\/api\/teams\/time-longo$/, (route) =>
          route.fulfill({
            json: {
              success: true,
              data: {
                id: 'time-longo',
                nome: LONG,
                descricao: '',
                prompt: '',
                active: true,
                member_ids: ['longo'],
                mode: 'route',
                factoryIaModel: 'ollama',
                model: 'llama3.2',
                version: 1
              }
            }
          })
        )
        await page.goto('/teams/time-longo')
        await hydrated(page)
        await expect(page.getByRole('group', { name: 'Agents do team' })).toBeVisible()

        // V6: o último item da trilha (ou o título do cabeçalho no celular) fica dentro do cabeçalho de 56 px.
        const header = page.getByRole('banner')
        expect((await box(header)).height).toBe(56)
        if (isDesktop) {
          const nav = page.getByRole('navigation', { name: 'Você está em' })
          const current = nav.locator('[aria-current="page"]')
          await expect(current).toHaveAttribute('title', LONG)
          expect((await box(current)).right).toBeLessThanOrEqual((await box(nav)).right)
        } else {
          const heading = header.getByText(LONG, { exact: true }).locator('visible=true')
          await expect(heading).toHaveAttribute('title', LONG)
          expect((await box(heading)).right).toBeLessThanOrEqual((await box(heading.locator('xpath=..'))).right)
          expect(await isClipped(heading)).toBe(true)
        }

        // V7: cards da mesma linha com a mesma altura, nome em 14 px, badge dentro do card.
        const cards = page.getByRole('group', { name: 'Agents do team' }).locator('li > div')
        const rects = await Promise.all(
          (await cards.all()).map(async (card) => box(card))
        )
        expect(rects).toHaveLength(members.length)
        const rowTops = new Set(rects.map((rect) => Math.round(rect.y)))
        for (const top of rowTops) {
          const row = rects.filter((rect) => Math.round(rect.y) === top)
          row.forEach((rect) => expect(Math.abs(rect.height - row[0].height)).toBeLessThanOrEqual(1))
        }
        if (isDesktop) expect(rowTops.size).toBeLessThan(members.length)

        const sizeOf = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).fontSize)
        const longName = cards.getByText(LONG, { exact: true })
        expect(await sizeOf(longName)).toBe('14px')
        expect(await sizeOf(cards.getByText('Agente Curto', { exact: true }))).toBe('14px')
        expect(await hoverTitle(longName)).toBe(LONG)
        expect(await isClipped(longName)).toBe(true)

        const inactiveCard = cards.filter({ hasText: '(inativo)' })
        const badge = await box(inactiveCard.getByText(/^Inativ/))
        const inactiveBox = await box(inactiveCard)
        expect(badge.right).toBeLessThanOrEqual(inactiveBox.right)
        expect(badge.x).toBeGreaterThanOrEqual(inactiveBox.x)
        await expectNoPageScroll(page)
      })

      test('tool: chip do parâmetro e placeholder da rota (V9, V10)', async ({ page }) => {
        await page.goto('/tools/new')
        await hydrated(page)

        // V10: o placeholder cabe inteiro no campo, sem reticências.
        const route = page.getByLabel(/^Rota/)
        const placeholder = (await route.getAttribute('placeholder')) ?? ''
        expect(placeholder.length).toBeLessThanOrEqual(31)
        const textWidth = await route.evaluate(async (input, text) => {
          await document.fonts.ready
          const context = document.createElement('canvas').getContext('2d')
          if (!context) throw new Error('canvas indisponível')
          context.font = getComputedStyle(input).font
          return context.measureText(text).width
        }, placeholder)
        expect(textWidth).toBeLessThanOrEqual((await route.evaluate((el) => el.clientWidth)) - 24)

        // V9: o chip {param} fica numa linha só; sem espaço, o preview rola por dentro.
        await route.fill(`https://api.loja.example/v1/{order_id}/{${LONG_PARAM}}`)
        const chip = page.getByText(`{${LONG_PARAM}}`, { exact: true })
        await expect(chip).toBeVisible()
        const lines = await chip.evaluate((el) => ({
          rects: el.getClientRects().length,
          height: el.getBoundingClientRect().height,
          lineHeight: parseFloat(getComputedStyle(el.parentElement as Element).lineHeight)
        }))
        expect(lines.rects).toBe(1)
        expect(lines.height).toBeLessThanOrEqual(lines.lineHeight * 1.5)
        await expectNoPageScroll(page)
      })
    })
  }
}

// Com as colunas fixas somando 596 px, a coluna Agent não pode ficar sem espaço
// em larguras médias: a tabela rola dentro do próprio card e o nome curto cabe.
test.describe('agents: tabela em 1024x768', () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  test('nome curto sem truncar e sem rolagem horizontal da página', async ({ page }) => {
    const rows = [agentConfig('curto', 'Agente Curto')]
    await page.route(/\/api\/agents(\?.*)?$/, (route) =>
      route.fulfill({
        json: { success: true, data: { data: rows, total: rows.length, page: 1, limit: 100, totalPages: 1 } }
      })
    )
    await page.goto('/agents')
    await hydrated(page)
    const link = page.getByRole('link', { name: 'Agente Curto' })
    await expect(link).toBeVisible()
    expect(await isClipped(link)).toBe(false)
    await expectNoPageScroll(page)
  })
})
