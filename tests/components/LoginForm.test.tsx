import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { LoginForm } from '@/app/login/LoginForm'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// P2-01 (docs/design/P2-01.md, E0–E7): formulário de login. Sem o App Router
// no jsdom: só o replace do router é observado.
const router = vi.hoisted(() => ({ replace: (href: string) => href }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const LOGIN = '*/api/auth/login'

function renderForm({ next = '/', expired = false } = {}) {
  const user = userEvent.setup()
  renderWithIntl(<LoginForm next={next} expired={expired} />)
  return {
    user,
    username: screen.getByLabelText('Usuário'),
    password: screen.getByLabelText('Senha'),
    submit: screen.getByRole('button', { name: 'Entrar' })
  }
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  password = 'senha'
) {
  await user.type(screen.getByLabelText('Usuário'), 'playground')
  await user.type(screen.getByLabelText('Senha'), password)
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('LoginForm', () => {
  it('E0: campos com autocomplete, sem aviso e foco no Usuário', async () => {
    const { username, password } = renderForm()

    await waitFor(() => expect(username).toHaveFocus())
    expect(username).toHaveAttribute('autocomplete', 'username')
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('E1: vazio mostra o erro de cada campo, sem requisição, e foca o 1º inválido', async () => {
    const onRequest = vi.fn()
    server.use(http.post(LOGIN, () => onRequest()))
    const { user, username, password, submit } = renderForm()

    await user.click(submit)

    expect(await screen.findByText('Informe o usuário.')).toBeInTheDocument()
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument()
    expect(username).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(username).toHaveAccessibleDescription('Informe o usuário.')
    await waitFor(() => expect(username).toHaveFocus())
    expect(onRequest).not.toHaveBeenCalled()
  })

  it('E2: enviando mostra "Entrando…" e o 2º clique não gera 2ª requisição', async () => {
    const onRequest = vi.fn()
    server.use(
      http.post(LOGIN, async () => {
        onRequest()
        await delay('infinite')
        return HttpResponse.json({ success: true })
      })
    )
    const { user, username } = renderForm()

    await fillAndSubmit(user)
    const busy = await screen.findByRole('button', { name: 'Entrando…' })
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy).toHaveAttribute('aria-disabled', 'true')
    expect(username).toHaveAttribute('readonly')

    await user.click(busy)
    expect(onRequest).toHaveBeenCalledTimes(1)
  })

  it('sucesso: vai para o next', async () => {
    const replace = vi.spyOn(router, 'replace')
    let body: unknown
    server.use(
      http.post(LOGIN, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ success: true })
      })
    )
    const { user } = renderForm({ next: '/agents' })

    await fillAndSubmit(user, 'minha senha')

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/agents'))
    expect(body).toEqual({ username: 'playground', password: 'minha senha' })
  })

  it('E3: 401 mostra o aviso genérico, limpa e foca a Senha, mantém o Usuário', async () => {
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json(
          { success: false, error: 'invalid_credentials' },
          { status: 401 }
        )
      )
    )
    const { user, username, password } = renderForm()

    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Usuário ou senha incorretos.')
    expect(alert).toHaveTextContent('Confira os dois campos e tente de novo.')
    expect(password).toHaveValue('')
    await waitFor(() => expect(password).toHaveFocus())
    expect(username).toHaveValue('playground')
    expect(username).not.toHaveAttribute('aria-invalid', 'true')
    expect(password).not.toHaveAttribute('aria-invalid', 'true')
  })

  it.each([
    ['300', 'Tente de novo em 5 min.'],
    ['45', 'Tente de novo em 45 s.'],
    ['61', 'Tente de novo em 2 min.']
  ])(
    'E4: 429 com Retry-After %s: "%s" e Entrar desabilitado',
    async (retryAfter, text) => {
      server.use(
        http.post(LOGIN, () =>
          HttpResponse.json(
            { success: false },
            { status: 429, headers: { 'Retry-After': retryAfter } }
          )
        )
      )
      const { user } = renderForm()

      await fillAndSubmit(user)

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Muitas tentativas.')
      expect(alert).toHaveTextContent(text)
      const submit = screen.getByRole('button', { name: 'Entrar' })
      expect(submit).toBeDisabled()
      expect(submit).toHaveAccessibleDescription(/Muitas tentativas/)
    }
  )

  it('E4: no fim do prazo o aviso some e Entrar volta', async () => {
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json(
          { success: false },
          { status: 429, headers: { 'Retry-After': '1' } }
        )
      )
    )
    const { user } = renderForm()

    await fillAndSubmit(user)
    await screen.findByRole('alert')

    await waitFor(
      () => expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
      {
        timeout: 2000
      }
    )
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
  })

  it('E5: 429 sem Retry-After: "Aguarde alguns minutos" e Entrar habilitado', async () => {
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json({ success: false }, { status: 429 })
      )
    )
    const { user } = renderForm()

    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Aguarde alguns minutos e tente de novo.'
    )
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
  })

  it('E6: 503 mostra "Não foi possível entrar agora." com "código 503"; a senha fica', async () => {
    server.use(http.post(LOGIN, () => new HttpResponse(null, { status: 503 })))
    const { user, password } = renderForm()

    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível entrar agora.')
    expect(alert).toHaveTextContent('Verifique a conexão e tente de novo.')
    expect(alert).toHaveTextContent('código 503')
    expect(password).toHaveValue('senha')
  })

  it('E6: sem resposta mostra "offline"', async () => {
    server.use(http.post(LOGIN, () => HttpResponse.error()))
    const { user } = renderForm()

    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('offline')
  })

  it('o aviso novo substitui o anterior', async () => {
    let status = 401
    server.use(
      http.post(LOGIN, () => HttpResponse.json({ success: false }, { status }))
    )
    const { user } = renderForm()

    await fillAndSubmit(user)
    await screen.findByText('Usuário ou senha incorretos.')
    status = 503
    await user.type(screen.getByLabelText('Senha'), 'outra')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    await screen.findByText('Não foi possível entrar agora.')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('E7: sessão expirada mostra o aviso informativo, que some no 1º envio', async () => {
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json({ success: false }, { status: 401 })
      )
    )
    const { user } = renderForm({ expired: true })

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Sua sessão expirou.')
    expect(status).toHaveTextContent(
      'Entre de novo para voltar à página em que estava.'
    )

    await fillAndSubmit(user)

    await screen.findByRole('alert')
    expect(screen.queryByText('Sua sessão expirou.')).not.toBeInTheDocument()
  })

  it('em EN', async () => {
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json({ success: false }, { status: 401 })
      )
    )
    const user = userEvent.setup()
    renderWithIntl(<LoginForm next="/" expired={false} />, { locale: 'en' })

    await user.type(screen.getByLabelText('Username'), 'x')
    await user.type(screen.getByLabelText('Password'), 'y')
    await act(() => user.click(screen.getByRole('button', { name: 'Sign in' })))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect username or password.'
    )
  })
})
