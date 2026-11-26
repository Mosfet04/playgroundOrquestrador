import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AgentForm } from '@/components/management/agents/AgentForm'
import type { AgentConfig } from '@/types/management'

import { server } from '../msw/server'
import { SCHEMA_URL, schemaFixture } from '../msw/handlers'
import { renderWithIntl } from '../helpers/intl'
import { saveAndConfirm, touchName } from '../helpers/saveReview'

// QA1-11 (#23, V5/V6): o dropdown de provedor mostra rótulo + id e, nos pares
// que parecem provedores diferentes, a descrição curta; o valor gravado segue
// sendo o id.

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
})

const provider = (name: string) => ({
  name,
  modelParams: [],
  requiresBaseUrl: false
})

beforeEach(() => {
  server.use(
    http.get('*/api/tools', () =>
      HttpResponse.json({
        success: true,
        data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }
      })
    ),
    http.get(SCHEMA_URL, () =>
      HttpResponse.json({
        success: true,
        data: {
          ...schemaFixture,
          chatProviders: [
            'ollama',
            'gemini',
            'google',
            'azure',
            'azureopenai',
            'groq',
            'fake-llm'
          ].map(provider)
        }
      })
    )
  )
})

const agent: AgentConfig = {
  id: 'assistente',
  nome: 'Assistente',
  model: 'm1',
  factoryIaModel: 'ollama',
  descricao: '',
  prompt: '',
  active: true,
  tools_ids: [],
  version: 3
}

const trigger = () => screen.getByRole('combobox', { name: /^Provedor \*/ })
const option = (name: string) => screen.getByRole('option', { name })

async function openProviders(user: ReturnType<typeof userEvent.setup>) {
  renderWithIntl(<AgentForm agent={agent} onSuccess={() => {}} />)
  await waitFor(() => expect(trigger()).toBeEnabled())
  await user.click(trigger())
}

describe('dropdown de provedor', () => {
  it('lista cada provedor com rótulo e id; o par gemini/google e o par azure/azureopenai se distinguem pelo id', async () => {
    await openProviders(userEvent.setup())

    expect(screen.getAllByRole('option')).toHaveLength(7)
    for (const [name, id] of [
      ['Google Gemini gemini', 'gemini'],
      ['Google Gemini google', 'google'],
      ['Azure OpenAI azure', 'azure'],
      ['Azure OpenAI azureopenai', 'azureopenai']
    ]) {
      expect(within(option(name)).getByText(id)).toHaveClass(
        'font-mono',
        'text-xs',
        'text-muted-foreground'
      )
    }
    expect(option('Ollama ollama')).toBeInTheDocument()
    expect(option('Groq groq')).toBeInTheDocument()
  })

  it('os quatro pares têm a descrição curta; os demais, nenhuma', async () => {
    await openProviders(userEvent.setup())

    expect(
      within(option('Google Gemini gemini')).getByText(
        'Id principal do Gemini, da Google.'
      )
    ).toHaveClass('text-xs', 'text-muted-foreground')
    expect(
      within(option('Google Gemini google')).getByText(
        'Apelido de gemini: é o mesmo provedor.'
      )
    ).toBeVisible()
    expect(
      within(option('Azure OpenAI azure')).getByText(
        'Id principal do Azure OpenAI.'
      )
    ).toBeVisible()
    expect(
      within(option('Azure OpenAI azureopenai')).getByText(
        'Apelido de azure: é o mesmo provedor.'
      )
    ).toBeVisible()
    expect(option('Ollama ollama')).toHaveTextContent(/^Ollama ollama$/)
    expect(option('Groq groq')).toHaveTextContent(/^Groq groq$/)
  })

  it('provedor fora do mapa aparece como veio, uma vez só e sem descrição', async () => {
    await openProviders(userEvent.setup())

    expect(option('fake-llm')).toHaveTextContent(/^fake-llm$/)
  })

  it('a descrição é a do item no leitor de tela (aria-describedby)', async () => {
    await openProviders(userEvent.setup())

    const described = option('Google Gemini google').getAttribute(
      'aria-describedby'
    )
    expect(document.getElementById(described ?? '')).toHaveTextContent(
      'Apelido de gemini: é o mesmo provedor.'
    )
  })

  it('o trigger fechado mostra rótulo + id, sem a descrição, e salvar grava o id', async () => {
    const bodies: unknown[] = []
    server.use(
      http.put('*/api/agents/:id', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ success: true, data: {} })
      })
    )
    const user = userEvent.setup()
    await openProviders(user)

    await user.click(option('Google Gemini google'))

    expect(trigger()).toHaveTextContent(/^Google Gemini google$/)
    await touchName(user)
    await saveAndConfirm(user)
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ factoryIaModel: 'google' })
  })

  it('valor gravado fora do schema aparece com o rótulo do mapa', async () => {
    renderWithIntl(
      <AgentForm
        agent={{ ...agent, factoryIaModel: 'openai_compatible' }}
        onSuccess={() => {}}
      />
    )

    await waitFor(() => expect(trigger()).toBeEnabled())
    expect(trigger()).toHaveTextContent(
      /^Compatível com OpenAI openai_compatible$/
    )
  })
})
