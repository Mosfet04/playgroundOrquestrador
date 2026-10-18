import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { Toaster } from 'sonner'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import PlaygroundPage from '@/app/(app)/playground/page'
import { usePlaygroundStore } from '@/store'

import { AGENTOS_URL } from '../msw/handlers'
import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// QA P1-05 (V-P1-05-14): o painel de sessões alcança, pela página inteira, os
// estados "sem storage", "nenhuma sessão" e "modo Team sem team". Os testes do
// dev cobrem SessionBlankState isolado; aqui o estado vem do orquestrador.

vi.mock('next/navigation', () => ({ usePathname: () => '/playground' }))

const initialStoreState = usePlaygroundStore.getState()

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  Element.prototype.scrollIntoView = () => undefined
})

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
  usePlaygroundStore.setState({ selectedEndpoint: AGENTOS_URL, hydrated: true })
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

const renderPlayground = (url: string) => {
  window.history.replaceState(null, '', url)
  return renderWithIntl(
    <NuqsAdapter>
      <PlaygroundPage />
      <Toaster />
    </NuqsAdapter>
  )
}

describe('painel de sessões, pela página', () => {
  it('agente sem storage (agent-2): link "storage" em nova aba, sem erro, sem toast e sem pedir /sessions', async () => {
    const sessionCalls: string[] = []
    server.use(
      http.get(`${AGENTOS_URL}/sessions`, ({ request }) => {
        sessionCalls.push(request.url)
        return HttpResponse.json({ data: [] })
      })
    )
    renderPlayground('/playground?agent=agent-2')

    const link = await screen.findByRole('link', { name: 'storage' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link.closest('p')).toHaveTextContent(
      'Conecte um storage ao agente para ver as sessões.'
    )
    expect(screen.queryByText('Não foi possível carregar as sessões')).not.toBeInTheDocument()
    expect(screen.queryByText('Nenhuma sessão ainda', { exact: false })).not.toBeInTheDocument()
    expect(document.querySelector('[data-sonner-toast]')).toBeNull()
    expect(sessionCalls).toEqual([])
  })

  it('agente com storage e zero sessões: "Nenhuma sessão ainda…", sem o link de storage', async () => {
    server.use(
      http.get(`${AGENTOS_URL}/sessions`, () =>
        HttpResponse.json({
          data: [],
          meta: { page: 1, limit: 20, total_pages: 0, total_count: 0, search_time_ms: 0 }
        })
      )
    )
    renderPlayground('/playground?agent=agent-1')

    expect(await screen.findByText(/Nenhuma sessão ainda/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'storage' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('agente com storage e sessões: lista as sessões, nenhuma caixa vazia', async () => {
    renderPlayground('/playground?agent=agent-1')

    expect(await screen.findByText('Primeira conversa')).toBeInTheDocument()
    expect(screen.queryByText(/Nenhuma sessão ainda/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'storage' })).not.toBeInTheDocument()
  })

  it('modo Team salvo com ?agent= na URL (sem team): "Selecione um team…", nunca as sessões do agente', async () => {
    usePlaygroundStore.setState({ mode: 'team' })
    renderPlayground('/playground?agent=agent-1')

    expect(
      await screen.findByText('Selecione um team para ver o histórico.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Selecione um agente para ver o histórico.')).not.toBeInTheDocument()
    expect(screen.queryByText('Primeira conversa')).not.toBeInTheDocument()
  })
})
