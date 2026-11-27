import { expect, test, type Locator, type Page } from '@playwright/test'

import { hydrated } from './hydration'

// QA1-05 (#8 erro de campo, #9, #18, #19, #31): padrão único de campo e de erro.
// Mesma altura na linha (36 px de md em diante, 40 px abaixo), o erro aparece e
// some sem mover o campo seguinte e o Switch desabilitado se distingue.

const VIEWPORTS = [
  { name: 'desktop', size: { width: 1367, height: 889 }, height: 36 },
  { name: 'mobile', size: { width: 390, height: 844 }, height: 40 }
] as const

const heightOf = (locator: Locator) =>
  locator.evaluate((element) => element.getBoundingClientRect().height)

// Posição vertical dentro do conteúdo rolável: não muda com a rolagem do foco.
const contentY = (locator: Locator) =>
  locator.evaluate((element) => {
    const main = document.querySelector('main#conteudo') as HTMLElement
    return element.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop
  })

async function expectHeights(controls: Locator, expected: number) {
  const heights = await controls.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height)
  )
  expect(heights.length).toBeGreaterThan(0)
  for (const height of heights) expect(height).toBeCloseTo(expected, 0)
}

const FIELDS = 'input:not([aria-hidden="true"]), [role="combobox"]'

// Cor de um token resolvida pelo navegador (`rgb(r, g, b)`), para comparar com a computada.
const tokenColor = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('div')
    probe.style.color = `hsl(var(--${name}))`
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, token)

// `r, g, b` de `rgb(r, g, b)`: o brilho e o anel aparecem como `rgba(r, g, b, a)` no box-shadow.
const channels = (rgb: string) => rgb.slice(rgb.indexOf('(') + 1, rgb.lastIndexOf(')'))

// V5 e V8: todo controle inválido tem a borda de erro e o foco está no 1º do DOM,
// com o anel de erro e sem o brilho primário.
async function expectErrorStyle(page: Page) {
  const destructive = await tokenColor(page, 'destructive')
  const primary = channels(await tokenColor(page, 'primary'))
  const invalid = page.locator('[aria-invalid="true"]')
  await expect(invalid.first()).toBeFocused()
  const borders = await invalid.evaluateAll((elements) =>
    elements.map((element) => {
      const css = getComputedStyle(element)
      return { id: element.id, color: css.borderTopColor, width: css.borderTopWidth }
    })
  )
  expect(borders.length).toBeGreaterThan(0)
  for (const border of borders) expect(border, border.id).toEqual({ id: border.id, color: destructive, width: '1px' })
  const ring = await invalid.first().evaluate((element) => getComputedStyle(element).boxShadow)
  expect(ring).toContain(channels(destructive))
  expect(ring).not.toContain(primary)
}

for (const { name, size, height } of VIEWPORTS) {
  test.describe(`campos em ${name} (${size.width}x${size.height})`, () => {
    test.use({ viewport: size })

    test('agent: Provedor e Modelo, e os parâmetros do modelo, têm a altura do padrão', async ({ page }) => {
      await page.goto('/agents/new')
      await hydrated(page)
      await expect(page.getByRole('combobox', { name: /^Provedor \*/ })).toBeEnabled()

      await expectHeights(page.locator('#factoryIaModel, #model'), height)

      const add = page.getByRole('button', { name: 'Adicionar parâmetro', exact: true }).first()
      await expect(add).toBeEnabled()
      expect(await heightOf(add)).toBeCloseTo(height, 0)
      await add.click()
      await expectHeights(
        page.getByRole('list', { name: 'Parâmetros do modelo' }).locator(FIELDS),
        height
      )
    })

    test('tool: Método HTTP e Rota, headers e parâmetros têm a altura do padrão', async ({ page }) => {
      await page.goto('/tools/new')
      await hydrated(page)
      await expect(page.locator('#http_method')).toBeEnabled()

      await expectHeights(page.locator('#http_method, #route'), height)

      const addHeader = page.getByRole('button', { name: 'Adicionar header' })
      expect(await heightOf(addHeader)).toBeCloseTo(height, 0)
      await addHeader.click()
      await expectHeights(page.getByRole('list', { name: 'Headers' }).locator(FIELDS), height)

      const addParameter = page.getByRole('button', { name: 'Adicionar parâmetro' })
      expect(await heightOf(addParameter)).toBeCloseTo(height, 0)
      await addParameter.click()
      await expectHeights(page.getByRole('list', { name: 'Parâmetros' }).locator(FIELDS), height)
    })

    test('Input, TextArea e Select têm o mesmo fundo', async ({ page }) => {
      await page.goto('/agents/new')
      await hydrated(page)
      const backgrounds = await page
        .locator('#id, #descricao, #factoryIaModel')
        .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor))
      expect(backgrounds).toHaveLength(3)
      expect(new Set(backgrounds).size).toBe(1)
    })

    test('Salvar vazio: borda de erro nos campos inválidos e foco no 1º, sem o brilho primário', async ({
      page
    }) => {
      for (const [path, schemaReady] of [
        ['/agents/new', '#factoryIaModel'],
        ['/tools/new', '#http_method']
      ] as const) {
        await page.goto(path)
        await hydrated(page)
        await expect(page.locator(schemaReady)).toBeEnabled()
        await page.getByRole('button', { name: 'Salvar' }).click()
        await expect(page.locator('#id')).toHaveAttribute('aria-invalid', 'true')
        await expectErrorStyle(page)
      }
    })

    test('parâmetro da tool: a lixeira fica na linha do Input do nome', async ({ page }) => {
      await page.goto('/tools/new')
      await hydrated(page)
      await expect(page.locator('#http_method')).toBeEnabled()
      await page.getByRole('button', { name: 'Adicionar parâmetro' }).click()
      const row = page.getByRole('list', { name: 'Parâmetros' }).getByRole('listitem').first()
      const bottomOf = (locator: Locator) =>
        locator.evaluate((element) => element.getBoundingClientRect().bottom)
      const name = await bottomOf(row.getByRole('textbox', { name: /^Nome \*/ }))
      const remove = await bottomOf(row.getByRole('button', { name: 'Remover parâmetro 1' }))
      expect(Math.abs(remove - name)).toBeLessThanOrEqual(0.5)
    })

    test('/agents/new: erro de campo aparece e some sem mover o campo seguinte', async ({ page }) => {
      await page.goto('/agents/new')
      await hydrated(page)
      await expect(page.getByRole('combobox', { name: /^Provedor \*/ })).toBeEnabled()

      const probes = [page.locator('#descricao'), page.locator('#prompt'), page.getByRole('button', { name: 'Salvar' })]
      const before = await Promise.all(probes.map(contentY))

      await page.getByRole('button', { name: 'Salvar' }).click()
      await expect(page.locator('#id')).toHaveAttribute('aria-invalid', 'true')
      await expect(page.locator('#id-error')).toContainText('ID é obrigatório')
      expect(await Promise.all(probes.map(contentY))).toEqual(before)

      await page.locator('#id').fill('agente-e2e')
      await page.locator('#nome').fill('Agente E2E')
      await page.locator('#model').fill('llama3.2')
      await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0)
      expect(await Promise.all(probes.map(contentY))).toEqual(before)
    })

    test('/tools/new: erro de campo, de header e de parâmetro não move o campo seguinte', async ({ page }) => {
      await page.goto('/tools/new')
      await hydrated(page)
      // O aviso "carregando opções" do HTTP some com o schema: medir antes dele mede outra tela.
      await expect(page.locator('#http_method')).toBeEnabled()
      await page.getByRole('button', { name: 'Adicionar header' }).click()
      await page.getByRole('button', { name: 'Adicionar parâmetro' }).click()

      // O preview da tool cresce com o que se digita: o fim do formulário só
      // vale na comparação com o erro, não na com o campo corrigido.
      const fields = [page.locator('#instructions'), page.locator('#tool-parameters')]
      const end = page.getByRole('button', { name: 'Salvar' })
      const before = await Promise.all(fields.map(contentY))
      const endBefore = await contentY(end)

      await page.getByRole('button', { name: 'Salvar' }).click()
      await expect(page.locator('#id')).toHaveAttribute('aria-invalid', 'true')
      await expect(page.locator('#description-error')).toContainText('Descrição é obrigatória')
      await expect(page.locator('#route-error')).toContainText('Rota é obrigatória')
      expect(await Promise.all(fields.map(contentY))).toEqual(before)
      expect(await contentY(end)).toBe(endBefore)

      await page.locator('#id').fill('tool-e2e')
      await page.locator('#name').fill('Tool E2E')
      await page.locator('#description').fill('Descrição')
      await page.locator('#route').fill('https://api.example.com/v1')
      await page.getByLabel('Nome do header 1').fill('X-Trace')
      await page.getByRole('textbox', { name: 'Valor de X-Trace' }).fill('abc')
      await page.getByRole('textbox', { name: /^Nome \*/ }).last().fill('cidade')
      await page.getByRole('textbox', { name: /^Descrição \*/ }).last().fill('Cidade')
      await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0)
      expect(await Promise.all(fields.map(contentY))).toEqual(before)
    })
  })
}

// V8 no 422: o campo recusado pelo orquestrador recebe o foco, com a borda e o anel de erro.
test('422 do orquestrador: foco no campo recusado, com a borda e o anel de erro', async ({ page }) => {
  await page.goto('/tools/new')
  await hydrated(page)
  await expect(page.locator('#http_method')).toBeEnabled()
  await page.locator('#id').fill('e2e-campo-recusado')
  await page.locator('#name').fill('Campo recusado')
  await page.locator('#description').fill('Placeholder no host')
  // Placeholder no host: o cliente deixa passar e o orquestrador recusa a rota.
  await page.locator('#route').fill('https://{host}.example.com/v1')
  await page.getByRole('button', { name: 'Criar parâmetro host' }).click()
  await page.getByRole('textbox', { name: /^Descrição \*/ }).last().fill('Host')
  const saved = page.waitForResponse((response) => response.url().endsWith('/api/tools'))
  await page.getByRole('button', { name: 'Salvar' }).click()
  expect((await saved).status()).toBe(422)
  await expect(page.locator('#route')).toHaveAttribute('aria-invalid', 'true')
  await expectErrorStyle(page)
})

// O brilho do Switch ligado é uma sombra colorida; sem ele, só restam as camadas transparentes.
const hasGlow = (shadow: string) => /rgba?\((?!0, 0, 0, 0\))/.test(shadow)

test('Switch desabilitado: desligado vazado e ligado sem brilho, ambos distintos do habilitado', async ({
  page
}) => {
  await page.goto('/agents/new')
  await hydrated(page)
  const expose = page.getByRole('switch', { name: 'Expor raciocínio' })
  const reasoning = page.getByRole('switch', { name: 'Raciocínio passo a passo' })
  await expect(expose).toBeDisabled()

  const style = (locator: Locator) =>
    locator.evaluate((element) => {
      const css = getComputedStyle(element)
      return {
        background: css.backgroundColor,
        border: css.borderTopColor,
        opacity: css.opacity,
        shadow: css.boxShadow
      }
    })

  // O padrão do schema liga "Expor raciocínio": ligado e desabilitado.
  await expect(expose).toBeChecked()
  const onDisabled = await style(expose)
  expect(onDisabled.opacity).toBe('0.7')
  expect(hasGlow(onDisabled.shadow)).toBe(false)
  expect(onDisabled.background).not.toBe('rgba(0, 0, 0, 0)')

  await reasoning.click()
  // O Switch anima (`transition`): lê o estado final.
  await expect.poll(async () => hasGlow((await style(reasoning)).shadow)).toBe(true)
  await expose.click()
  await reasoning.click()
  await expect(expose).toBeDisabled()
  await expect(expose).not.toBeChecked()
  await expect.poll(async () => (await style(expose)).background).toBe('rgba(0, 0, 0, 0)')
  const offDisabled = await style(expose)
  expect(offDisabled.opacity).toBe('1')
  expect(offDisabled.border).not.toBe('rgba(0, 0, 0, 0)')
})
