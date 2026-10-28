import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ToolForm } from '@/components/management/tools/ToolForm'
import type { Tool } from '@/types/management'

import { renderWithIntl } from '../helpers/intl'
import { paste, saveButton, stubBrowserApis, tool } from '../helpers/toolForm'

// P3-03: o card "Requisição" mostra, a cada edição e sem request, a chamada
// como o orquestrador a monta (http_tool_factory.py).

beforeAll(stubBrowserApis)

const base: Tool = {
  ...tool,
  parameters: [
    { name: 'order_id', type: 'string', description: 'Código', required: true, default_value: 'T 77' },
    { name: 'include_items', type: 'boolean', description: 'Itens', required: false, default_value: true },
    { name: 'limit', type: 'integer', description: 'Limite', required: false, default_value: 10 },
    { name: 'filtro', type: 'string', description: 'Filtro', required: false }
  ],
  headers: { Accept: 'application/json', 'X-Api-Key': 'env:LOJA_API_KEY', Authorization: '***' }
}

async function renderReady(value: Tool = base) {
  const user = userEvent.setup()
  renderWithIntl(<ToolForm tool={value} onSuccess={() => {}} />)
  await waitFor(() => expect(saveButton()).toBeEnabled())
  return user
}

const preview = () => screen.getByRole('region', { name: 'Requisição' })
const block = (label: string) =>
  within(preview()).getByText(label).nextElementSibling as HTMLElement

describe('Requisição', () => {
  it('GET: chamada com o padrão percent-encoded e os demais parâmetros em Query', async () => {
    await renderReady()

    expect(block('Chamada')).toHaveTextContent('GET https://api.loja.example/v1/orders/T%2077')
    expect(within(block('Chamada')).getByText('T%2077')).toHaveClass('bg-primary-soft')
    expect(within(preview()).queryByText('Corpo (JSON)')).toBeNull()
    const query = block('Query')
    expect(query.textContent).toBe('include_items=truelimit=10filtro={filtro}')
    expect(within(query).getByText('true')).toHaveClass('bg-primary-soft')
    expect(within(query).getByText('{filtro}')).toHaveClass('border-dashed')
  })

  it('sem padrão o placeholder da rota fica visível, com as chaves', async () => {
    await renderReady({
      ...base,
      parameters: [{ name: 'order_id', type: 'string', description: 'Código', required: true }]
    })

    expect(block('Chamada')).toHaveTextContent('GET https://api.loja.example/v1/orders/{order_id}')
    expect(within(block('Chamada')).getByText('{order_id}')).toHaveClass('border-dashed')
  })

  it('POST, PUT e PATCH: Corpo (JSON) indentado, com número e booleano sem aspas', async () => {
    const user = await renderReady()

    await user.click(screen.getByRole('combobox', { name: /^Método HTTP/ }))
    await user.click(await screen.findByRole('option', { name: 'POST' }))

    expect(within(preview()).queryByText('Query')).toBeNull()
    expect(block('Corpo (JSON)').textContent).toBe(
      '{"include_items": true,"limit": 10,"filtro": {filtro}}'
    )
    expect(block('Chamada')).toHaveTextContent('POST https://api.loja.example/v1/orders/T%2077')
  })

  it('headers: referência e "***" como estão, texto mascarado sem o valor', async () => {
    await renderReady({ ...base, headers: { ...base.headers, 'X-Conta': 'valor-em-texto' } })

    const headers = block('Headers')
    expect(headers).toHaveTextContent('X-Api-Key: env:LOJA_API_KEY')
    expect(headers).toHaveTextContent('Authorization: ***')
    expect(headers).toHaveTextContent('Accept: ••••••texto oculto')
    expect(headers).toHaveTextContent('X-Conta: ••••••texto oculto')
    expect(within(headers).getAllByText('••••••')).toHaveLength(2)
    expect(preview().textContent).not.toContain('application/json')
    expect(preview().textContent).not.toContain('valor-em-texto')
  })

  it('reage a cada edição (método, rota, padrão, header) sem nenhum request', async () => {
    const user = await renderReady()
    const fetched = vi.spyOn(globalThis, 'fetch')

    await paste(user, screen.getByLabelText(/^Rota/), 'https://outro.example/p/{order_id}?x=1')
    expect(block('Chamada')).toHaveTextContent('GET https://outro.example/p/T%2077?x=1')

    const limit = screen.getAllByLabelText('Valor padrão')[2]
    await paste(user, limit, '99')
    expect(block('Query')).toHaveTextContent('limit=99')

    await user.click(screen.getByRole('button', { name: 'Adicionar header' }))
    const [name, value] = within(screen.getByRole('list', { name: 'Headers HTTP' }))
      .getAllByRole('listitem')
      .at(-1)!
      .querySelectorAll('input')
    await user.type(name, 'X-Conta')
    await user.type(value, 'env:CONTA')
    expect(block('Headers')).toHaveTextContent('X-Conta: env:CONTA')

    expect(fetched).not.toHaveBeenCalled()
  })

  it('sem rota: pede a rota; sem parâmetro fora da rota nem header os blocos somem', async () => {
    const user = await renderReady({ ...base, parameters: [], headers: {} })
    expect(within(preview()).queryByText('Query')).toBeNull()
    expect(within(preview()).queryByText('Headers')).toBeNull()

    await user.clear(screen.getByLabelText(/^Rota/))

    expect(within(preview()).getByText('Informe a rota para ver a requisição.')).toBeVisible()
    expect(within(preview()).queryByText('Chamada')).toBeNull()
  })

  it('rota sem esquema aparece como digitada', async () => {
    const user = await renderReady()

    await paste(user, screen.getByLabelText(/^Rota/), 'api.loja.example/{order_id}')

    expect(block('Chamada')).toHaveTextContent('GET api.loja.example/{order_id}')
  })

  it('é a região rolável focável e não anuncia a cada tecla', async () => {
    await renderReady()

    expect(preview()).toHaveAttribute('tabindex', '0')
    expect(preview().querySelector('[aria-live]')).toBeNull()
    expect(preview().querySelector('[role="group"]')).toHaveAccessibleDescription(
      'Texto aparece oculto; referências e *** como estão.'
    )
  })
})
