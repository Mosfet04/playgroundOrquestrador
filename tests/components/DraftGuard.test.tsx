import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Link from 'next/link'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { PopStateGate } from '@/components/layout/PopStateGate'
import { DraftGuard } from '@/components/management/common/DraftGuard'

import { renderWithIntl } from '../helpers/intl'

// QA1-06 (#15): com rascunho, sair do formulário por um link da mesma aba ou
// pelo Voltar/Avançar do browser pede confirmação; recarregar/fechar arma o
// diálogo nativo (`beforeunload`). Sem rascunho, nada muda. Sem router (jsdom)
// o <Link> só chama o onClick: é ele o "navegar", que só roda se o guard deixar.

const navigate = vi.fn()
const signOut = vi.fn()
// O listener de popstate do App Router: registrado depois do PopStateGate (o
// efeito do layout raiz roda antes do efeito do router).
const routerPopState = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/agents/new')
})
afterEach(() => window.removeEventListener('popstate', routerPopState))

function Page({ draft, paused }: { draft: () => boolean; paused?: boolean }) {
  const go = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    navigate(event.currentTarget.getAttribute('href'))
  }
  return (
    <>
      <input aria-label="Nome" />
      <Link href="/agents" onClick={go}>
        Voltar
      </Link>
      <Link href="/agents" target="_blank" onClick={go}>
        Lista em nova aba
      </Link>
      <Link href="/agents/new#conteudo" onClick={go}>
        Pular para o conteúdo
      </Link>
      {/* Como o "Sair" do shell: sai da página sem ser link. */}
      <button type="button" data-leaves-page onClick={signOut}>
        Sair
      </button>
      <DraftGuard hasDraft={draft} paused={paused} />
    </>
  )
}

function renderWithRouter(draft: () => boolean, paused?: boolean) {
  renderWithIntl(
    <>
      <PopStateGate />
      <Page draft={draft} paused={paused} />
    </>
  )
  window.addEventListener('popstate', routerPopState)
}

const dialog = () => screen.queryByRole('dialog', { name: 'Descartar alterações?' })
const keep = () => screen.getByRole('button', { name: 'Continuar editando' })
const discard = () => screen.getByRole('button', { name: 'Descartar e sair' })
const back = () => screen.getByRole('link', { name: 'Voltar' })

describe('DraftGuard: links', () => {
  it('com rascunho, o link abre o aviso no lugar de navegar; foco em "Continuar editando"', async () => {
    const user = userEvent.setup()
    renderWithIntl(<Page draft={() => true} />)

    await user.click(back())

    expect(dialog()).toBeInTheDocument()
    expect(dialog()).toHaveAccessibleDescription(
      'Você tem alterações não salvas neste formulário. Se sair agora, elas serão perdidas.'
    )
    expect(keep()).toHaveFocus()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('"Continuar editando" fecha, não navega e devolve o foco ao link', async () => {
    const user = userEvent.setup()
    renderWithIntl(<Page draft={() => true} />)

    await user.click(back())
    await user.click(keep())

    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    expect(navigate).not.toHaveBeenCalled()
    expect(back()).toHaveFocus()
  })

  it('Esc é "Continuar editando"', async () => {
    const user = userEvent.setup()
    renderWithIntl(<Page draft={() => true} />)

    await user.click(back())
    await user.keyboard('{Escape}')

    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    expect(navigate).not.toHaveBeenCalled()
  })

  it('"Descartar e sair" conclui a navegação do link, uma vez só', async () => {
    const user = userEvent.setup()
    renderWithIntl(<Page draft={() => true} />)

    await user.click(back())
    const button = discard()
    await user.dblClick(button)

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/agents')
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
  })

  it('sem rascunho, o link navega direto', async () => {
    const user = userEvent.setup()
    renderWithIntl(<Page draft={() => false} />)

    await user.click(back())

    expect(navigate).toHaveBeenCalledWith('/agents')
    expect(dialog()).not.toBeInTheDocument()
  })

  it('o rascunho é lido na hora do clique', async () => {
    const user = userEvent.setup()
    let draft = false
    renderWithIntl(<Page draft={() => draft} />)

    await user.click(back())
    expect(navigate).toHaveBeenCalledTimes(1)

    draft = true
    await user.click(back())
    expect(dialog()).toBeInTheDocument()
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['Ctrl+clique', { ctrlKey: true }],
    ['Cmd+clique', { metaKey: true }],
    ['Shift+clique', { shiftKey: true }],
    ['botão do meio', { button: 1 }]
  ])('%s abre em outra aba/janela: sem aviso', (_, init) => {
    renderWithIntl(<Page draft={() => true} />)

    fireEvent.click(back(), init)

    expect(dialog()).not.toBeInTheDocument()
    expect(navigate).toHaveBeenCalledWith('/agents')
  })

  it('target=_blank e âncora da própria página: sem aviso', async () => {
    const user = userEvent.setup()
    renderWithIntl(<Page draft={() => true} />)

    await user.click(screen.getByRole('link', { name: 'Lista em nova aba' }))
    await user.click(screen.getByRole('link', { name: 'Pular para o conteúdo' }))

    expect(dialog()).not.toBeInTheDocument()
    expect(navigate).toHaveBeenCalledTimes(2)
  })
})

describe('DraftGuard: "Sair" (D-QA1-06-5)', () => {
  const signOutButton = () => screen.getByRole('button', { name: 'Sair' })

  it('com rascunho, o aviso vem antes do logout; "Continuar editando" não sai', async () => {
    const user = userEvent.setup()
    renderWithIntl(<Page draft={() => true} />)

    await user.click(signOutButton())
    expect(dialog()).toBeInTheDocument()
    await user.click(keep())

    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    expect(signOut).not.toHaveBeenCalled()
    expect(signOutButton()).toHaveFocus()
  })

  it('"Descartar e sair" faz o logout', async () => {
    const user = userEvent.setup()
    renderWithIntl(<Page draft={() => true} />)

    await user.click(signOutButton())
    await user.click(discard())

    expect(signOut).toHaveBeenCalledTimes(1)
  })

  // BUG-QA1-06-QA-1: o logout falhou (a página não descarregou); a próxima
  // interação rearma o guard, que volta a segurar links e o beforeunload.
  it('saída que não descarrega a página: o guard rearma na próxima interação', async () => {
    const user = userEvent.setup()
    renderWithIntl(<Page draft={() => true} />)

    await user.click(signOutButton())
    await user.click(discard())
    expect(signOut).toHaveBeenCalledTimes(1)

    await user.click(back())
    expect(dialog()).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
  })

  it('sem rascunho, sai direto', async () => {
    const user = userEvent.setup()
    renderWithIntl(<Page draft={() => false} />)

    await user.click(signOutButton())

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(dialog()).not.toBeInTheDocument()
  })
})

describe('DraftGuard: outro diálogo decide a saída (412 aberto)', () => {
  it('links e Voltar do browser passam; o beforeunload continua', async () => {
    const user = userEvent.setup()
    renderWithRouter(() => true, true)

    await user.click(back())
    window.history.pushState(null, '', '/agents')
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)

    expect(navigate).toHaveBeenCalledWith('/agents')
    expect(routerPopState).toHaveBeenCalledTimes(1)
    expect(dialog()).not.toBeInTheDocument()
    expect(event.defaultPrevented).toBe(true)
  })
})

// Índice da entrada (Navigation API), que o jsdom não tem: o teste o move.
let index: number | undefined
const navigation = { get currentEntry() { return index === undefined ? null : { index } } }
beforeAll(() => Object.defineProperty(window, 'navigation', { value: navigation, configurable: true }))
afterAll(() => Reflect.deleteProperty(window, 'navigation'))
beforeEach(() => {
  index = 5
})

describe('DraftGuard: Voltar/Avançar do browser', () => {
  // O browser já trocou a entrada quando o popstate chega: o guard volta à do
  // formulário pelo índice da Navigation API e o App Router não o vê.
  const browserBack = () => {
    index = (index ?? 0) - 1
    window.history.pushState(null, '', '/agents')
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
  }

  it('com rascunho: aviso, a entrada do formulário volta e o router não navega', async () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined)
    renderWithRouter(() => true)

    browserBack()

    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeInTheDocument()
    expect(go).toHaveBeenCalledWith(1)
    expect(routerPopState).not.toHaveBeenCalled()
  })

  it('"Descartar e sair" refaz o passo, e o router segue o popstate', async () => {
    const user = userEvent.setup()
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined)
    renderWithRouter(() => true)
    browserBack()
    // O retorno à entrada do formulário (history.go(1)) também é do guard.
    window.history.replaceState(null, '', '/agents/new')
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    expect(routerPopState).not.toHaveBeenCalled()

    await user.click(await screen.findByRole('button', { name: 'Descartar e sair' }))

    expect(go).toHaveBeenLastCalledWith(-1)
    browserBack()
    expect(routerPopState).toHaveBeenCalledTimes(1)
    expect(dialog()).not.toBeInTheDocument()
  })

  it('Avançar dois passos: volta dois e "Descartar e sair" os refaz', async () => {
    const user = userEvent.setup()
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined)
    renderWithRouter(() => true)

    index = 7
    window.history.pushState(null, '', '/teams')
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    expect(go).toHaveBeenCalledWith(-2)
    await user.click(await screen.findByRole('button', { name: 'Descartar e sair' }))

    expect(go).toHaveBeenLastCalledWith(2)
  })

  // Sem o índice não dá para saber a direção (history.go(1) sem entrada à
  // frente não dispara popstate): só o beforeunload segura.
  it('sem a Navigation API, o popstate é do router', () => {
    index = undefined
    const go = vi.spyOn(window.history, 'go')
    renderWithRouter(() => true)

    browserBack()

    expect(routerPopState).toHaveBeenCalledTimes(1)
    expect(go).not.toHaveBeenCalled()
    expect(dialog()).not.toBeInTheDocument()
  })

  it('sem rascunho, o popstate é do router', () => {
    const go = vi.spyOn(window.history, 'go')
    renderWithRouter(() => false)

    browserBack()

    expect(routerPopState).toHaveBeenCalledTimes(1)
    expect(go).not.toHaveBeenCalled()
    expect(dialog()).not.toBeInTheDocument()
  })
})

describe('DraftGuard: recarregar e fechar', () => {
  const unload = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event
  }

  it('com rascunho, o beforeunload pede o diálogo nativo', () => {
    renderWithIntl(<Page draft={() => true} />)
    expect(unload().defaultPrevented).toBe(true)
  })

  it('sem rascunho, não', () => {
    renderWithIntl(<Page draft={() => false} />)
    expect(unload().defaultPrevented).toBe(false)
  })

  it('desmontado, não', () => {
    const { unmount } = renderWithIntl(<Page draft={() => true} />)
    unmount()
    expect(unload().defaultPrevented).toBe(false)
  })
})
