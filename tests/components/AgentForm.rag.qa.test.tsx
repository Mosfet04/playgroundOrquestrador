import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { agentBodySchema } from '@/app/api/agents/schema'
import { AgentForm } from '@/components/management/agents/AgentForm'
import type { AgentConfig } from '@/types/management'

import { renderWithIntl } from '../helpers/intl'
import { stubBrowserApis } from '../helpers/toolForm'
import { server } from '../msw/server'

// QA P3-05: o que AgentForm.rag.test.tsx não alcança. Reabrir e salvar sem
// editar o RAG desligado com tudo preenchido (valores fora do schema e da regra
// inalterados vão como estavam), e o RAG nos dois idiomas.

const LONG = 15_000

beforeAll(stubBrowserApis)

beforeEach(() =>
  server.use(
    http.get('*/api/tools', () =>
      HttpResponse.json({
        success: true,
        data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }
      })
    )
  )
)

const agent: AgentConfig = {
  id: 'assistente',
  nome: 'Assistente',
  model: 'm1',
  factoryIaModel: 'ollama',
  descricao: '',
  prompt: 'Seja útil.',
  active: true,
  tools_ids: [],
  version: 3
}

function serveSave() {
  const sent: Record<string, unknown>[] = []
  server.use(
    http.put('*/api/agents/:id', async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ success: true, data: {} })
    })
  )
  return sent
}

const card = (name = 'Configuração RAG') => within(screen.getByRole('region', { name }))

describe('RAG gravado desligado, reaberto e salvo sem editar', () => {
  it('estratégia fora do schema, parâmetro fora do provedor e referência fora da regra seguem no corpo', async () => {
    const sent = serveSave()
    const user = userEvent.setup()
    renderWithIntl(
      <AgentForm
        agent={{
          ...agent,
          rag_config: {
            active: false,
            doc_name: 'catalogo',
            model: 'bge-small',
            factoryIaModel: 'legacy-embed',
            search_strategy: 'legacy-strategy',
            model_params: { dimensions: 512, antigo: 'x' },
            base_url: 'http://embed.local/v1',
            api_key_ref: 'vault:prod/embed'
          }
        }}
        onSuccess={() => {}}
      />
    )
    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Provedor \*/ })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({
      rag_active: false,
      rag_doc_name: 'catalogo',
      rag_model: 'bge-small',
      rag_factoryIaModel: 'legacy-embed',
      rag_search_strategy: 'legacy-strategy',
      rag_model_params: { dimensions: 512, antigo: 'x' },
      rag_base_url: 'http://embed.local/v1',
      rag_api_key_ref: 'vault:prod/embed'
    })
    expect(agentBodySchema.omit({ id: true }).safeParse(sent[0]).success).toBe(true)
  }, LONG)
})

describe('RAG em inglês', () => {
  it('seção, seletor de segredo e resumo sem texto em português', async () => {
    const user = userEvent.setup()
    renderWithIntl(
      <AgentForm
        agent={{
          ...agent,
          rag_config: {
            active: true,
            doc_name: 'catalog',
            model: 'bge-small',
            factoryIaModel: 'openai',
            search_strategy: 'semantic',
            api_key_ref: 'env:embed_key'
          }
        }}
        onSuccess={() => {}}
      />,
      { locale: 'en' }
    )
    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Provider \*/ })).toBeEnabled())

    const region = card('RAG settings')
    expect(region.getByRole('switch', { name: 'Enable RAG' })).toBeChecked()
    expect(region.getByRole('combobox', { name: 'Format' })).toBeVisible()
    expect(region.getByText('Saved as')).toBeVisible()
    expect(region.getByText(/outside the orchestrator's rule/)).toBeVisible()

    await user.click(region.getByRole('switch', { name: 'Enable RAG' }))

    expect(region.getByText(/RAG is off\. The values stay saved/)).toBeVisible()
    const whole = screen.getByRole('region', { name: 'RAG settings' }).textContent ?? ''
    expect(whole).not.toMatch(/Descartar|Gravada como|Habilitar|Estratégia|ficam guardados|Variável de ambiente/)
    expect(region.getByRole('button', { name: 'Discard values' })).toBeVisible()
  }, LONG)
})
