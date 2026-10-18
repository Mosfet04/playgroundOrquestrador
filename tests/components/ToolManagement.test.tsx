import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ToolManagement } from '@/components/management/tools/ToolManagement'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

const tool = {
  id: 'clima/hoje?x=1',
  name: 'Clima',
  description: 'Previsão do tempo',
  route: 'https://api.example.test/clima',
  http_method: 'GET',
  parameters: []
}

const serveTools = (tools: (typeof tool)[]) =>
  server.use(
    http.get('*/api/tools', () =>
      HttpResponse.json({
        success: true,
        data: { data: tools, total: tools.length, page: 1, limit: 10, totalPages: 1 }
      })
    )
  )

describe('ToolManagement: links da lista (D-P1-03-2)', () => {
  it('o nome leva a /tools/<id> com o id codificado (/, ?, espaço); sem editar/excluir na linha (P1-05b)', async () => {
    serveTools([tool])
    renderWithIntl(<ToolManagement />)

    const expected = '/tools/clima%2Fhoje%3Fx%3D1'
    const links = await screen.findAllByRole('link', { name: 'Clima' })
    expect(links.map((link) => link.getAttribute('href'))).toEqual([expected, expected])
    expect(screen.queryByRole('link', { name: 'Editar tool' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir tool' })).not.toBeInTheDocument()
  })

  it('"Nova tool" e "Criar primeira tool" levam a /tools/new', async () => {
    serveTools([])
    renderWithIntl(<ToolManagement />)

    expect(
      await screen.findByRole('link', { name: 'Criar primeira tool' })
    ).toHaveAttribute('href', '/tools/new')
    expect(screen.getByRole('link', { name: 'Nova tool' })).toHaveAttribute('href', '/tools/new')
  })
})
