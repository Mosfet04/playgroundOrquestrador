import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { SignOutButton } from '@/components/layout/SignOutButton'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// P2-01: "Sair" faz POST /api/auth/logout e navega por completo para /login
// (limpa o store do chat); na falha, toast e a sessão continua.

const LOGOUT = '*/api/auth/logout'
const assign = vi.fn()

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      media: query,
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined
    }) as unknown as MediaQueryList
})

afterEach(() => {
  assign.mockReset()
  vi.unstubAllGlobals()
})

function renderButton() {
  vi.stubGlobal('location', { ...window.location, assign })
  renderWithIntl(
    <>
      <SignOutButton />
      <Toaster />
    </>
  )
  return userEvent.setup()
}

describe('SignOutButton', () => {
  it('sai e navega para /login', async () => {
    const onLogout = vi.fn()
    server.use(
      http.post(LOGOUT, () => {
        onLogout()
        return HttpResponse.json({ success: true })
      })
    )
    const user = renderButton()

    await user.click(screen.getByRole('button', { name: 'Sair' }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('durante a chamada: "Saindo…", ocupado e sem 2ª chamada', async () => {
    const onLogout = vi.fn()
    server.use(
      http.post(LOGOUT, async () => {
        onLogout()
        await delay('infinite')
        return HttpResponse.json({ success: true })
      })
    )
    const user = renderButton()

    await user.click(screen.getByRole('button', { name: 'Sair' }))
    const busy = await screen.findByRole('button', { name: 'Saindo…' })
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy).toHaveAttribute('aria-disabled', 'true')

    await user.click(busy)
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('sessão já vencida (401) também vai para /login', async () => {
    server.use(http.post(LOGOUT, () => HttpResponse.json({}, { status: 401 })))
    const user = renderButton()

    await user.click(screen.getByRole('button', { name: 'Sair' }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
  })

  it.each([
    ['503', () => new HttpResponse(null, { status: 503 })],
    ['sem resposta', () => HttpResponse.error()]
  ])('falha (%s): toast e o botão volta', async (_, reply) => {
    server.use(http.post(LOGOUT, reply))
    const user = renderButton()

    await user.click(screen.getByRole('button', { name: 'Sair' }))

    expect(
      await screen.findByText('Não foi possível sair.')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Verifique a conexão e tente de novo.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sair' })).not.toHaveAttribute(
      'aria-busy',
      'true'
    )
    expect(assign).not.toHaveBeenCalled()
  })
})
