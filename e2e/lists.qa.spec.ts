import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import { APP_URL } from '../playwright.config'
import { hydrated } from './hydration'

// QA P1-05b. Complementa e2e/lists.spec.ts: tools (teto, estados, 404 com
// ícone, falha do excluir), EN em 390 px, teclado, 768 px (limite do md) e
// tema escuro. /api/agents* e /api/tools* respondem por page.route (o CRUD pelo
// fake orchestrator está em config-crud*.spec.ts).

const agent = (n: number, active = true) => ({
  id: `agente-${n}`,
  nome: `Agente ${n}`,
  model: 'llama3.2',
  factoryIaModel: 'ollama',
  active,
  tools_ids: []
})
const tool = (n: number, active = true) => ({
  id: `tool-${n}`,
  name: `Tool ${n}`,
  description: 'x',
  route: `https://api.example.test/some/very/long/path/segment/${n}/more/segments/to/force/ellipsis`,
  http_method: 'GET',
  parameters: [],
  active
})
const many = <T,>(count: number, make: (n: number) => T) =>
  Array.from({ length: count }, (_, i) => make(i + 1))

const listBody = <T,>(data: T[], total = data.length) => ({
  success: true,
  data: { data, total, page: 1, limit: 100, totalPages: 1 }
})

/** Lista (com as queries recebidas) e detalhe de uma coleção. */
async function mockList<T extends { id: string }>(
  page: Page,
  kind: 'agents' | 'tools',
  items: T[],
  total = items.length
) {
  const queries: string[] = []
  await page.route(new RegExp(`/api/${kind}(/[^?]*)?(\\?.*)?$`), (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === `/api/${kind}`) {
      queries.push(url.search)
      return route.fulfill({ json: listBody(items, total) })
    }
    const id = decodeURIComponent(url.pathname.slice(`/api/${kind}/`.length))
    const item = items.find((entry) => entry.id === id)
    if (!item) return route.fulfill({ status: 404, json: { success: false, error: 'x' } })
    if (route.request().method() === 'DELETE')
      return route.fulfill({ status: 500, json: { success: false, error: 'cru' } })
    return route.fulfill({ json: { success: true, data: item } })
  })
  return queries
}

const chips = (page: Page) => page.locator('[aria-live="polite"][aria-atomic="true"] > *')
const noHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
      (document.querySelector('main')?.scrollWidth ?? 0) <=
        (document.querySelector('main')?.clientWidth ?? 0)
  )
const setLocaleCookie = (context: BrowserContext, value: string) =>
  context.addCookies([{ name: 'locale', value, url: APP_URL }])

test.describe('busca em /tools', () => {
  test('busca em /tools: query codificada, chips do resultado, sem parâmetro de status', async ({
    page
  }) => {
    const queries = await mockList(page, 'tools', [tool(1), tool(2, false)])
    await page.goto('/tools')
    await hydrated(page)
    await page.getByLabel('Buscar').fill('a&b=c {"$ne":null}')

    await expect.poll(() => queries.at(-1)).toContain('search=a%26b%3Dc')
    expect(queries.at(-1)).not.toContain('active')
    await expect(chips(page)).toHaveText(['2 tools', '1 ativa', '1 inativa'])
  })
})

test.describe('404 de detalhe com o ícone da entidade (V-P1-05b-9)', () => {
  for (const [path, icon, other, title] of [
    ['/agents/nao-existe', 'lucide-bot', 'lucide-wrench', 'Agente não encontrado'],
    ['/tools/nao-existe', 'lucide-wrench', 'lucide-bot', 'Tool não encontrada']
  ] as const) {
    test(`${path}: ${icon} em muted-foreground, sem bússola; 390 px com o ícone acima do título`, async ({
      page
    }) => {
      await mockList(page, path.startsWith('/agents') ? 'agents' : 'tools', [])
      await page.goto(path)
      const alert = page.getByRole('main').getByRole('alert')
      await expect(alert.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(alert.locator(`svg.${icon}`)).toBeVisible()
      await expect(alert.locator(`svg.${other}, svg.lucide-compass`)).toHaveCount(0)
      expect(
        await alert.locator(`svg.${icon}`).evaluate((svg) => getComputedStyle(svg).color)
      ).toBe(
        await page.evaluate(() => {
          const probe = document.createElement('span')
          probe.style.color = 'hsl(var(--muted-foreground))'
          document.body.append(probe)
          return getComputedStyle(probe).color
        })
      )

      await page.setViewportSize({ width: 390, height: 844 })
      const svg = await alert.locator(`svg.${icon}`).boundingBox()
      const heading = await alert.getByRole('heading').boundingBox()
      expect(svg && heading && svg.y + svg.height <= heading.y).toBe(true)
      expect(await noHorizontalScroll(page)).toBe(true)
    })
  }

  test('/rota-inexistente continua com a bússola', async ({ page }) => {
    await page.goto('/rota-inexistente')
    await expect(page.getByRole('main').locator('svg.lucide-compass')).toBeVisible()
    await expect(page.getByRole('main').locator('svg.lucide-bot, svg.lucide-wrench')).toHaveCount(0)
  })
})

test.describe('estados no layout novo', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const kind of ['agents', 'tools'] as const) {
    test(`/${kind} em 390 px: carregando = 3 linhas de 64 px sem tabela e sem chips; depois o conteúdo com chips`, async ({
      page
    }) => {
      let release: () => void = () => undefined
      const gate = new Promise<void>((resolve) => (release = resolve))
      await page.route(new RegExp(`/api/${kind}(\\?.*)?$`), async (route) => {
        await gate
        await route.fulfill({ json: listBody([kind === 'agents' ? agent(1) : tool(1)]) })
      })
      await page.goto(`/${kind}`)

      const busy = page.locator('[aria-busy="true"]')
      await expect(busy.getByRole('status')).toContainText('Carregando')
      await expect(page.getByRole('table')).toBeHidden()
      await expect(chips(page)).toHaveCount(0)
      // O esqueleto é decorativo (sem papéis): as linhas só se acham pela estrutura.
      const lines = busy.locator('div.md\\:hidden > div')
      await expect(lines).toHaveCount(3)
      expect((await lines.first().boundingBox())?.height).toBe(64)
      expect(await noHorizontalScroll(page)).toBe(true)

      release()
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
      await expect(chips(page).first()).toBeVisible()
    })
  }

  test('/tools abortada em 390 px: bloco com ícone acima do título, sem chips, retry traz a lista', async ({
    page
  }) => {
    let up = false
    await page.route(/\/api\/tools(\?.*)?$/, (route) =>
      up ? route.fulfill({ json: listBody([tool(1)]) }) : route.abort()
    )
    await page.goto('/tools')
    const alert = page.getByRole('main').getByRole('alert')
    await expect(alert).toContainText('offline')
    await expect(chips(page)).toHaveCount(0)
    const icon = await alert.locator('svg').first().boundingBox()
    const title = await alert.getByRole('heading').boundingBox()
    expect(icon && title && icon.y + icon.height <= title.y).toBe(true)
    const [alertBox, buttonBox] = [
      await alert.boundingBox(),
      await alert.getByRole('button', { name: 'Tentar de novo' }).boundingBox()
    ]
    expect(buttonBox && alertBox && buttonBox.width >= alertBox.width - 40).toBe(true)

    up = true
    await alert.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.getByRole('link', { name: 'Tool 1' })).toBeVisible()
    await expect(chips(page)).toHaveText(['1 tool', '1 ativa', '0 inativas'])
  })
})

test.describe('EN em 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('listas com 112 itens: "Showing 100 of 112", "112 agents", sem corte nem rolagem horizontal', async ({
    page,
    context
  }) => {
    await setLocaleCookie(context, 'en')
    await mockList(page, 'agents', many(100, agent), 112)
    await mockList(page, 'tools', many(100, tool), 112)

    await page.goto('/agents')
    await expect(chips(page)).toHaveText(['112 agents'])
    await expect(page.getByText('Showing 100 of 112')).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)

    await page.goto('/tools')
    await expect(chips(page)).toHaveText(['112 tools'])
    await expect(page.getByText('Showing 100 of 112')).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)
  })

  test('chips com status e o editor: "2 agents", "1 active", "1 inactive", "Delete agent" por último', async ({
    page,
    context
  }) => {
    await setLocaleCookie(context, 'en')
    await mockList(page, 'agents', [agent(1), agent(2), agent(3, false)])
    await page.goto('/agents')
    await expect(chips(page)).toHaveText(['3 agents', '2 active', '1 inactive'])
    for (const chip of await chips(page).all()) {
      const box = await chip.boundingBox()
      expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true)
    }
    expect(await noHorizontalScroll(page)).toBe(true)

    await page.goto('/agents/agente-1')
    await hydrated(page)
    const remove = page.getByRole('button', { name: 'Delete agent' })
    const save = page.getByRole('button', { name: 'Save' })
    // Salvar só habilita com o schema lido; até lá a seção Execução é skeleton e
    // o rodapé ainda desce (P3-02).
    await expect(save).toBeEnabled()
    const [removeBox, saveBox] = [await remove.boundingBox(), await save.boundingBox()]
    if (!removeBox || !saveBox) throw new Error('botões do rodapé')
    expect(removeBox.y).toBeGreaterThan(saveBox.y)
    expect(removeBox.width).toBe(saveBox.width)
    await remove.click()
    const dialog = page.getByRole('dialog', { name: 'Delete agent' })
    const box = await dialog.boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true)
    expect(await noHorizontalScroll(page)).toBe(true)
  })

  test('404 de detalhe em EN no celular', async ({ page, context }) => {
    await setLocaleCookie(context, 'en')
    await mockList(page, 'tools', [])
    await page.goto('/tools/nao-existe')
    const alert = page.getByRole('main').getByRole('alert')
    await expect(alert.getByRole('heading', { level: 1, name: 'Tool not found' })).toBeVisible()
    await expect(alert.locator('svg.lucide-wrench')).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)
  })
})

test('excluir tool com o DELETE falhando: toast de erro, fica no editor, Dialog fechado', async ({
  page
}) => {
  await mockList(page, 'tools', [tool(1)])
  await page.goto('/tools/tool-1')
  await hydrated(page)
  const remove = page.getByRole('button', { name: 'Excluir tool' })
  await remove.click()
  await page.getByRole('dialog', { name: 'Excluir tool' }).getByRole('button', { name: 'Excluir' }).click()

  await expect(
    page.locator('[data-sonner-toast]').getByText('Não foi possível excluir a tool (código 500)')
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL('/tools/tool-1')
  await expect(remove).toBeFocused()
  await expect(page.getByText('cru')).toHaveCount(0)
})

test('teclado: um alvo de Tab por linha e Enter abre o editor', async ({ page }) => {
  await mockList(page, 'tools', [tool(1), tool(2), tool(3, false)])
  await page.goto('/tools')
  await hydrated(page)
  const rows = page.getByRole('table').getByRole('row')
  await expect(rows).toHaveCount(4)

  await page.getByLabel('Buscar').focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('table').getByRole('link', { name: 'Tool 1' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('table').getByRole('link', { name: 'Tool 2' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/tools/tool-1')
})

test.describe('768 px (limite do md) e tema escuro', () => {
  test('768 px mostra a tabela, esconde as linhas do celular e não rola a página', async ({
    page
  }) => {
    await page.setViewportSize({ width: 768, height: 900 })
    await mockList(page, 'agents', [agent(1), agent(2, false)])
    await page.goto('/agents')

    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('list').filter({ hasText: 'Agente 1' })).toBeHidden()
    expect(await noHorizontalScroll(page)).toBe(true)
  })

  test('escuro: a tabela usa o token card (nenhum branco) e o inativo fica em secondary', async ({
    page
  }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
    await mockList(page, 'agents', [agent(1), agent(2, false)])
    await page.goto('/agents')
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    // Só a lista carregada tem o avatar (o esqueleto usa a mesma tabela).
    await expect(page.getByRole('table').getByRole('link', { name: 'Agente 2' })).toBeVisible()

    const [tableBg, cardBg, inactiveBg, secondaryBg] = await page.evaluate(() => {
      const resolve = (token: string) => {
        const probe = document.createElement('span')
        probe.style.backgroundColor = `hsl(var(--${token}))`
        document.body.append(probe)
        const value = getComputedStyle(probe).backgroundColor
        probe.remove()
        return value
      }
      const wrapper = document.querySelector('table')?.parentElement
      const avatar = Array.from(document.querySelectorAll('table td span[aria-hidden="true"]')).find(
        (el) => el.textContent === 'A2' && el.closest('tr')?.textContent?.includes('Agente 2')
      )
      return [
        wrapper ? getComputedStyle(wrapper).backgroundColor : '',
        resolve('card'),
        avatar ? getComputedStyle(avatar).backgroundColor : '',
        resolve('secondary')
      ]
    })
    expect(tableBg).toBe(cardBg)
    expect(tableBg).not.toBe('rgb(255, 255, 255)')
    expect(inactiveBg).toBe(secondaryBg)
  })
})
