import { expect, test } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'
import { TEST_ENV } from './test-env'

// P3-06: conflito 412 no salvar e Desativar/Reativar contra o fake
// orchestrator. Cada teste cria o próprio agent. Roda no projeto
// `config-agents` (playwright.config.ts). Sozinho:
// `pnpm exec playwright test e2e/config-crud.concurrency.spec.ts --no-deps`.

const ADMIN = { Authorization: `Bearer ${TEST_ENV.ORCHESTRATOR_API_KEY_ADMIN}` }
const admin = `${FAKE_ORCHESTRATOR_URL}/admin/config/agents`
const stored = async (id: string) =>
  (await fetch(`${FAKE_ORCHESTRATOR_URL}/test/config/agents/${encodeURIComponent(id)}`)).json()

async function createAgent(id: string, nome: string) {
  const response = await fetch(admin, {
    method: 'POST',
    headers: { ...ADMIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, nome, model: 'fake-model', factory_ia_model: 'ollama', prompt: 'Original' })
  })
  expect(response.status).toBe(201)
}

// Outra pessoa salva o agent no meio da edição: a versão sobe.
async function saveElsewhere(id: string, patch: Record<string, unknown>) {
  const current = await stored(id)
  const response = await fetch(`${admin}/${id}`, {
    method: 'PUT',
    headers: { ...ADMIN, 'Content-Type': 'application/json', 'If-Match': `"${current.version}"` },
    body: JSON.stringify({ ...current, ...patch })
  })
  expect(response.status).toBe(200)
}

test('412 ao salvar: mostra o que difere e "Salvar as minhas por cima" grava com a versão atual', async ({ page }) => {
  const id = 'e2e-conflito-por-cima'
  await createAgent(id, 'Conflito')
  await page.goto(`/agents/${id}`)
  await hydrated(page)
  await expect(page.getByLabel(/^Nome \*/)).toHaveValue('Conflito')

  await saveElsewhere(id, { nome: 'Nome da outra pessoa', prompt: 'Prompt novo' })
  await page.getByLabel(/^Nome \*/).fill('Meu nome')
  await page.getByRole('button', { name: 'Salvar' }).click()

  const dialog = page.getByRole('dialog', { name: 'O agente mudou' })
  await expect(dialog).toContainText('Uma versão mais nova (v2) foi salva enquanto você editava a v1. 2 campos do formulário diferem')
  await expect(dialog.getByRole('button', { name: 'Voltar ao formulário' })).toBeFocused()
  const list = dialog.getByRole('region', { name: 'Campos que diferem' })
  await expect(list).toContainText('Meu nome')
  await expect(list).toContainText('Nome da outra pessoa')
  await expect(list).toContainText('Prompt novo')
  await expect(page.getByText('Não foi possível salvar')).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Salvar as minhas por cima' }).click()

  await expect(page.getByText('Agente salvo').last()).toBeVisible()
  await expect(page).toHaveURL('/agents')
  expect(await stored(id)).toMatchObject({ nome: 'Meu nome', version: 3, active: true })

  // Reabrir mostra os valores de quem sobrescreveu.
  await page.goto(`/agents/${id}`)
  await hydrated(page)
  await expect(page.getByLabel(/^Nome \*/)).toHaveValue('Meu nome')
  await expect(page.getByLabel('Prompt do sistema')).toHaveValue('Original')
})

test('412 ao salvar: "Recarregar a atual" abre o formulário na versão atual, com o foco no título', async ({ page }) => {
  const id = 'e2e-conflito-recarregar'
  await createAgent(id, 'Recarregar')
  await page.goto(`/agents/${id}`)
  await hydrated(page)
  // Só mexe por fora depois do editor ter lido a versão.
  await expect(page.getByLabel(/^Nome \*/)).toHaveValue('Recarregar')

  await saveElsewhere(id, { nome: 'Versão de fora' })
  await page.getByLabel(/^Nome \*/).fill('Descartado')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await page.getByRole('dialog', { name: 'O agente mudou' }).getByRole('button', { name: 'Recarregar a atual' }).click()

  await expect(page.getByText('Versão atual carregada')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel(/^Nome \*/)).toHaveValue('Versão de fora')
  await expect(page.getByRole('heading', { level: 1, name: 'Editar agente' })).toBeFocused()
  expect(await stored(id)).toMatchObject({ nome: 'Versão de fora', version: 2 })

  // A versão lida agora é a atual: salvar de novo funciona.
  await page.getByLabel(/^Nome \*/).fill('Depois de recarregar')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Agente salvo').last()).toBeVisible()
  expect(await stored(id)).toMatchObject({ nome: 'Depois de recarregar', version: 3 })
})

test('Desativar mantém a página, com as edições, e Reativar volta', async ({ page }) => {
  const id = 'e2e-desativar'
  await createAgent(id, 'Desativar')
  await page.goto(`/agents/${id}`)
  await hydrated(page)
  await expect(page.getByRole('switch', { name: 'Agente ativo' })).toHaveCount(0)

  await page.getByLabel(/^Nome \*/).fill('Editado e não salvo')
  await page.getByRole('button', { name: 'Desativar agente' }).click()
  const dialog = page.getByRole('dialog', { name: 'Desativar agente' })
  await expect(dialog).toContainText('Você tem edições não salvas')
  await dialog.getByRole('button', { name: 'Desativar' }).click()

  await expect(page.getByText('Agente desativado').last()).toBeVisible()
  await expect(page).toHaveURL(`/agents/${id}`)
  await expect(page.getByRole('button', { name: 'Reativar agente' })).toBeFocused()
  await expect(page.getByRole('heading', { level: 1, name: 'Editar agente' }).locator('xpath=..')).toContainText('Inativo')
  await expect(page.getByLabel(/^Nome \*/)).toHaveValue('Editado e não salvo')
  expect(await stored(id)).toMatchObject({ nome: 'Desativar', active: false, version: 2 })

  // A lista mostra a linha como Inativo.
  await page.goto('/agents')
  await expect(page.getByRole('row').filter({ has: page.getByText(id, { exact: true }) })).toContainText('Inativo')
  await page.goto(`/agents/${id}`)
  await hydrated(page)

  await page.getByRole('button', { name: 'Reativar agente' }).click()
  await expect(page.getByText('Agente reativado').last()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Desativar agente' })).toBeFocused()
  expect(await stored(id)).toMatchObject({ nome: 'Desativar', active: true, version: 3 })
})

test('Desativar com a versão desatualizada (412): aviso, nada muda e Recarregar traz a atual', async ({ page }) => {
  const id = 'e2e-desativar-412'
  await createAgent(id, 'Aviso')
  await page.goto(`/agents/${id}`)
  await hydrated(page)
  await expect(page.getByLabel(/^Nome \*/)).toHaveValue('Aviso')

  await saveElsewhere(id, { nome: 'Mudou fora' })
  await page.getByRole('button', { name: 'Desativar agente' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Desativar' }).click()

  const dialog = page.getByRole('dialog', { name: 'O agente mudou' })
  await expect(dialog).toContainText('Nada foi desativado.')
  expect(await stored(id)).toMatchObject({ active: true, version: 2 })
  await dialog.getByRole('button', { name: 'Recarregar' }).click()

  await expect(page.getByLabel(/^Nome \*/)).toHaveValue('Mudou fora')
  await expect(page.getByRole('heading', { level: 1, name: 'Editar agente' })).toBeFocused()
})

test('Desativar agent membro de team mostra os teams e nada muda', async ({ page }) => {
  const agentId = 'e2e-membro'
  const teamId = 'e2e-team-do-membro'
  await createAgent(agentId, 'Membro')
  const created = await fetch(`${FAKE_ORCHESTRATOR_URL}/admin/config/teams`, {
    method: 'POST',
    headers: { ...ADMIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: teamId,
      nome: 'Team do membro',
      factory_ia_model: 'ollama',
      model: 'fake-model',
      member_ids: [agentId],
      mode: 'route'
    })
  })
  expect(created.status).toBe(201)

  await page.goto(`/agents/${agentId}`)
  await hydrated(page)
  await page.getByRole('button', { name: 'Desativar agente' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Desativar' }).click()

  const dialog = page.getByRole('dialog', { name: 'Agente em uso por teams' })
  await expect(dialog.getByRole('link', { name: new RegExp(teamId) })).toBeVisible()
  await dialog.getByRole('button', { name: 'Fechar' }).first().click()
  await expect(dialog).toHaveCount(0)
  expect(await stored(agentId)).toMatchObject({ active: true, version: 1 })

  // Limpa: o team antes do agent (que ele usa).
  const hard = { ...ADMIN, 'If-Match': '"1"' }
  await fetch(`${FAKE_ORCHESTRATOR_URL}/admin/config/teams/${teamId}?hard=true`, { method: 'DELETE', headers: hard })
  await fetch(`${admin}/${agentId}?hard=true`, { method: 'DELETE', headers: hard })
})

// ---------------------------------------------------------------------------
// QA P3-06: team e tool (o dev cobriu só agent no e2e). Tool com duas abas
// reais e nenhum valor de segredo na comparação; team com conflito, Desativar
// e Reativar.
// ---------------------------------------------------------------------------

const toolsAdmin = `${FAKE_ORCHESTRATOR_URL}/admin/config/tools`
const storedKind = async (kind: 'tools' | 'teams', id: string) =>
  (await fetch(`${FAKE_ORCHESTRATOR_URL}/test/config/${kind}/${encodeURIComponent(id)}`)).json()

test('tool, duas abas: o 412 compara sem nenhum valor de segredo e "por cima" grava o da segunda aba', async ({
  page,
  context
}) => {
  const id = 'e2e-tool-conflito'
  const OLD = 'segredo-antigo-do-header'
  const NEW = 'segredo-novo-do-header'
  const reads: string[] = []
  page.on('response', async (response) => {
    if (response.request().method() === 'GET' && new URL(response.url()).pathname === `/api/tools/${id}`) {
      reads.push(await response.text())
    }
  })
  let version = 1
  try {
    // Criada pela UI: o playground é quem manda `active: true` (sem switch no formulário).
    await page.goto('/tools/new')
    await hydrated(page)
    await page.getByLabel(/^ID da tool/).fill(id)
    await page.getByLabel(/^Nome/).fill('Tool conflito')
    await page.getByLabel(/^Descrição/).fill('Duas abas')
    await page.getByLabel(/^Rota/).fill('https://clima.example.com/v1/previsao')
    await page.getByRole('button', { name: 'Adicionar header' }).click()
    await page.getByLabel('Nome do header 1').fill('X-Conta')
    await page.getByLabel('Valor de X-Conta', { exact: true }).fill(OLD)
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Tool salva').last()).toBeVisible()
    expect(await storedKind('tools', id)).toMatchObject({ active: true, version: 1 })

    const other = await context.newPage()
    await other.goto(`/tools/${id}`)
    await hydrated(other)
    await expect(other.getByLabel(/^Nome \*/)).toHaveValue('Tool conflito')
    await page.goto(`/tools/${id}`)
    await hydrated(page)
    await expect(page.getByLabel(/^Nome \*/)).toHaveValue('Tool conflito')

    // Aba 2 salva primeiro.
    await other.getByLabel(/^Nome \*/).fill('Nome da outra aba')
    await other.getByRole('button', { name: 'Salvar' }).click()
    await expect(other.getByText('Tool salva').last()).toBeVisible()
    await other.close()
    version = 2

    // Aba 1 (versão velha) troca nome e o valor do header em texto.
    await page.getByLabel(/^Nome \*/).fill('Nome da minha aba')
    await page.getByRole('button', { name: 'Substituir o valor de X-Conta' }).click()
    await page.getByLabel('Novo valor de X-Conta').fill(NEW)
    await page.getByRole('button', { name: 'Salvar' }).click()

    const dialog = page.getByRole('dialog', { name: 'A tool mudou' })
    const list = dialog.getByRole('region', { name: 'Campos que diferem' })
    await expect(list).toContainText('Nome da minha aba')
    await expect(list).toContainText('Nome da outra aba')
    await expect(list).toContainText('X-Conta')
    // O valor novo (só no formulário) não vai ao diálogo; o antigo nunca chegou ao
    // browser: toda leitura do BFF veio mascarada.
    expect(await dialog.innerHTML()).not.toContain(NEW)
    expect(reads.length).toBeGreaterThan(0)
    for (const body of reads) expect(body).not.toContain(OLD)

    await dialog.getByRole('button', { name: 'Salvar as minhas por cima' }).click()
    await expect(page.getByText('Tool salva').last()).toBeVisible()
    await expect(page).toHaveURL('/tools')
    version = 3
    expect(await storedKind('tools', id)).toMatchObject({
      name: 'Nome da minha aba',
      headers: { 'X-Conta': NEW },
      active: true,
      version: 3
    })
  } finally {
    await fetch(`${toolsAdmin}/${id}?hard=true`, {
      method: 'DELETE',
      headers: { ...ADMIN, 'If-Match': `"${version}"` }
    })
  }
})

test('team: 412 no salvar (Recarregar), Desativar e Reativar', async ({ page }) => {
  const id = 'e2e-team-conflito'
  const teamsAdmin = `${FAKE_ORCHESTRATOR_URL}/admin/config/teams`
  const base = {
    id,
    nome: 'Team conflito',
    factory_ia_model: 'ollama',
    model: 'fake-model',
    member_ids: ['agente-alfa'],
    mode: 'route'
  }
  const created = await fetch(teamsAdmin, {
    method: 'POST',
    headers: { ...ADMIN, 'Content-Type': 'application/json' },
    body: JSON.stringify(base)
  })
  expect(created.status).toBe(201)

  try {
    await page.goto(`/teams/${id}`)
    await hydrated(page)
    await expect(page.getByLabel(/^Nome/)).toHaveValue('Team conflito')
    await expect(page.getByRole('switch', { name: 'Team ativo' })).toHaveCount(0)

    const outside = await fetch(`${teamsAdmin}/${id}`, {
      method: 'PUT',
      headers: { ...ADMIN, 'Content-Type': 'application/json', 'If-Match': '"1"' },
      body: JSON.stringify({ ...(await storedKind('teams', id)), mode: 'coordinate' })
    })
    expect(outside.status).toBe(200)

    await page.getByLabel(/^Nome/).fill('Meu nome de team')
    await page.getByRole('button', { name: 'Salvar' }).click()
    const dialog = page.getByRole('dialog', { name: 'O team mudou' })
    const list = dialog.getByRole('region', { name: 'Campos que diferem' })
    await expect(list).toContainText('Meu nome de team')
    await expect(list).toContainText('Modo de coordenação')
    await expect(list).toContainText('coordinate')
    await dialog.getByRole('button', { name: 'Recarregar a atual' }).click()
    await expect(page.getByLabel(/^Nome/)).toHaveValue('Team conflito')
    await expect(page.getByRole('radio', { name: 'coordinate' })).toBeChecked()
    expect(await storedKind('teams', id)).toMatchObject({ nome: 'Team conflito', mode: 'coordinate', version: 2 })

    // Desativar (versão recarregada) e Reativar.
    await page.getByRole('button', { name: 'Desativar team' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Desativar' }).click()
    await expect(page.getByText('Team desativado').last()).toBeVisible()
    expect(await storedKind('teams', id)).toMatchObject({ active: false, version: 3 })
    await page.goto('/teams')
    await expect(page.getByRole('row').filter({ has: page.getByText(id, { exact: true }) })).toContainText('Inativo')
    await page.goto(`/teams/${id}`)
    await hydrated(page)
    await page.getByRole('button', { name: 'Reativar team' }).click()
    await expect(page.getByText('Team reativado').last()).toBeVisible()
    expect(await storedKind('teams', id)).toMatchObject({ active: true, mode: 'coordinate', version: 4 })
  } finally {
    const { version } = await storedKind('teams', id)
    await fetch(`${teamsAdmin}/${id}?hard=true`, { method: 'DELETE', headers: { ...ADMIN, 'If-Match': `"${version}"` } })
  }
})
