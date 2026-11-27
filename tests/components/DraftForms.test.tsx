import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AgentForm } from '@/components/management/agents/AgentForm'
import { TeamForm } from '@/components/management/teams/TeamForm'
import { ToolForm } from '@/components/management/tools/ToolForm'
import type { AgentConfig } from '@/types/management'

import { entityControls } from '../helpers/controls'
import { renderWithIntl } from '../helpers/intl'
import { saveAndConfirm } from '../helpers/saveReview'
import { stubBrowserApis } from '../helpers/toolForm'
import { server } from '../msw/server'

// QA1-06 (#15, D-QA1-06-4) nos três formulários: o aviso aparece só com
// rascunho (valores diferentes dos iniciais, por valor) e some ao salvar.
// "Seguiu" = o clique no link chegou ao browser sem o guard segurar (no jsdom
// sem router o <Link> não navega; o listener de bolha da window registra e
// cancela a navegação do jsdom).

beforeAll(stubBrowserApis)

let followed: string[]
const follow = (event: MouseEvent) => {
  const link = event.target instanceof Element ? event.target.closest('a') : null
  if (!link) return
  if (!event.defaultPrevented) followed.push(link.getAttribute('href') ?? '')
  event.preventDefault()
}
beforeEach(() => {
  followed = []
  window.addEventListener('click', follow)
  const page = (data: object[] = []) =>
    HttpResponse.json({ success: true, data: { data, total: data.length, page: 1, limit: 100, totalPages: 1 } })
  server.use(
    http.get('*/api/tools', () => page()),
    http.get('*/api/agents', () => page([{ id: 'membro', nome: 'Membro', active: true, version: 1 }]))
  )
})
afterEach(() => window.removeEventListener('click', follow))

const draftDialog = () => screen.queryByRole('dialog', { name: 'Descartar alterações?' })
const backLink = () => screen.getByRole('link', { name: 'Voltar' })
const cancelLink = () => screen.getByRole('link', { name: 'Cancelar' })
const saveButton = () => screen.getByRole('button', { name: 'Salvar' })

async function open(element: React.ReactElement) {
  const user = userEvent.setup()
  renderWithIntl(element)
  await waitFor(() => expect(saveButton()).toBeEnabled())
  return user
}

describe('criação', () => {
  it.each([
    ['agent', () => <AgentForm onSuccess={() => {}} />, '/agents'],
    ['team', () => <TeamForm onSuccess={() => {}} />, '/teams'],
    ['tool', () => <ToolForm onSuccess={() => {}} />, '/tools']
  ])('%s intocado: Voltar e Cancelar saem sem aviso', async (_, create, list) => {
    const user = await open(create())

    await user.click(backLink())
    await user.click(cancelLink())

    expect(draftDialog()).not.toBeInTheDocument()
    expect(followed).toEqual([list, list])
  })

  it('agent: nome digitado ⇒ aviso; "Continuar editando" mantém o nome; apagado ⇒ sem aviso', async () => {
    const user = await open(<AgentForm onSuccess={() => {}} />)
    const name = screen.getByLabelText('Nome *')

    await user.type(name, 'Rascunho')
    await user.click(backLink())
    expect(draftDialog()).toBeInTheDocument()
    expect(followed).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Continuar editando' }))
    await waitFor(() => expect(draftDialog()).not.toBeInTheDocument())
    expect(name).toHaveValue('Rascunho')

    await user.clear(name)
    await user.click(backLink())
    expect(draftDialog()).not.toBeInTheDocument()
    expect(followed).toEqual(['/agents'])
  })

  it('agent: "Descartar e sair" segue o link', async () => {
    const user = await open(<AgentForm onSuccess={() => {}} />)
    await user.type(screen.getByLabelText('Nome *'), 'Rascunho')

    await user.click(cancelLink())
    await user.click(screen.getByRole('button', { name: 'Descartar e sair' }))

    expect(followed).toEqual(['/agents'])
  })

  it('agent: linha de parâmetro vazia conta; removida, não', async () => {
    const user = await open(<AgentForm onSuccess={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Adicionar parâmetro' }))
    await user.click(backLink())
    expect(draftDialog()).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(draftDialog()).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Remover parâmetro 1' }))
    await user.click(backLink())
    expect(draftDialog()).not.toBeInTheDocument()
  })

  it('agent: tool marcada conta; desmarcada, não', async () => {
    server.use(
      http.get('*/api/tools', () =>
        HttpResponse.json({
          success: true,
          data: { data: [{ id: 'clima', name: 'Clima', description: 'd' }], total: 1, page: 1, limit: 100, totalPages: 1 }
        })
      )
    )
    const user = await open(<AgentForm onSuccess={() => {}} />)
    const tool = await screen.findByRole('checkbox', { name: /Clima/ })

    await user.click(tool)
    await user.click(backLink())
    expect(draftDialog()).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(draftDialog()).not.toBeInTheDocument())

    await user.click(tool)
    await user.click(backLink())
    expect(draftDialog()).not.toBeInTheDocument()
  })

  it('team: membro marcado conta; switch ligado e desligado de novo, não', async () => {
    const user = await open(<TeamForm onSuccess={() => {}} />)
    const member = await screen.findByRole('checkbox', { name: /Membro/ })
    const summary = screen.getByRole('switch', { name: 'Resumo da sessão' })

    await user.click(summary)
    await user.click(summary)
    await user.click(backLink())
    expect(draftDialog()).not.toBeInTheDocument()

    await user.click(member)
    await user.click(backLink())
    expect(draftDialog()).toBeInTheDocument()
  })

  it('tool: header adicionado conta', async () => {
    const user = await open(<ToolForm onSuccess={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Adicionar header' }))
    await user.click(backLink())

    expect(draftDialog()).toBeInTheDocument()
  })
})

describe('edição', () => {
  const agent: AgentConfig = {
    id: 'assistente',
    nome: 'Assistente',
    model: 'm1',
    factoryIaModel: 'ollama',
    descricao: '',
    prompt: '',
    active: true,
    tools_ids: [],
    version: 3
  }
  const saveWith = (response: () => Response) => server.use(http.put('*/api/agents/:id', response))
  // O EntityLoader troca a versão lida pela salva (controls.set).
  function Editor() {
    const [read, setRead] = useState(agent)
    return <AgentForm agent={read} controls={{ ...entityControls(), set: setRead }} onSuccess={() => {}} />
  }

  it('sem mudança, sem aviso; nome mudado, aviso; salvo com sucesso, sem aviso', async () => {
    saveWith(() => HttpResponse.json({ success: true, data: { ...agent, nome: 'Novo nome', version: 4 } }))
    const user = await open(<Editor />)

    await user.click(backLink())
    expect(draftDialog()).not.toBeInTheDocument()

    const name = screen.getByLabelText('Nome *')
    await user.clear(name)
    await user.type(name, 'Novo nome')
    await user.click(backLink())
    expect(draftDialog()).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(draftDialog()).not.toBeInTheDocument())

    await saveAndConfirm(user)
    await screen.findByText(/Mudança aplicada/)
    await user.click(backLink())
    expect(draftDialog()).not.toBeInTheDocument()
    expect(followed).toEqual(['/agents', '/agents'])
  })

  it('recusado pelo orquestrador (422), segue com aviso', async () => {
    saveWith(() => HttpResponse.json({ success: false, error: 'invalid_config', field: 'nome' }, { status: 422 }))
    const user = await open(<AgentForm agent={agent} onSuccess={() => {}} />)
    await user.type(screen.getByLabelText('Nome *'), ' 2')

    await saveAndConfirm(user)
    expect(await screen.findByText('Valor recusado pelo orquestrador')).toBeVisible()
    await user.click(backLink())

    expect(draftDialog()).toBeInTheDocument()
  })

  it('a edição desfeita volta a não avisar', async () => {
    const user = await open(<AgentForm agent={agent} onSuccess={() => {}} />)
    const name = screen.getByLabelText('Nome *')

    await user.type(name, 'x')
    await user.type(name, '{Backspace}')
    await user.click(within(document.body).getByRole('link', { name: 'Voltar' }))

    expect(draftDialog()).not.toBeInTheDocument()
  })
})
