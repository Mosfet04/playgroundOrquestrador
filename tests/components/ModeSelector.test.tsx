import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  NuqsTestingAdapter,
  type OnUrlUpdateFunction
} from 'nuqs/adapters/testing'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ModeSelector } from '@/components/playground/Sidebar/ModeSelector'
import { usePlaygroundStore } from '@/store'

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
    <NuqsTestingAdapter searchParams={searchParams} onUrlUpdate={onUrlUpdate}>
      <ModeSelector />
    </NuqsTestingAdapter>
  )
  return { onUrlUpdate }
}

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
  it('fica desabilitado e avisa quando não há agentes nem times', () => {
    renderModeSelector()

    const select = screen.getByRole('combobox')
    expect(select).toBeDisabled()
    expect(select).toHaveTextContent('No Mode Available')
  })

  it('mostra o modo Agent travado quando só há agentes', () => {
    usePlaygroundStore.setState({ agents: [agent] })
    renderModeSelector()

    const select = screen.getByRole('combobox')
    expect(select).toBeDisabled()
    expect(select).toHaveTextContent('Agent')
  })

  it('troca sozinho para Team quando só há times', async () => {
    usePlaygroundStore.setState({ teams: [team], mode: 'agent' })
    renderModeSelector()

    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveTextContent('Team')
    )
    expect(usePlaygroundStore.getState().mode).toBe('team')
  })

  it('ao escolher Team limpa o agente, a sessão e as mensagens', async () => {
    const user = userEvent.setup()
    usePlaygroundStore.setState({
      agents: [agent],
      teams: [team],
      mode: 'agent',
      selectedModel: 'gpt-4o',
      messages: [{ role: 'user', content: 'oi', created_at: 1 }]
    })
    const { onUrlUpdate } = renderModeSelector(
      '?agent=agent-1&session=session-a1'
    )

    const select = screen.getByRole('combobox')
    expect(select).toBeEnabled()
    expect(select).toHaveTextContent('Agent')

    await user.click(select)
    await user.click(await screen.findByRole('option', { name: 'Team' }))

    expect(screen.getByRole('combobox')).toHaveTextContent('Team')
    const state = usePlaygroundStore.getState()
    expect(state.mode).toBe('team')
    expect(state.messages).toEqual([])
    expect(state.selectedModel).toBe('')
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled())
    expect(onUrlUpdate.mock.lastCall?.[0].queryString).toBe('')
  })
})
