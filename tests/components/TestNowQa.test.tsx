import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import PlaygroundPage from '@/app/(app)/playground/page'
import { AppShell } from '@/components/layout/AppShell'
import { ApplyStatus } from '@/components/management/common/ApplyStatus'
import { usePlaygroundStore } from '@/store'

import { BFF } from '../msw/handlers'
import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// QA P4-03: o id que o "Testar agora" codifica no href chega inteiro ao
// playground (nuqs decodifica) e é o que o BFF recebe como component_id.

vi.mock('next/navigation', () => ({ usePathname: () => '/playground' }))

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView = () => undefined
  window.matchMedia = (query: string) =>
    ({ media: query, matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList
})

afterEach(() => window.history.replaceState(null, '', '/'))

describe('"Testar agora": id com caracteres reservados', () => {
  it('o playground lê de volta o id do href, sem truncar em & # / % ?', async () => {
    const id = 'a&b#c/d%e?f ç'
    const { unmount } = renderWithIntl(
      <ApplyStatus kind="agents" result={{ status: 'applied' }} testNowId={id} />
    )
    const href = screen.getByRole('link', { name: /Testar agora/ }).getAttribute('href')!
    unmount()

    const seen: string[] = []
    server.use(
      http.get(`${BFF}/agents`, () =>
        HttpResponse.json({
          success: true,
          data: [{ value: id, label: 'Especial', model: { provider: 'OpenAI', model: 'gpt-4o' }, storage: true }]
        })
      ),
      http.get(`${BFF}/sessions`, ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('component_id') ?? '')
        return HttpResponse.json({ success: true, data: [] })
      })
    )
    usePlaygroundStore.setState({ messages: [] })
    window.history.replaceState(null, '', href)
    renderWithIntl(
      <NuqsAdapter>
        <AppShell>
          <PlaygroundPage />
        </AppShell>
      </NuqsAdapter>
    )

    await waitFor(() => expect(seen).toContain(id))
    expect(new URLSearchParams(window.location.search).get('agent')).toBe(id)
  })
})
