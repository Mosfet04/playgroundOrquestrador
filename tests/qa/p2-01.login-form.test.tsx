import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { LoginForm } from '@/app/login/LoginForm'

import { renderWithIntl } from '../helpers/intl'
import { server } from '../msw/server'

// QA P2-01: teclado e respostas fora do roteiro do dev (E0-E7).
const router = vi.hoisted(() => ({ replace: (href: string) => href }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const LOGIN = '*/api/auth/login'

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Usuário'), 'playground')
  await user.type(screen.getByLabelText('Senha'), 'x')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('QA LoginForm: teclado', () => {
  it('Tab percorre Usuário, Senha e Entrar; Enter na senha envia uma vez', async () => {
    const replace = vi.spyOn(router, 'replace')
    const onRequest = vi.fn()
    server.use(
      http.post(LOGIN, async ({ request }) => {
        onRequest(await request.json())
        return HttpResponse.json({ success: true })
      })
    )
    const user = userEvent.setup()
    renderWithIntl(<LoginForm next="/agents" expired={false} />)

    await waitFor(() => expect(screen.getByLabelText('Usuário')).toHaveFocus())
    await user.keyboard('playground{Tab}')
    expect(screen.getByLabelText('Senha')).toHaveFocus()
    await user.keyboard('segredo{Tab}')
    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveFocus()
    await user.click(screen.getByLabelText('Senha'))
    await user.keyboard('{Enter}')

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/agents'))
    expect(onRequest).toHaveBeenCalledTimes(1)
    expect(onRequest).toHaveBeenCalledWith({
      username: 'playground',
      password: 'segredo'
    })
  })

  it('o usuário é enviado sem espaços nas pontas; a senha, intacta', async () => {
    const onRequest = vi.fn()
    server.use(
      http.post(LOGIN, async ({ request }) => {
        onRequest(await request.json())
        return HttpResponse.json({ success: true })
      })
    )
    const user = userEvent.setup()
    renderWithIntl(<LoginForm next="/" expired={false} />)

    await user.type(screen.getByLabelText('Usuário'), '  playground ')
    await user.type(screen.getByLabelText('Senha'), ' com espaço ')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => expect(onRequest).toHaveBeenCalled())
    expect(onRequest).toHaveBeenCalledWith({
      username: 'playground',
      password: ' com espaço '
    })
  })
})

describe('QA LoginForm: respostas inesperadas', () => {
  it('500 com corpo HTML: mensagem própria com o código, sem eco do corpo', async () => {
    server.use(
      http.post(
        LOGIN,
        () => new HttpResponse('<h1>boom</h1>', { status: 500 })
      )
    )
    const user = userEvent.setup()
    renderWithIntl(<LoginForm next="/" expired={false} />)

    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível entrar agora.')
    expect(alert).toHaveTextContent('código 500')
    expect(alert).not.toHaveTextContent('boom')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
  })

  it.each(['abc', '-5', '0'])(
    '429 com Retry-After %j vale como ausente: dica genérica e Entrar habilitado',
    async (retryAfter) => {
      server.use(
        http.post(
          LOGIN,
          () =>
            new HttpResponse(null, {
              status: 429,
              headers: { 'Retry-After': retryAfter }
            })
        )
      )
      const user = userEvent.setup()
      renderWithIntl(<LoginForm next="/" expired={false} />)

      await fillAndSubmit(user)

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Muitas tentativas.')
      expect(alert).toHaveTextContent('Aguarde alguns minutos')
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
    }
  )
})
