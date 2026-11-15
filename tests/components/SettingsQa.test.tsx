import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { RuntimeRevision, RuntimeRevisionProvider } from '@/components/layout/RuntimeRevision'
import { Settings } from '@/components/management/settings/Settings'

import { renderWithIntl } from '../helpers/intl'
import { RUNTIME_URL, SCHEMA_URL, runtimeBody, schemaFixture } from '../msw/handlers'
import { server } from '../msw/server'

// QA P4-05: o que o browser mostra nunca é texto livre do orquestrador (campo
// extra no corpo da saúde, nome de provider hostil só como texto), e o
// "Recarregar runtime" não duplica o POST num clique duplo, fecha com Esc em
// repouso e prende o Tab no diálogo.

const LEAK = 'LEAK-texto-livre'

const renderSettings = () =>
  renderWithIntl(
    <RuntimeRevisionProvider>
      <RuntimeRevision />
      <Settings />
    </RuntimeRevisionProvider>
  )

describe('QA Settings: texto do orquestrador', () => {
  it('campo extra no corpo da saúde (message, provider, aninhado) não chega ao DOM; nome de provider hostil é só texto', async () => {
    const body = runtimeBody(7)
    server.use(
      http.get(RUNTIME_URL, () =>
        HttpResponse.json({
          ...body,
          message: LEAK,
          data: {
            ...body.data,
            message: LEAK,
            provider: LEAK,
            checks: {
              ...body.data.checks,
              memory: { ...body.data.checks.memory, message: LEAK },
              telemetry: 'configured',
              otlp: { status: 'configured', provider: LEAK }
            }
          }
        })
      ),
      http.get(SCHEMA_URL, () =>
        HttpResponse.json({
          success: true,
          data: {
            ...schemaFixture,
            chatProviders: [
              { name: '<img src=x onerror="window.__pwned=1">', modelParams: [], requiresBaseUrl: false }
            ]
          }
        })
      )
    )
    renderSettings()

    await screen.findByRole('region', { name: 'Provedores de chat' })
    const orchestrator = await screen.findByRole('region', { name: 'Orquestrador' })
    await within(orchestrator.querySelector('header') as HTMLElement).findByText('Saudável')

    expect(document.body.textContent).not.toContain(LEAK)
    expect(document.body.textContent).toContain('<img src=x onerror="window.__pwned=1">')
    // A prova é o literal no texto e nenhum <img> no DOM (nada foi interpretado).
    expect(document.querySelector('img')).toBeNull()
  })
})

describe('QA Settings: diálogo de recarga', () => {
  const open = async () => {
    server.use(http.get(RUNTIME_URL, () => HttpResponse.json(runtimeBody(7))))
    const user = userEvent.setup()
    renderSettings()
    const orchestrator = await screen.findByRole('region', { name: 'Orquestrador' })
    await within(orchestrator.querySelector('header') as HTMLElement).findByText('Saudável')
    const trigger = within(orchestrator).getByRole('button', { name: 'Recarregar runtime' })
    await user.click(trigger)
    return { user, trigger, dialog: screen.getByRole('alertdialog') }
  }

  it('clique duplo em Recarregar runtime ⇒ 1 POST', async () => {
    let posts = 0
    server.use(
      http.post('*/api/config/reload', async () => {
        posts++
        await new Promise((resolve) => setTimeout(resolve, 30))
        return HttpResponse.json({ success: true, runtimeRevision: 8 })
      })
    )
    const { user, dialog } = await open()

    await user.dblClick(within(dialog).getByRole('button', { name: 'Recarregar runtime' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(posts).toBe(1)
  })

  it('Esc em repouso fecha sem POST e devolve o foco; Tab não sai do diálogo', async () => {
    let posts = 0
    server.use(http.post('*/api/config/reload', () => (posts++, HttpResponse.json({ success: true, runtimeRevision: 8 }))))
    const { user, trigger, dialog } = await open()

    for (let i = 0; i < 6; i++) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(posts).toBe(0)
  })
})
