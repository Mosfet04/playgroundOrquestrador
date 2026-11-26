import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RuntimeRevision, RuntimeRevisionProvider } from '@/components/layout/RuntimeRevision'
import { Settings } from '@/components/management/settings/Settings'

import { renderWithIntl } from '../helpers/intl'
import { RUNTIME_URL, SCHEMA_URL, runtimeBody, schemaFixture } from '../msw/handlers'
import { server } from '../msw/server'
import { http, HttpResponse } from 'msw'

// QA1-08 (#12, D-QA1-08-3 = A): "Lido em" no relógio do navegador, não no fuso
// do servidor. O IntlProvider dos testes fixa o servidor em UTC (como o layout
// raiz); o navegador aqui é America/Sao_Paulo (UTC-3, sem horário de verão).

const READ_AT = new Date('2026-11-25T17:32:07Z')
const originalTz = process.env.TZ

beforeEach(() => {
  process.env.TZ = 'America/Sao_Paulo'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(READ_AT)
  server.use(
    http.get(RUNTIME_URL, () => HttpResponse.json(runtimeBody(7))),
    http.get(SCHEMA_URL, () => HttpResponse.json({ success: true, data: schemaFixture }))
  )
})

afterEach(() => {
  vi.useRealTimers()
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

const readAt = async (locale: 'pt-BR' | 'en') => {
  renderWithIntl(
    <RuntimeRevisionProvider>
      <RuntimeRevision />
      <Settings />
    </RuntimeRevisionProvider>,
    { locale }
  )
  const orchestrator = await screen.findByRole('region', {
    name: locale === 'en' ? 'Orchestrator' : 'Orquestrador'
  })
  const label = await within(orchestrator).findByText(locale === 'en' ? 'Read at' : 'Lido em', {
    selector: 'dt'
  })
  return label.nextElementSibling?.textContent
}

describe('Settings: "Lido em" no fuso do navegador', () => {
  it('pt-BR: 17:32:07 UTC vira 14:32:07 em America/Sao_Paulo', async () => {
    expect(await readAt('pt-BR')).toBe('14:32:07')
  })

  it('EN: 2:32:07 PM, com o mesmo fuso do navegador', async () => {
    expect(await readAt('en')).toMatch(/^2:32:07\sPM$/)
  })
})
