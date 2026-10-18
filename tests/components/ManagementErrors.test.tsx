import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentForm } from '@/components/management/agents/AgentForm'
import { ToolManagement } from '@/components/management/tools/ToolManagement'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// P1-04: o texto que vem do BFF não aparece na UI. O toast usa o catálogo,
// escolhido pela ação e pelo status (409, 404, outros com o código). Erro de
// lista vira o bloco de erro na página, sem toast (P1-05). Excluir (no editor
// desde o P1-05b) em tests/components/EditorDelete.test.tsx.

const BFF_TEXT = 'mensagem crua do BFF'

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

const noTools = http.get('*/api/tools', () =>
  HttpResponse.json({
    success: true,
    data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }
  })
)

async function submitNewAgent(status: number, locale: 'pt-BR' | 'en' = 'pt-BR') {
  server.use(
    noTools,
    http.post('*/api/agents', () =>
      HttpResponse.json({ success: false, error: BFF_TEXT }, { status })
    )
  )
  const user = userEvent.setup()
  renderWithIntl(
    <>
      <AgentForm onSuccess={() => {}} />
      <Toaster />
    </>,
    { locale }
  )
  await user.type(screen.getByLabelText(/^(ID do agente|Agent ID)/), 'alfa')
  await user.type(screen.getByLabelText(/^(Nome|Name)/), 'Alfa')
  await user.type(screen.getByLabelText(/^(Modelo|Model) \*/), 'llama3.2')
  await user.click(screen.getByRole('button', { name: /^(Salvar|Save)$/ }))
}

describe('erros de gestão pelo catálogo', () => {
  it('409 ao criar agente: "Já existe um agente com este ID", sem o texto do BFF', async () => {
    await submitNewAgent(409)

    expect(await screen.findByText('Já existe um agente com este ID')).toBeInTheDocument()
    expect(screen.queryByText(BFF_TEXT)).not.toBeInTheDocument()
  })

  it('500 ao criar agente: a ação e o código, em EN', async () => {
    await submitNewAgent(500, 'en')

    expect(
      await screen.findByText("Couldn't save the agent (code 500)")
    ).toBeInTheDocument()
    expect(screen.queryByText(BFF_TEXT)).not.toBeInTheDocument()
  })

  it('erro ao carregar a lista de tools: bloco com a ação e o código, sem toast (P1-05)', async () => {
    server.use(
      http.get('*/api/tools', () =>
        HttpResponse.json({ success: false, error: BFF_TEXT }, { status: 503 })
      )
    )
    renderWithIntl(
      <>
        <ToolManagement />
        <Toaster />
      </>
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível carregar as tools')
    expect(within(alert).getByText('código 503')).toBeInTheDocument()
    expect(
      screen.queryByText('Não foi possível carregar as tools (código 503)')
    ).not.toBeInTheDocument()
    expect(screen.queryByText(BFF_TEXT)).not.toBeInTheDocument()
  })
})
