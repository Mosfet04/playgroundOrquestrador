import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AgentForm } from '@/components/management/agents/AgentForm'
import type { AgentConfig } from '@/types/management'

import { renderWithIntl } from '../helpers/intl'
import { stubBrowserApis } from '../helpers/toolForm'
import { server } from '../msw/server'

// QA AG3-04: os textos novos reasoningHelp e reasoningWarning (agno 3: as tools
// think/analyze rodam no próprio run) no editor de agente, nos dois idiomas. O
// aviso de tools que alteram dados é parte do critério e não pode se perder.

beforeAll(stubBrowserApis)

beforeEach(() =>
  server.use(
    http.get('*/api/tools', () =>
      HttpResponse.json({
        success: true,
        data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }
      })
    )
  )
)

const agent: AgentConfig = {
  id: 'assistente',
  nome: 'Assistente',
  model: 'm1',
  factoryIaModel: 'ollama',
  descricao: '',
  prompt: 'Seja útil.',
  active: true,
  tools_ids: [],
  version: 3
}

describe('AG3-04: ajuda e aviso do raciocínio no editor', () => {
  it.each([
    {
      locale: 'pt-BR' as const,
      provider: /^Provedor \*/,
      label: 'Raciocínio passo a passo',
      help: /tools de raciocínio \(think e analyze\) durante a própria resposta/,
      warning: /Mais chamadas ao modelo por resposta[\s\S]*tools que alteram dados \(POST, PUT, DELETE\)/
    },
    {
      locale: 'en' as const,
      provider: /^Provider \*/,
      label: 'Step-by-step reasoning',
      help: /reasoning tools \(think and analyze\) during the run itself/,
      warning: /More model calls per reply[\s\S]*tools that change data \(POST, PUT, DELETE\)/
    }
  ])('$locale: a ajuda aparece sempre e o aviso só com o raciocínio ligado', async (c) => {
    const user = userEvent.setup()
    renderWithIntl(<AgentForm agent={agent} onSuccess={() => {}} />, { locale: c.locale })
    await waitFor(() => expect(screen.getByRole('combobox', { name: c.provider })).toBeEnabled())

    const reasoning = screen.getByRole('switch', { name: c.label })
    expect(screen.getByText(c.help)).toBeVisible()
    expect(screen.queryByText(c.warning)).toBeNull()

    await user.click(reasoning)
    expect(screen.getByText(c.warning)).toBeVisible()
    expect(reasoning).toHaveAccessibleDescription(c.warning)
  }, 15_000)
})
