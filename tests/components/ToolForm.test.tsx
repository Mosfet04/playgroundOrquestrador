import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { toolBodySchema } from '@/app/api/tools/schema'
import { ToolForm } from '@/components/management/tools/ToolForm'

import { server } from '../msw/server'

beforeAll(() => {
  // O jsdom não implementa estas APIs, que Switch e Select do Radix usam.
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

// O rótulo "Tipo" não está associado ao Select (sem htmlFor), então o
// combobox é achado pelo bloco do rótulo.
const typeSelect = () =>
  within(screen.getByText(/^Tipo/).parentElement as HTMLElement).getByRole(
    'combobox'
  )

function captureSave() {
  const bodies: unknown[] = []
  server.use(
    http.post('*/api/tools', async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({ success: true, message: 'ok' })
    })
  )
  return bodies
}

describe('ToolForm', () => {
  it('não envia descrição só com espaços', async () => {
    const bodies = captureSave()
    const user = userEvent.setup()
    render(<ToolForm onSuccess={() => {}} />)

    await user.type(screen.getByLabelText(/ID da Tool/), 'clima')
    await user.type(screen.getByLabelText(/^Nome/), 'Clima')
    await user.type(screen.getByLabelText(/^Rota/), 'https://clima.example.com/v1')
    await user.type(screen.getByLabelText(/^Descrição/), '   ')
    await user.click(screen.getByRole('button', { name: /salvar|criar/i }))

    expect(await screen.findByText('Descrição é obrigatória')).toBeVisible()
    // é a descrição que barra o envio, não outro campo em branco
    expect(screen.queryByText(/é obrigatóri[ao]$/, { selector: 'p' })).toBe(
      screen.getByText('Descrição é obrigatória')
    )
    expect(bodies).toEqual([])
  })

  it('envia o parâmetro float escolhido no seletor', async () => {
    const bodies = captureSave()
    const user = userEvent.setup()
    render(<ToolForm onSuccess={() => {}} />)

    await user.type(screen.getByLabelText(/ID da Tool/), 'clima')
    await user.type(screen.getByLabelText(/^Nome/), 'Clima')
    await user.type(screen.getByLabelText(/^Rota/), 'https://clima.example.com/v1')
    await user.type(screen.getByLabelText(/^Descrição/), 'Consulta o clima')
    await user.click(screen.getByRole('button', { name: 'Adicionar' }))
    await user.type(screen.getByPlaceholderText('nome_parametro'), 'latitude')
    await user.click(typeSelect())
    await user.click(await screen.findByRole('option', { name: 'float' }))
    await user.type(screen.getByPlaceholderText('Descrição do parâmetro'), 'Latitude')
    await user.click(screen.getByRole('button', { name: /salvar|criar/i }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({
      id: 'clima',
      description: 'Consulta o clima',
      parameters: [
        { name: 'latitude', type: 'float', description: 'Latitude', required: false }
      ]
    })
    // o que o form manda é o que o BFF aceita
    expect(toolBodySchema.safeParse(bodies[0]).success).toBe(true)
  })
})
