import { expect, test, type Page } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'
import { hydrated } from './hydration'

// P2-06: CRUD de agents pela API Admin do fake orchestrator. Roda no projeto
// `config-agents`, depois do `chromium` (playwright.config.ts): o dashboard
// conta os agents da mesma config e não pode ver um agent criado aqui. Sozinho,
// sem rodar o resto da suíte antes (com a sessão de e2e/.auth já gravada):
// `pnpm exec playwright test e2e/config-crud.agents.spec.ts --no-deps`.

const ID = 'e2e-agente-crud'
const storedAgent = async (id: string) =>
  fetch(`${FAKE_ORCHESTRATOR_URL}/test/config/agents/${encodeURIComponent(id)}`)

const modelReference = (page: Page) =>
  page.getByRole('region', { name: 'Modelo' }).getByRole('group', { name: 'Referência da chave de API' })

test('cria, edita e exclui um agent pelo fake', async ({ page }) => {
  await page.goto('/agents/new')
  await hydrated(page)
  await page.getByLabel(/^ID do agente/).fill(ID)
  await page.getByLabel(/^Nome \*/).fill('Agente do e2e')
  await page.getByLabel(/^Modelo \*/).fill('fake-model')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Agente salvo').last()).toBeVisible()
  await expect(page).toHaveURL('/agents')
  expect(await (await storedAgent(ID)).json()).toMatchObject({
    id: ID,
    nome: 'Agente do e2e',
    factory_ia_model: 'ollama',
    version: 1
  })

  await page.getByRole('link', { name: 'Agente do e2e' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Editar agente' })).toBeVisible()
  await hydrated(page)
  await page.getByLabel(/^Nome \*/).fill('Agente do e2e editado')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Agente salvo').last()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Agente do e2e editado' }).first()).toBeVisible()
  // O PUT leva os defaults do schema que o form mostrou (P3-02).
  expect(await (await storedAgent(ID)).json()).toMatchObject({
    nome: 'Agente do e2e editado',
    num_history_runs: 5,
    markdown: true,
    version: 2
  })

  await page.getByRole('link', { name: 'Agente do e2e editado' }).first().click()
  await hydrated(page)
  await page.getByRole('button', { name: 'Excluir agente' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click()

  await expect(page.getByText('Agente excluído')).toBeVisible()
  await expect(page).toHaveURL('/agents')
  await expect(page.getByRole('link', { name: 'Agente do e2e editado' })).toHaveCount(0)
  expect((await storedAgent(ID)).status).toBe(404)
})

test('id que já existe: "Já existe um agente com este ID" e o form fica', async ({ page }) => {
  await page.goto('/agents/new')
  await hydrated(page)
  await page.getByLabel(/^ID do agente/).fill('agente-alfa')
  await page.getByLabel(/^Nome \*/).fill('Repetido')
  await page.getByLabel(/^Modelo \*/).fill('fake-model')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Já existe um agente com este ID')).toBeVisible()
  await expect(page).toHaveURL('/agents/new')
})

test('agent do seed com prompt em lista: abre unido por linha e salvar grava texto', async ({ page }) => {
  await page.goto('/agents')
  await page.getByRole('link', { name: 'Agente Beta' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Editar agente' })).toBeVisible()
  await expect(page.getByLabel('Prompt do sistema')).toHaveValue('Você é o Beta.\nResponda curto.')
  await hydrated(page)
  // Reexecução local com o fake reaproveitado: a versão lida antes vale a base.
  const before = (await (await storedAgent('agente-beta')).json()).version as number
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Agente salvo').last()).toBeVisible()
  expect(await (await storedAgent('agente-beta')).json()).toMatchObject({
    prompt: 'Você é o Beta.\nResponda curto.',
    version: before + 1
  })
})

// P3-01: o provider vem do /admin/schema do fake (`fake-llm` não estava na lista
// antiga do playground): escolhido no form, gravado e mostrado na edição.
test('cria agent com provider que só o schema oferece', async ({ page }) => {
  const id = 'e2e-agente-schema'
  await page.goto('/agents/new')
  await hydrated(page)
  await page.getByLabel(/^ID do agente/).fill(id)
  await page.getByLabel(/^Nome \*/).fill('Agente do schema')
  await page.getByLabel(/^Modelo \*/).fill('fake-model')
  const provider = page.getByRole('combobox', { name: /^Provedor \*/ })
  await expect(provider).toBeEnabled()
  await provider.click()
  await expect(page.getByRole('option', { name: 'Google Gemini' })).toHaveCount(0)
  await page.getByRole('option', { name: 'fake-llm' }).click()
  // O fake-llm exige URL base (P3-02): vazia, o form não envia.
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('fake-llm exige URL base')).toBeVisible()
  await page.getByLabel('URL base *').fill('http://llm.local:8080/v1')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Agente salvo').last()).toBeVisible()
  expect(await (await storedAgent(id)).json()).toMatchObject({
    factory_ia_model: 'fake-llm',
    base_url: 'http://llm.local:8080/v1'
  })

  await page.getByRole('link', { name: 'Agente do schema' }).first().click()
  await hydrated(page)
  await expect(page.getByRole('combobox', { name: /^Provedor \*/ })).toHaveText('fake-llm')
  await page.getByRole('button', { name: 'Excluir agente' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click()
  await expect(page.getByText('Agente excluído')).toBeVisible()
})

// P3-02: o editor cobre o documento inteiro. Cria com parâmetros, URL base,
// referência da chave, execução, memória e resumo; reabre com os mesmos valores;
// remove o que não quer mais (a chave sai do documento) e o RAG segue.
test('cria e edita agent com modelo, execução, memória e resumo', async ({ page }) => {
  const id = 'e2e-agente-editor'
  await page.goto('/agents/new')
  await hydrated(page)
  await page.getByLabel(/^ID do agente/).fill(id)
  await page.getByLabel(/^Nome \*/).fill('Agente do editor')
  await page.getByLabel(/^Modelo \*/).fill('fake-model')
  const provider = page.getByRole('combobox', { name: /^Provedor \*/ })
  await expect(provider).toBeEnabled()
  await provider.click()
  await page.getByRole('option', { name: 'fake-llm' }).click()
  await page.getByLabel('URL base *').fill('http://llm.local:8080/v1')
  await modelReference(page).getByRole('textbox', { name: 'Variável de ambiente' }).fill('FAKE_API_KEY')

  // Os nomes oferecidos são os do provider escolhido (fake-llm: temperature).
  await page.getByRole('button', { name: 'Adicionar parâmetro' }).click()
  await page.getByRole('combobox', { name: 'Nome do parâmetro 1' }).click()
  await expect(page.getByRole('option')).toHaveText(['temperature'])
  await page.getByRole('option', { name: 'temperature' }).click()
  await page.getByRole('textbox', { name: 'Valor de temperature' }).fill('0.7')
  await expect(page.getByText('número', { exact: true })).toBeVisible()

  // Execução: defaults do schema, e os que o usuário muda.
  const execution = page.getByRole('region', { name: 'Execução' })
  await expect(execution.getByRole('switch', { name: 'Responder em Markdown' })).toBeChecked()
  await expect(execution.getByRole('switch', { name: 'Memória do usuário' })).not.toBeChecked()
  await execution.getByRole('switch', { name: 'Responder em Markdown' }).click()
  await execution.getByRole('switch', { name: 'Raciocínio passo a passo' }).click()
  await expect(execution.getByText(/Mais chamadas ao modelo por resposta/)).toBeVisible()
  await execution.getByRole('spinbutton', { name: 'Execuções no histórico' }).fill('12')
  await execution.getByRole('switch', { name: 'Memória do usuário' }).click()
  await execution.getByRole('switch', { name: 'Resumo da sessão' }).click()
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Agente salvo').last()).toBeVisible()
  const saved = {
    factory_ia_model: 'fake-llm',
    model_params: { temperature: 0.7 },
    base_url: 'http://llm.local:8080/v1',
    api_key_ref: 'env:FAKE_API_KEY',
    markdown: false,
    add_history_to_context: true,
    num_history_runs: 12,
    add_datetime_to_context: true,
    reasoning: true,
    user_memory_active: true,
    summary_active: true,
    version: 1
  }
  expect(await (await storedAgent(id)).json()).toMatchObject(saved)

  // Reabre com os mesmos valores.
  await page.getByRole('link', { name: 'Agente do editor' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Editar agente' })).toBeVisible()
  await hydrated(page)
  await expect(page.getByLabel('URL base *')).toHaveValue('http://llm.local:8080/v1')
  await expect(modelReference(page).getByRole('textbox', { name: 'Variável de ambiente' })).toHaveValue(
    'FAKE_API_KEY'
  )
  await expect(modelReference(page).getByText('env:FAKE_API_KEY')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Valor de temperature' })).toHaveValue('0.7')
  const reopened = page.getByRole('region', { name: 'Execução' })
  await expect(reopened.getByRole('switch', { name: 'Responder em Markdown' })).not.toBeChecked()
  await expect(reopened.getByRole('switch', { name: 'Raciocínio passo a passo' })).toBeChecked()
  await expect(reopened.getByRole('spinbutton', { name: 'Execuções no histórico' })).toHaveValue('12')
  await expect(reopened.getByRole('switch', { name: 'Resumo da sessão' })).toBeChecked()

  // Remover o parâmetro e limpar a referência tira as chaves do documento.
  await page.getByRole('button', { name: 'Remover temperature' }).click()
  await modelReference(page).getByRole('textbox', { name: 'Variável de ambiente' }).fill('')
  await page.getByRole('button', { name: 'Salvar' }).click()

  // O toast da criação ainda pode estar na tela: espera o PUT pela versão gravada.
  await expect
    .poll(async () => ((await (await storedAgent(id)).json()) as { version: number }).version)
    .toBe(2)
  const edited = await (await storedAgent(id)).json()
  expect(edited).toMatchObject({ base_url: 'http://llm.local:8080/v1', version: 2 })
  expect(edited.model_params ?? null).toBeNull()
  expect(edited.api_key_ref ?? null).toBeNull()

  await page.getByRole('link', { name: 'Agente do editor' }).first().click()
  await hydrated(page)
  await page.getByRole('button', { name: 'Excluir agente' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click()
  await expect(page.getByText('Agente excluído')).toBeVisible()
})

test('valor recusado pelo orquestrador aparece no campo (URL base inválida)', async ({ page }) => {
  await page.goto('/agents/new')
  await hydrated(page)
  await page.getByLabel(/^ID do agente/).fill('e2e-agente-recusado')
  await page.getByLabel(/^Nome \*/).fill('Agente recusado')
  await page.getByLabel(/^Modelo \*/).fill('fake-model')
  await page.getByRole('combobox', { name: /^Provedor \*/ }).click()
  await page.getByRole('option', { name: 'fake-llm' }).click()
  await page.getByLabel('URL base *').fill('ftp://llm.local')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Valor recusado pelo orquestrador')).toBeVisible()
  await expect(page.getByLabel('URL base *')).toBeFocused()
  await expect(page).toHaveURL('/agents/new')
  expect((await storedAgent('e2e-agente-recusado')).status).toBe(404)
})

// A referência fora da regra (ou com o valor da chave colado) não sai do browser
// (V-P3-02-4, V-P3-05-4).
test('referência fora da regra é recusada no browser, sem requisição', async ({ page }) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url())
  })
  await page.goto('/agents/new')
  await hydrated(page)
  await page.getByLabel(/^ID do agente/).fill('e2e-agente-ref')
  await page.getByLabel(/^Nome \*/).fill('Agente ref')
  await page.getByLabel(/^Modelo \*/).fill('fake-model')
  await modelReference(page).getByRole('textbox', { name: 'Variável de ambiente' }).fill('sk-colado-no-campo')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText(/^Use MAIÚSCULAS, dígitos e _/)).toBeVisible()
  await expect(page.getByText(/^Use MAIÚSCULAS, dígitos e _/)).not.toContainText('sk-colado-no-campo')
  expect(writes).toEqual([])
  expect((await storedAgent('e2e-agente-ref')).status).toBe(404)
})

// P3-05: RAG com o documento inteiro (estratégia, embedder, URL base, referência
// da chave, parâmetros): grava, reabre com os mesmos valores, desliga e religa
// sem perder nada, e descarta de vez (V-P3-05-11, 12, 14, 16, 17).
test('cria e edita agent com RAG completo; desligar e religar mantém os valores', async ({ page }) => {
  const id = 'e2e-agente-rag'
  await page.goto('/agents/new')
  await hydrated(page)
  await page.getByLabel(/^ID do agente/).fill(id)
  await page.getByLabel(/^Nome \*/).fill('Agente RAG')
  await page.getByLabel(/^Modelo \*/).fill('fake-model')

  const rag = page.getByRole('region', { name: 'Configuração RAG' })
  await rag.getByRole('switch', { name: 'Habilitar RAG' }).click()
  await rag.getByRole('textbox', { name: 'Nome do documento *' }).fill('catalogo')
  const strategy = rag.getByRole('combobox', { name: 'Estratégia de busca *' })
  await expect(strategy).toBeEnabled()
  await expect(strategy).toHaveText('semantic')
  await strategy.click()
  await expect(page.getByRole('option')).toHaveText(['semantic', 'hierarchical'])
  await page.getByRole('option', { name: 'hierarchical' }).click()
  await rag.getByRole('combobox', { name: 'Provedor de embedding *' }).click()
  await page.getByRole('option', { name: 'fake-embed' }).click()
  await rag.getByRole('textbox', { name: 'Modelo de embedding *' }).fill('bge-small')
  await rag.getByLabel('URL base *').fill('http://embed.local:8080/v1')
  await rag.getByRole('textbox', { name: 'Variável de ambiente' }).fill('EMBED_API_KEY')
  await rag.getByRole('button', { name: 'Adicionar parâmetro' }).click()
  await rag.getByRole('combobox', { name: 'Nome do parâmetro 1' }).click()
  await expect(page.getByRole('option')).toHaveText(['dimensions', 'truncate'])
  await page.getByRole('option', { name: 'dimensions' }).click()
  await rag.getByRole('textbox', { name: 'Valor de dimensions' }).fill('384')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Agente salvo').last()).toBeVisible()
  const ragDocument = {
    active: true,
    doc_name: 'catalogo',
    model: 'bge-small',
    factory_ia_model: 'fake-embed',
    search_strategy: 'hierarchical',
    model_params: { dimensions: 384 },
    base_url: 'http://embed.local:8080/v1',
    api_key_ref: 'env:EMBED_API_KEY'
  }
  expect((await (await storedAgent(id)).json()).rag_config).toEqual(ragDocument)

  // Reabre com os mesmos valores.
  await page.getByRole('link', { name: 'Agente RAG' }).first().click()
  await hydrated(page)
  await expect(rag.getByRole('textbox', { name: 'Nome do documento *' })).toHaveValue('catalogo')
  await expect(rag.getByRole('combobox', { name: 'Estratégia de busca *' })).toHaveText('hierarchical')
  await expect(rag.getByRole('combobox', { name: 'Provedor de embedding *' })).toHaveText('fake-embed')
  await expect(rag.getByRole('textbox', { name: 'Modelo de embedding *' })).toHaveValue('bge-small')
  await expect(rag.getByLabel('URL base *')).toHaveValue('http://embed.local:8080/v1')
  await expect(rag.getByRole('textbox', { name: 'Variável de ambiente' })).toHaveValue('EMBED_API_KEY')
  await expect(rag.getByRole('textbox', { name: 'Valor de dimensions' })).toHaveValue('384')

  // Desligar e salvar grava active false com os valores; religar volta como estava.
  await rag.getByRole('switch', { name: 'Habilitar RAG' }).click()
  await expect(rag.getByText('catalogo · fake-embed/bge-small · hierarchical')).toBeVisible()
  await expect(rag.getByRole('textbox', { name: 'Nome do documento *' })).toBeHidden()
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect
    .poll(async () => ((await (await storedAgent(id)).json()) as { version: number }).version)
    .toBe(2)
  expect((await (await storedAgent(id)).json()).rag_config).toEqual({ ...ragDocument, active: false })

  await page.getByRole('link', { name: 'Agente RAG' }).first().click()
  await hydrated(page)
  await expect(rag.getByRole('switch', { name: 'Habilitar RAG' })).not.toBeChecked()
  await rag.getByRole('switch', { name: 'Habilitar RAG' }).click()
  await expect(rag.getByRole('textbox', { name: 'Nome do documento *' })).toHaveValue('catalogo')
  await expect(rag.getByRole('textbox', { name: 'Variável de ambiente' })).toHaveValue('EMBED_API_KEY')
  await expect(rag.getByRole('textbox', { name: 'Valor de dimensions' })).toHaveValue('384')

  // Descartar valores: o documento volta a rag_config null.
  await rag.getByRole('switch', { name: 'Habilitar RAG' }).click()
  await rag.getByRole('button', { name: 'Descartar valores' }).click()
  await expect(rag.getByRole('switch', { name: 'Habilitar RAG' })).toBeFocused()
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect
    .poll(async () => ((await (await storedAgent(id)).json()) as { version: number }).version)
    .toBe(3)
  expect((await (await storedAgent(id)).json()).rag_config ?? null).toBeNull()

  await page.getByRole('link', { name: 'Agente RAG' }).first().click()
  await hydrated(page)
  await page.getByRole('button', { name: 'Excluir agente' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click()
  await expect(page.getByText('Agente excluído')).toBeVisible()
})

// V-P3-05-14, V-P3-05-18: URL base obrigatória do embedder, e o 422 do
// orquestrador com o RAG desligado reabre os campos com o erro.
test('RAG: URL base obrigatória no cliente; 422 do orquestrador reabre os campos do RAG desligado', async ({ page }) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url())
  })
  await page.goto('/agents/new')
  await hydrated(page)
  await page.getByLabel(/^ID do agente/).fill('e2e-agente-rag-422')
  await page.getByLabel(/^Nome \*/).fill('Agente RAG 422')
  await page.getByLabel(/^Modelo \*/).fill('fake-model')
  const rag = page.getByRole('region', { name: 'Configuração RAG' })
  await rag.getByRole('switch', { name: 'Habilitar RAG' }).click()
  await rag.getByRole('textbox', { name: 'Nome do documento *' }).fill('catalogo')
  await rag.getByRole('combobox', { name: 'Provedor de embedding *' }).click()
  await page.getByRole('option', { name: 'fake-embed' }).click()
  await rag.getByRole('textbox', { name: 'Modelo de embedding *' }).fill('bge-small')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(rag.getByText('fake-embed exige URL base')).toBeVisible()
  expect(writes).toEqual([])

  // URL com esquema que o orquestrador recusa: 422 em rag_config.base_url, com o RAG desligado.
  await rag.getByLabel('URL base *').fill('ftp://embed.local')
  await rag.getByRole('switch', { name: 'Habilitar RAG' }).click()
  await expect(rag.getByRole('textbox', { name: 'Nome do documento *' })).toBeHidden()
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(rag.getByText(/com campos mostrados porque um deles tem erro/)).toBeVisible()
  await expect(rag.getByText('Valor recusado pelo orquestrador')).toBeVisible()
  await expect(rag.getByLabel('URL base *')).toBeFocused()
  await expect(rag.getByRole('switch', { name: 'Habilitar RAG' })).not.toBeChecked()
  await expect(page).toHaveURL('/agents/new')
  expect((await storedAgent('e2e-agente-rag-422')).status).toBe(404)
})
