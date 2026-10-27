import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { teamBodySchema } from '@/app/api/teams/schema'
import { TeamForm } from '@/components/management/teams/TeamForm'
import type { TeamConfig } from '@/types/management'

import { renderWithIntl } from '../helpers/intl'
import { server } from '../msw/server'

// QA P3-04: reabrir um team completo e salvar sem editar devolve o mesmo
// documento (aceito pelo zod do BFF); limpar os opcionais tira-os do corpo.

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

const full: TeamConfig = {
  id: 'suporte',
  nome: 'Suporte',
  descricao: 'Time de suporte',
  prompt: 'Escolha o melhor membro.',
  active: false,
  member_ids: ['pesquisador', 'suporte-local'],
  mode: 'route',
  factoryIaModel: 'ollama',
  model: 'llama3.2',
  model_params: { temperature: 0.2, stop: 'FIM', stream: true },
  base_url: 'http://llm.local:8080/v1',
  api_key_ref: 'env:OLLAMA_API_KEY',
  markdown: false,
  add_history_to_context: false,
  user_memory_active: true,
  summary_active: true,
  version: 7
}

const agent = (id: string) => ({
  id,
  nome: id,
  descricao: '',
  prompt: '',
  active: true,
  tools_ids: [],
  factoryIaModel: 'openai',
  model: 'gpt-4o',
  version: 1
})

function serve() {
  const sent: Record<string, unknown>[] = []
  server.use(
    http.get('*/api/agents', () =>
      HttpResponse.json({
        success: true,
        data: { data: [agent('suporte-local'), agent('pesquisador')], total: 2, page: 1, limit: 100, totalPages: 1 }
      })
    ),
    http.put('*/api/teams/:id', async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ success: true, data: {} })
    })
  )
  return sent
}

async function open() {
  const user = userEvent.setup()
  renderWithIntl(
    <>
      <TeamForm team={full} onSuccess={() => {}} />
      <Toaster />
    </>
  )
  await waitFor(() => expect(screen.getByRole('combobox', { name: /^Provedor \*/ })).toBeEnabled())
  await screen.findByRole('checkbox', { name: /pesquisador/ })
  return user
}

describe('TeamForm: reabrir e salvar', () => {
  it('sem editar nada, o PUT leva o documento gravado (membros na ordem, inativo, parâmetros tipados)', async () => {
    const sent = serve()
    const user = await open()

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({
      nome: 'Suporte',
      descricao: 'Time de suporte',
      prompt: 'Escolha o melhor membro.',
      active: false,
      member_ids: ['pesquisador', 'suporte-local'],
      mode: 'route',
      factoryIaModel: 'ollama',
      model: 'llama3.2',
      model_params: { temperature: 0.2, stop: 'FIM', stream: true },
      base_url: 'http://llm.local:8080/v1',
      api_key_ref: 'env:OLLAMA_API_KEY',
      markdown: false,
      add_history_to_context: false,
      user_memory_active: true,
      summary_active: true
    })
    expect(teamBodySchema.omit({ id: true }).safeParse(sent[0]).success).toBe(true)
  })

  it('limpar base_url e api_key_ref tira os dois do documento (vazio ou ausente)', async () => {
    const sent = serve()
    const user = await open()
    const model = screen.getByRole('region', { name: 'Modelo do líder' })

    await user.clear(within(model).getByLabelText(/^URL base/))
    await user.clear(within(model).getByLabelText(/^Referência da chave/))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].base_url || undefined).toBeUndefined()
    expect(sent[0].api_key_ref || undefined).toBeUndefined()
    expect(sent[0].model_params).toEqual({ temperature: 0.2, stop: 'FIM', stream: true })
  })
})
