import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AgentForm } from '@/components/management/agents/AgentForm'
import { errorA11y, FieldError } from '@/components/management/common/FieldError'
import { TeamForm } from '@/components/management/teams/TeamForm'
import { ToolForm } from '@/components/management/tools/ToolForm'

import { renderWithIntl } from '../helpers/intl'
import { server } from '../msw/server'

// QA1-05 (docs/design/QA1-05.md § 2, § 7): o padrão único de campo e de erro.
// O slot de erro fica sempre montado (reserva o espaço); o controle inválido
// leva `aria-invalid` e aponta o slot em `aria-describedby`.

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

describe('FieldError', () => {
  it('sem erro: o slot segue montado, vazio, anunciável e com a altura reservada', () => {
    render(<FieldError id="nome-error" />)

    const slot = document.getElementById('nome-error')
    expect(slot).toBeInTheDocument()
    expect(slot).toBeEmptyDOMElement()
    expect(slot).toHaveAttribute('aria-live', 'polite')
    expect(slot).toHaveClass('min-h-5')
  })

  it('com erro: ícone decorativo e o texto, no mesmo slot', () => {
    render(<FieldError id="nome-error" message="Informe o nome" />)

    const slot = document.getElementById('nome-error') as HTMLElement
    expect(slot).toHaveTextContent('Informe o nome')
    const icon = slot.querySelector('svg')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('aceita conteúdo rico (ReactNode) como mensagem', () => {
    render(<FieldError id="route-error" message={<code>{'{id}'}</code>} />)

    expect(document.getElementById('route-error')?.querySelector('code')).toHaveTextContent('{id}')
  })
})

describe('errorA11y', () => {
  it('válido: aponta o slot (vazio) e não marca inválido', () => {
    expect(errorA11y('nome', false)).toEqual({
      'aria-invalid': undefined,
      'aria-describedby': 'nome-error'
    })
  })

  it('inválido: aria-invalid e o slot por último, depois da ajuda', () => {
    expect(errorA11y('route', true, 'route-help', false, undefined, 'route-missing')).toEqual({
      'aria-invalid': true,
      'aria-describedby': 'route-help route-missing route-error'
    })
  })
})

// Todo controle inválido aponta um slot existente, com a mensagem e o ícone.
function expectInvalidFieldsDescribed() {
  const invalid = Array.from(document.querySelectorAll('[aria-invalid="true"]'))
  expect(invalid.length).toBeGreaterThan(0)
  for (const control of invalid) {
    const ids = (control.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
    const slot = document.getElementById(ids[ids.length - 1] ?? '')
    expect(slot, `slot de ${control.id}`).toBeInTheDocument()
    expect(slot?.textContent?.trim(), `mensagem de ${control.id}`).not.toBe('')
    expect(slot?.querySelector('svg'), `ícone de ${control.id}`).toBeInTheDocument()
    expect(slot).toHaveAttribute('aria-live', 'polite')
  }
  // Nenhum aria-describedby sem alvo no DOM (V9).
  for (const element of document.querySelectorAll('[aria-describedby]')) {
    for (const id of (element.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)) {
      expect(document.getElementById(id), `alvo ${id}`).toBeInTheDocument()
    }
  }
  return invalid
}

const emptyList = () =>
  HttpResponse.json({ success: true, data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 } })

describe('padrão de erro nos três formulários (Salvar vazio)', () => {
  beforeEach(() => {
    server.use(http.get('*/api/tools', emptyList), http.get('*/api/agents', emptyList))
  })

  it('agent: id, nome e modelo inválidos apontam o slot com mensagem e ícone', async () => {
    const user = userEvent.setup()
    renderWithIntl(<AgentForm onSuccess={() => {}} />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Provedor \*/ })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    const invalid = await waitFor(() => {
      const found = document.querySelectorAll('[aria-invalid="true"]')
      expect(found.length).toBeGreaterThanOrEqual(3)
      return found
    })
    expect(Array.from(invalid).map((control) => control.id)).toEqual(
      expect.arrayContaining(['id', 'nome', 'model'])
    )
    expectInvalidFieldsDescribed()
  })

  it('team: id, nome e modelo inválidos apontam o slot', async () => {
    const user = userEvent.setup()
    renderWithIntl(<TeamForm onSuccess={() => {}} />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Provedor \*/ })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(document.querySelectorAll('[aria-invalid="true"]').length).toBeGreaterThanOrEqual(3))
    const ids = Array.from(document.querySelectorAll('[aria-invalid="true"]')).map((control) => control.id)
    expect(ids).toEqual(expect.arrayContaining(['id', 'nome', 'model']))
    expectInvalidFieldsDescribed()
  })

  it('tool: id, nome, descrição e rota inválidos apontam o slot', async () => {
    const user = userEvent.setup()
    renderWithIntl(<ToolForm onSuccess={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(document.querySelectorAll('[aria-invalid="true"]').length).toBeGreaterThanOrEqual(4))
    const ids = Array.from(document.querySelectorAll('[aria-invalid="true"]')).map((control) => control.id)
    expect(ids).toEqual(expect.arrayContaining(['id', 'name', 'description', 'route']))
    expectInvalidFieldsDescribed()
  })
})
