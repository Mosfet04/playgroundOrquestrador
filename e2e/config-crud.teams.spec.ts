import { expect, test } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'

// P3-04: CRUD de teams pela API Admin do fake orchestrator e o 409 do agent
// membro. Roda no projeto `config-agents` (playwright.config.ts), junto do CRUD
// de agents. Sozinho: `pnpm exec playwright test e2e/config-crud.teams.spec.ts --no-deps`.
// O fake nasce com o team `time-config`, que tem o agent inativo `agente-gama`
// como membro.

const storedTeam = async (id: string) =>
  fetch(`${FAKE_ORCHESTRATOR_URL}/test/config/teams/${encodeURIComponent(id)}`)

test('cria, reabre, edita e exclui um team pelo fake', async ({ page }) => {
  const id = 'e2e-team-crud'
  await page.goto('/teams/new')
  await hydrated(page)
  await expect(page.getByRole('combobox', { name: /^Provedor \*/ })).toBeEnabled()
  await page.getByLabel(/^ID do team/).fill(id)
  await page.getByLabel(/^Nome/).fill('Team do e2e')
  await page.getByLabel('Descrição', { exact: true }).fill('Criado pelo e2e')
  await page.getByRole('textbox', { name: /^Modelo \*/ }).fill('fake-model')
  await page.getByRole('checkbox', { name: /Agente Alfa/ }).check()
  await page.getByRole('checkbox', { name: /Agente Beta/ }).check()
  // O total muda com os agents que o CRUD de agents cria em paralelo.
  await expect(page.getByText(/^2 de \d+ selecionados$/)).toBeVisible()
  await page.getByRole('radio', { name: 'coordinate' }).check()
  await page.getByLabel('Prompt do líder').fill('Coordene os membros.')
  await page.getByRole('switch', { name: 'Resumo da sessão' }).click()
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Team salvo').last()).toBeVisible()
  await expect(page).toHaveURL('/teams')
  expect(await (await storedTeam(id)).json()).toMatchObject({
    id,
    nome: 'Team do e2e',
    descricao: 'Criado pelo e2e',
    prompt: 'Coordene os membros.',
    factory_ia_model: 'ollama',
    model: 'fake-model',
    member_ids: ['agente-alfa', 'agente-beta'],
    mode: 'coordinate',
    markdown: true,
    add_history_to_context: true,
    user_memory_active: true,
    summary_active: true,
    version: 1
  })
  const row = page.getByRole('row', { name: /Team do e2e/ })
  await expect(row).toContainText('coordinate')
  await expect(row).toContainText('ollama/fake-model')

  // Reabre com os mesmos valores.
  await page.getByRole('link', { name: 'Team do e2e' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Editar team' })).toBeVisible()
  await hydrated(page)
  await expect(page.getByLabel(/^ID do team/)).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: /Agente Alfa/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Agente Beta/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Agente Gama/ })).not.toBeChecked()
  await expect(page.getByRole('radio', { name: 'coordinate' })).toBeChecked()
  await expect(page.getByLabel('Prompt do líder')).toHaveValue('Coordene os membros.')
  await expect(page.getByRole('switch', { name: 'Resumo da sessão' })).toBeChecked()

  // Edita: tira um membro, troca o modo e o nome.
  await page.getByRole('checkbox', { name: /Agente Beta/ }).uncheck()
  await page.getByRole('radio', { name: 'tasks' }).check()
  await page.getByLabel(/^Nome/).fill('Team do e2e editado')
  await page.getByRole('button', { name: 'Salvar' }).click()

  // O toast da criação ainda está na tela: espera o PUT pela versão gravada.
  await expect
    .poll(async () => ((await (await storedTeam(id)).json()) as { version: number }).version)
    .toBe(2)
  expect(await (await storedTeam(id)).json()).toMatchObject({
    nome: 'Team do e2e editado',
    member_ids: ['agente-alfa'],
    mode: 'tasks',
    version: 2
  })

  // Exclui: os agents membros ficam.
  await page.getByRole('link', { name: 'Team do e2e editado' }).first().click()
  await hydrated(page)
  await page.getByRole('button', { name: 'Excluir team' }).click()
  await expect(page.getByRole('dialog')).toContainText('Os agents membros não são excluídos.')
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click()

  await expect(page.getByText('Team excluído')).toBeVisible()
  await expect(page).toHaveURL('/teams')
  await expect(page.getByRole('link', { name: 'Team do e2e editado' })).toHaveCount(0)
  expect((await storedTeam(id)).status).toBe(404)
  expect(
    (await fetch(`${FAKE_ORCHESTRATOR_URL}/test/config/agents/agente-alfa`)).status
  ).toBe(200)
})

test('sem membro o form não envia; o orquestrador recusa um membro inexistente no campo', async ({
  page
}) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(`${request.method()} ${request.url()}`)
  })
  // O team do seed ganha um membro que não existe: o PUT real é recusado em `member_ids`.
  await page.route('**/api/teams/time-config', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const response = await route.fetch()
    const body = await response.json()
    body.data.member_ids = ['fantasma', ...body.data.member_ids]
    await route.fulfill({ response, json: body })
  })
  await page.goto('/teams/time-config')
  await hydrated(page)
  await expect(page.getByText(/Este agent não existe mais/)).toBeVisible()

  // Sem nenhum membro o form não envia nada.
  await page.getByRole('checkbox', { name: /Agente Gama/ }).uncheck()
  // A linha do id inexistente some ao desmarcar: click, não uncheck.
  await page.getByRole('checkbox', { name: /fantasma/ }).click()
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Escolha ao menos um membro')).toBeVisible()
  expect(writes).toEqual([])

  // Recarregado, o id inexistente volta: o PUT segue e o orquestrador o recusa.
  await page.reload()
  await hydrated(page)
  await expect(page.getByText(/Este agent não existe mais/)).toBeVisible()
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Valor recusado pelo orquestrador')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /fantasma/ })).toBeFocused()
  await expect(page).toHaveURL('/teams/time-config')
})

test('excluir agent membro de team mostra os teams, com link em nova aba, e nada é excluído', async ({
  page
}) => {
  await page.goto('/agents/agente-gama')
  await hydrated(page)
  await page.getByRole('button', { name: 'Excluir agente' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click()

  const dialog = page.getByRole('dialog', { name: 'Agente em uso por teams' })
  await expect(dialog).toContainText('Agente Gama é membro de 1 team.')
  const link = dialog.getByRole('link', { name: /time-config/ })
  await expect(link).toHaveAttribute('href', '/teams/time-config')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(dialog.getByRole('button', { name: 'Excluir' })).toHaveCount(0)
  await expect(dialog.getByText('Não foi possível excluir')).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Fechar' }).first().click()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL('/agents/agente-gama')
  expect(
    (await fetch(`${FAKE_ORCHESTRATOR_URL}/test/config/agents/agente-gama`)).status
  ).toBe(200)
})

test('Teams está na navegação, entre Agentes e Tools, e abre a lista', async ({ page }) => {
  await page.goto('/agents')
  await hydrated(page)
  const nav = page.getByRole('navigation', { name: 'Navegação principal' })
  const labels = await nav.getByRole('link').allTextContents()
  expect(labels.slice(labels.indexOf('Agentes'), labels.indexOf('Tools') + 1)).toEqual([
    'Agentes',
    'Teams',
    'Tools'
  ])

  await nav.getByRole('link', { name: 'Teams' }).click()

  await expect(page).toHaveURL('/teams')
  await expect(page.getByRole('heading', { level: 1, name: 'Gerenciamento de teams' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Teams' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Time Config' }).first()).toBeVisible()
})
