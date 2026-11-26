import { expect, test, type Page } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'
import { TEST_ENV } from './test-env'

// QA da P4-02: o que só o navegador real mostra (normalização do textarea, Select
// do Radix com valor fora das opções, duplo clique e tecla repetida de verdade).
// O nome casa com CONFIG_AGENTS_SPEC: roda no projeto `config-agents`, depois do
// dashboard. Sozinho:
// `CI=true pnpm exec playwright test e2e/auth.setup.ts e2e/qa-p402.config-crud.concurrency.spec.ts --project=setup --project=config-agents --no-deps`.

const ADMIN = { Authorization: `Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}` }
type Kind = 'agents' | 'teams' | 'tools'

async function create(kind: Kind, doc: Record<string, unknown>) {
  const response = await fetch(`${FAKE_ORCHESTRATOR_URL}/admin/config/${kind}`, {
    method: 'POST',
    headers: { ...ADMIN, 'Content-Type': 'application/json' },
    body: JSON.stringify(doc)
  })
  expect(response.status, await response.clone().text()).toBe(201)
}
const stored = async (kind: Kind, id: string) =>
  (await fetch(`${FAKE_ORCHESTRATOR_URL}/test/config/${kind}/${encodeURIComponent(id)}`)).json()

const agent = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome: 'QA',
  model: 'fake-model',
  factory_ia_model: 'ollama',
  prompt: 'Original',
  ...extra
})

const saveButton = (page: Page) => page.getByRole('button', { name: 'Salvar', exact: true })
const reviewDialog = (page: Page) => page.getByRole('dialog', { name: 'Revisar antes de salvar' })
const name = (page: Page) => page.getByLabel(/^Nome \*/).first()

async function openEditor(page: Page, kind: Kind, id: string) {
  await page.goto(`/${kind}/${id}`)
  await hydrated(page)
  // O Playwright conta `aria-disabled` como desabilitado: espera só sair o `disabled`.
  await expect(saveButton(page)).not.toHaveAttribute('disabled')
}

function countPuts(page: Page) {
  const puts: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().includes('/api/')) puts.push(request.url())
  })
  return puts
}

test.describe('Sem tocar, num navegador real', () => {
  test('documento cheio, com valores fora das opções: Tab por tudo não acende o Salvar', async ({ page }) => {
    await create('agents', agent('qa-p402-cru', {
      factory_ia_model: 'provedor-legado',
      descricao: 'Com espaço no fim ',
      model_params: { temperature: 0.50, top_p: 1 },
      base_url: 'http://modelo.test:11434',
      api_key_ref: 'env:OPENAI_API_KEY',
      markdown: false,
      num_history_runs: 50,
      rag_config: { active: false, doc_name: 'base', model: 'e', factory_ia_model: 'embed-legado', search_strategy: 'semantic', api_key_ref: 'file:/run/secrets/k' }
    }))
    await create('tools', {
      id: 'qa-p402-cru',
      name: 'QA',
      description: 'd',
      route: 'https://api.example.com/{id}',
      http_method: 'PATCH',
      instructions: '',
      headers: { 'X-Texto': 'segredo-gravado-qa', 'X-Ref': 'env:X_API_KEY' },
      parameters: [
        { name: 'id', type: 'string', description: 'd', required: false },
        { name: 'n', type: 'float', description: 'd', required: false, default_value: 1.5 },
        { name: 'o', type: 'object', description: 'd', required: false, default_value: { b: 1, a: 2 } }
      ]
    })
    await create('teams', {
      id: 'qa-p402-cru',
      nome: 'QA',
      model: 'fake-model',
      factory_ia_model: 'provedor-legado',
      member_ids: ['agente-alfa'],
      mode: 'route'
    })

    for (const kind of ['agents', 'tools', 'teams'] as const) {
      await openEditor(page, kind, 'qa-p402-cru')
      await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true')
      await name(page).focus()
      for (let step = 0; step < 50; step++) await page.keyboard.press('Tab')
      // Uma comparação nova, com o que o blur deixou no formulário.
      await name(page).pressSequentially('x')
      await expect(saveButton(page)).not.toHaveAttribute('aria-disabled')
      await name(page).press('Backspace')
      await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true')
      await expect(page.getByText('Nenhuma alteração para salvar.')).toBeVisible()
    }
  })
})

test.describe('Corridas com evento de verdade', () => {
  test('duplo clique no Salvar abre um só diálogo; duplo clique no Confirmar dá um só PUT', async ({ page }) => {
    await create('agents', agent('qa-p402-duplo'))
    await openEditor(page, 'agents', 'qa-p402-duplo')
    const puts = countPuts(page)

    await name(page).fill('Duplo')
    await saveButton(page).dblclick()
    await expect(reviewDialog(page)).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(1)

    await reviewDialog(page).getByRole('button', { name: 'Confirmar e salvar' }).dblclick()
    await expect(page.getByText(/^Agente salvo\./)).toBeVisible()

    expect(puts).toHaveLength(1)
    expect(await stored('agents', 'qa-p402-duplo')).toMatchObject({ nome: 'Duplo', version: 2 })
  })

  test('Enter segurado no Salvar nunca confirma: nenhum PUT', async ({ page }) => {
    await create('agents', agent('qa-p402-enter'))
    await openEditor(page, 'agents', 'qa-p402-enter')
    const puts = countPuts(page)

    await name(page).fill('Enter')
    await saveButton(page).focus()
    await page.keyboard.down('Enter')
    for (let repeat = 0; repeat < 8; repeat++) await page.keyboard.down('Enter')
    await page.keyboard.up('Enter')

    // O Confirmar liga "Salvando…" e dispara o fetch no próprio clique: depois de um
    // quadro inteiro, um PUT indevido já apareceu, por mais lento que ele responda.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))))
    await expect(page.getByRole('button', { name: 'Salvando…' })).toHaveCount(0)
    await expect(page.getByText(/^Agente salvo\./)).toHaveCount(0)
    expect(puts).toEqual([])
    expect(await stored('agents', 'qa-p402-enter')).toMatchObject({ nome: 'QA', version: 1 })
  })

  test('clique fora fecha sem request; gravando, não fecha', async ({ page }) => {
    await create('agents', agent('qa-p402-fora'))
    await openEditor(page, 'agents', 'qa-p402-fora')
    const puts = countPuts(page)
    await name(page).fill('Fora')

    await saveButton(page).click()
    await expect(reviewDialog(page)).toBeVisible()
    await page.mouse.click(5, 5)
    await expect(reviewDialog(page)).toHaveCount(0)
    expect(puts).toEqual([])
    await expect(saveButton(page)).toBeFocused()

    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/agents/qa-p402-fora', async (route) => {
      if (route.request().method() === 'PUT') await gate
      await route.continue()
    })
    await saveButton(page).click()
    await reviewDialog(page).getByRole('button', { name: 'Confirmar e salvar' }).click()
    await expect(reviewDialog(page).getByRole('button', { name: 'Salvando…' })).toBeDisabled()
    await page.mouse.click(5, 5)
    await page.keyboard.press('Escape')
    await expect(reviewDialog(page)).toBeVisible()
    release()
    await expect(reviewDialog(page)).toHaveCount(0)
    await expect(page.getByText(/^Agente salvo\./)).toBeVisible()
  })
})

test.describe('Bugs corrigidos e abertos', () => {
  test('P4-02-B1 corrigido: espaço no fim do nome não é alteração; com outra edição, grava aparado e o Salvar fica sem mudança', async ({ page }) => {
    await create('agents', agent('qa-p402-b1'))
    await openEditor(page, 'agents', 'qa-p402-b1')

    // Só o espaço não é alteração: o BFF apara (D-P4-02-6).
    await name(page).fill('QA ')
    await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true')

    await name(page).fill('QA novo ')
    await saveButton(page).click()
    await expect(reviewDialog(page).getByText('Depois').locator('+ dd')).toHaveText('QA novo')
    await reviewDialog(page).getByRole('button', { name: 'Confirmar e salvar' }).click()
    await expect(page.getByText(/^Agente salvo\./)).toBeVisible()
    expect(await stored('agents', 'qa-p402-b1')).toMatchObject({ nome: 'QA novo', version: 2 })

    await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true')
    // Sem isto a comparação aparada esconderia a falta do `form.reset` (D-P4-02-6).
    await expect(name(page)).toHaveValue('QA novo')
  })

  test('P4-02-B3 corrigido: prompt com \\r\\n, clicar e sair sem digitar não vira alteração', async ({ page }) => {
    await create('agents', agent('qa-p402-b3', { prompt: 'linha 1\r\nlinha 2' }))
    await openEditor(page, 'agents', 'qa-p402-b3')
    await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true')

    await page.getByLabel('Instruções do sistema').click()
    await page.keyboard.press('Tab')
    await name(page).pressSequentially('x')
    await name(page).press('Backspace')

    await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true')
  })

  test('BUG P4-02-B8: descrição de parâmetro em duas linhas, clicar e sair não devia virar alteração', async ({ page }) => {
    test.fail()
    await create('tools', {
      id: 'qa-p402-b8',
      name: 'QA',
      description: 'd',
      route: 'https://api.example.com/v1',
      http_method: 'GET',
      instructions: '',
      headers: {},
      parameters: [{ name: 'p', type: 'string', description: 'linha 1\nlinha 2', required: false }]
    })
    await openEditor(page, 'tools', 'qa-p402-b8')
    await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true')

    await page.getByLabel(/^Descrição/).nth(1).click()
    await page.keyboard.press('Tab')
    await name(page).pressSequentially('x')
    await name(page).press('Backspace')

    await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true')
  })
})
