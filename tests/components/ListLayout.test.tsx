import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentEditor } from '@/components/management/agents/AgentEditor'
import { AgentManagement } from '@/components/management/agents/AgentManagement'
import { TeamEditor } from '@/components/management/teams/TeamEditor'
import { TeamManagement } from '@/components/management/teams/TeamManagement'
import { ToolManagement } from '@/components/management/tools/ToolManagement'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { renderWithIntl } from '../helpers/intl'
import { server } from '../msw/server'

// P3-06 §5 (V-P3-06-19 a 22): colunas curtas com largura fixa, Dialog com
// margem no celular, busca sempre visível e Instruções com 8 linhas.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }))

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

const page = (data: object[]) =>
  HttpResponse.json({ success: true, data: { data, total: data.length, page: 1, limit: 100, totalPages: 1 } })

const WIDTHS: Record<string, string> = {
  Tools: 'w-24',
  Parâmetros: 'w-24',
  Membros: 'w-24',
  Status: 'w-28',
  Atualizado: 'w-32'
}

describe('listas', () => {
  it.each([
    ['agents', <AgentManagement key="a" />, { id: 'a', nome: 'A', model: 'm', factoryIaModel: 'ollama', active: true, tools_ids: [] }],
    ['teams', <TeamManagement key="t" />, { id: 't', nome: 'T', model: 'm', factoryIaModel: 'ollama', mode: 'route', active: true, member_ids: ['a'] }],
    ['tools', <ToolManagement key="o" />, { id: 'o', name: 'O', description: 'd', route: 'https://x.test', http_method: 'GET', parameters: [], active: true }]
  ])('%s: colunas curtas com largura fixa e a busca visível, sem botão de filtros', async (path, ui, item) => {
    server.use(http.get(`*/api/${path}`, () => page([item])))
    renderWithIntl(ui)

    const heads = await screen.findAllByRole('columnheader')
    for (const head of heads) {
      const width = WIDTHS[head.textContent ?? '']
      if (width) expect(head).toHaveClass(width)
    }
    expect(heads.filter((head) => head.className.includes('w-28'))).toHaveLength(1)
    expect(heads.filter((head) => head.className.includes('w-32'))).toHaveLength(1)
    expect(screen.getByLabelText('Buscar')).toBeVisible()
    expect(screen.queryByRole('button', { name: /filtros/i })).not.toBeInTheDocument()
  })

  it('agents e teams mostram "Apenas ativos" logo abaixo da busca; tools só a busca', async () => {
    server.use(http.get('*/api/tools', () => page([])), http.get('*/api/agents', () => page([])))
    const { unmount } = renderWithIntl(<ToolManagement />)
    await screen.findByLabelText('Buscar')
    expect(screen.queryByRole('switch', { name: 'Apenas ativos' })).not.toBeInTheDocument()
    unmount()

    renderWithIntl(<AgentManagement />)
    expect(await screen.findByRole('switch', { name: 'Apenas ativos' })).toBeVisible()
  })
})

describe('Dialog', () => {
  it('margem de 16 px abaixo de sm, cabeçalho à esquerda e botões com espaço', () => {
    renderWithIntl(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>X</DialogTitle>
          </DialogHeader>
          <DialogFooter>Rodapé</DialogFooter>
        </DialogContent>
      </Dialog>
    )

    expect(screen.getByRole('dialog')).toHaveClass('w-[calc(100%-2rem)]', 'sm:w-full', 'max-h-[calc(100dvh-2rem)]')
    expect(screen.getByText('X').parentElement).toHaveClass('text-left')
    expect(screen.getByText('X').parentElement).not.toHaveClass('text-center')
    expect(screen.getByText('Rodapé')).toHaveClass('gap-2')
  })
})

describe('Instruções', () => {
  const noTools = http.get('*/api/tools', () => page([]))

  it('o prompt do sistema do agent tem 8 linhas de mínimo e teto de 384 px; a descrição segue com uma linha', async () => {
    server.use(
      noTools,
      http.get('*/api/agents/:id', () =>
        HttpResponse.json({
          success: true,
          data: { id: 'a', nome: 'A', model: 'm', factoryIaModel: 'ollama', descricao: '', prompt: '', active: true, tools_ids: [], version: 1 }
        })
      )
    )
    renderWithIntl(<AgentEditor id="a" />)

    const prompt = await screen.findByLabelText('Prompt do sistema')
    expect(prompt).toHaveClass('min-h-44', 'max-h-96')
    expect(prompt).not.toHaveAttribute('rows')
    expect(screen.getByLabelText('Descrição')).not.toHaveClass('min-h-44')
    expect(screen.getByLabelText('Descrição')).not.toHaveAttribute('rows')
  })

  it('o prompt do líder do team também', async () => {
    server.use(
      http.get('*/api/agents', () => page([])),
      http.get('*/api/teams/:id', () =>
        HttpResponse.json({
          success: true,
          data: { id: 't', nome: 'T', descricao: '', prompt: '', active: true, member_ids: [], mode: 'route', factoryIaModel: 'ollama', model: 'm', version: 1 }
        })
      )
    )
    renderWithIntl(<TeamEditor id="t" />)

    const prompt = await screen.findByLabelText('Prompt do líder')
    expect(prompt).toHaveClass('min-h-44', 'max-h-96')
    expect(within(document.body).getByLabelText('Descrição')).not.toHaveAttribute('rows')
  })
})
