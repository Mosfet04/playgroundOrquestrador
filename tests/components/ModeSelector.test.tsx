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
  model: { provider: 'OpenAI' }
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
// desabilitado.
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

    expect(segment('Agente')).toBeDisabled()
    expect(segment('Team')).toBeDisabled()
  })

  it('só agentes: Agente pressionado e Team desabilitado', () => {
    usePlaygroundStore.setState({ agents: [agent] })
    renderModeSelector()

    expect(segment('Agente')).toHaveAttribute('aria-pressed', 'true')
    expect(segment('Agente')).toBeEnabled()
    expect(segment('Team')).toHaveAttribute('aria-pressed', 'false')
    expect(segment('Team')).toBeDisabled()
  })

  it('troca sozinho para Team quando só há times', async () => {
    usePlaygroundStore.setState({ teams: [team], mode: 'agent' })
    renderModeSelector()

    await waitFor(() => expect(segment('Team')).toHaveAttribute('aria-pressed', 'true'))
    expect(segment('Agente')).toBeDisabled()
    expect(usePlaygroundStore.getState().mode).toBe('team')
  })

  it('ao escolher Team limpa o agente, a sessão e as mensagens', async () => {
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
    expect(segment('Team')).toBeEnabled()

    await user.click(segment('Team'))

    expect(segment('Team')).toHaveAttribute('aria-pressed', 'true')
    expect(segment('Agente')).toHaveAttribute('aria-pressed', 'false')
    const state = usePlaygroundStore.getState()
    expect(state.mode).toBe('team')
    expect(state.messages).toEqual([])
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled())
    expect(onUrlUpdate.mock.lastCall?.[0].queryString).toBe('')
  })
})
