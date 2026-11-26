import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  NuqsTestingAdapter,
  type OnUrlUpdateFunction
} from 'nuqs/adapters/testing'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ModeSelector } from '@/components/playground/Sidebar/ModeSelector'
import { usePlaygroundStore } from '@/store'

import { IntlProvider } from '../helpers/intl'

const agent = {
  value: 'agent-1',
  label: 'Assistente',
  model: { provider: 'OpenAI' }
}
const team = {
  value: 'team-1',
  label: 'Time de suporte',
  model: { provider: 'OpenAI' },
  storage: true
}

const initialStoreState = usePlaygroundStore.getState()

function renderModeSelector(searchParams = '') {
  const onUrlUpdate = vi.fn<OnUrlUpdateFunction>()
  render(
    <IntlProvider>
      <NuqsTestingAdapter searchParams={searchParams} onUrlUpdate={onUrlUpdate}>
        <p id="rotulo">Conversar com</p>
        <ModeSelector labelledBy="rotulo" />
      </NuqsTestingAdapter>
    </IntlProvider>
  )
  return { onUrlUpdate }
}

// P1-06: segmentado Agente | Team (aria-pressed); o lado sem entidades fica
// desabilitado (aria-disabled, QA1-11 #28: segue focável para explicar o motivo).
const segment = (name: 'Agente' | 'Team') =>
  within(screen.getByRole('group', { name: 'Conversar com' })).getByRole('button', { name })

beforeAll(() => {
  // O jsdom não implementa estas APIs, que o Select do Radix usa ao abrir.
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
})

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
})

describe('ModeSelector', () => {
  it('sem agentes nem times: os dois lados desabilitados', () => {
    renderModeSelector()

    expect(segment('Agente')).toHaveAttribute('aria-disabled', 'true')
    expect(segment('Team')).toHaveAttribute('aria-disabled', 'true')
  })

  it('só agentes: Agente pressionado e Team desabilitado', () => {
    usePlaygroundStore.setState({ agents: [agent] })
    renderModeSelector()

    expect(segment('Agente')).toHaveAttribute('aria-pressed', 'true')
    expect(segment('Agente')).not.toHaveAttribute('aria-disabled')
    expect(segment('Team')).toHaveAttribute('aria-pressed', 'false')
    expect(segment('Team')).toHaveAttribute('aria-disabled', 'true')
  })

  it('troca sozinho para Team quando só há times', async () => {
    usePlaygroundStore.setState({ teams: [team], mode: 'agent' })
    renderModeSelector()

    await waitFor(() => expect(segment('Team')).toHaveAttribute('aria-pressed', 'true'))
    expect(segment('Agente')).toHaveAttribute('aria-disabled', 'true')
    expect(usePlaygroundStore.getState().mode).toBe('team')
  })

  // QA1-02 (D-QA1-0-4): a aba vai à URL no clique, com o 1º team; um reload
  // antes da carga seguinte do orquestrador volta na aba Team.
  it('ao escolher Team troca o agente e a sessão da URL pelo 1º team e limpa as mensagens', async () => {
    const user = userEvent.setup()
    usePlaygroundStore.setState({
      agents: [agent],
      teams: [team],
      mode: 'agent',
      messages: [{ role: 'user', content: 'oi', created_at: 1 }]
    })
    const { onUrlUpdate } = renderModeSelector(
      '?agent=agent-1&session=session-a1'
    )

    expect(segment('Agente')).toHaveAttribute('aria-pressed', 'true')
    expect(segment('Team')).not.toHaveAttribute('aria-disabled')

    await user.click(segment('Team'))

    expect(segment('Team')).toHaveAttribute('aria-pressed', 'true')
    expect(segment('Agente')).toHaveAttribute('aria-pressed', 'false')
    const state = usePlaygroundStore.getState()
    expect(state.mode).toBe('team')
    expect(state.messages).toEqual([])
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled())
    expect(onUrlUpdate.mock.lastCall?.[0].queryString).toBe('?team=team-1')
    expect(state.hasStorage).toBe(true)
  })

  it('clique duplo em Team: uma troca só', async () => {
    const user = userEvent.setup()
    usePlaygroundStore.setState({ agents: [agent], teams: [team], mode: 'agent' })
    const { onUrlUpdate } = renderModeSelector('?agent=agent-1')

    await user.dblClick(segment('Team'))
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled())

    expect(onUrlUpdate).toHaveBeenCalledTimes(1)
    expect(onUrlUpdate.mock.lastCall?.[0].queryString).toBe('?team=team-1')
    expect(usePlaygroundStore.getState().mode).toBe('team')
  })

  it('de volta para Agente: o 1º agente na URL, com o storage dele', async () => {
    const user = userEvent.setup()
    usePlaygroundStore.setState({ agents: [agent], teams: [team], mode: 'team' })
    const { onUrlUpdate } = renderModeSelector('?team=team-1&session=session-t1')

    await user.click(segment('Agente'))

    await waitFor(() =>
      expect(onUrlUpdate.mock.lastCall?.[0].queryString).toBe('?agent=agent-1')
    )
    expect(usePlaygroundStore.getState().hasStorage).toBe(false)
  })
  // QA1-11 (#28, V13-V16): a aba desligada continua focável e explica o motivo,
  // por hover e por teclado; clicar ou Enter não faz nada.
  describe('aba desabilitada', () => {
    it('Team sem teams: aria-disabled, focável por Tab e com o motivo no hover', async () => {
      const user = userEvent.setup()
      usePlaygroundStore.setState({ agents: [agent] })
      renderModeSelector()

      expect(segment('Team')).not.toBeDisabled()
      await user.hover(segment('Team'))

      expect(await screen.findByRole('tooltip')).toHaveTextContent('Crie um team primeiro')
    })

    it('o tooltip abre no foco por teclado e o Esc o fecha', async () => {
      const user = userEvent.setup()
      usePlaygroundStore.setState({ agents: [agent] })
      renderModeSelector()

      await user.tab()
      await user.tab()
      expect(segment('Team')).toHaveFocus()
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Crie um team primeiro')

      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
    })

    it('o motivo também vai por aria-describedby, sem abrir o tooltip', () => {
      usePlaygroundStore.setState({ agents: [agent] })
      renderModeSelector()

      const described = segment('Team').getAttribute('aria-describedby')
      expect(described).toBeTruthy()
      expect(document.getElementById(described ?? '')).toHaveTextContent('Crie um team primeiro')
      expect(segment('Agente')).not.toHaveAttribute('aria-describedby')
    })

    it('clique e Enter na aba desabilitada não mudam o modo nem a URL', async () => {
      const user = userEvent.setup()
      usePlaygroundStore.setState({ agents: [agent], mode: 'agent' })
      const { onUrlUpdate } = renderModeSelector('?agent=agent-1')

      await user.click(segment('Team'))
      segment('Team').focus()
      await user.keyboard('{Enter}')
      await user.keyboard(' ')

      expect(usePlaygroundStore.getState().mode).toBe('agent')
      expect(segment('Agente')).toHaveAttribute('aria-pressed', 'true')
      expect(onUrlUpdate).not.toHaveBeenCalled()
    })

    it('Agente sem agentes recebe o mesmo tratamento', async () => {
      const user = userEvent.setup()
      usePlaygroundStore.setState({ teams: [team] })
      renderModeSelector()

      await user.hover(segment('Agente'))

      expect(await screen.findByRole('tooltip')).toHaveTextContent('Crie um agente primeiro')
    })
  })
})
