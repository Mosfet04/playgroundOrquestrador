import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ToolForm } from '@/components/management/tools/ToolForm'
import type { Tool } from '@/types/management'

import { renderWithIntl } from '../helpers/intl'
import { server } from '../msw/server'
import { captureSave, paste, saveButton, stubBrowserApis, tool } from '../helpers/toolForm'

// QA P3-03: caminhos até o PUT/POST que os testes do dev não exercitam para o
// header sensível (D-P3-03-3): renomear depois de digitar, "Substituir" com
// texto, "Manter oculto" depois do texto e falha do envio. Nenhum valor em
// texto sai do browser nem aparece fora do próprio campo.

beforeAll(stubBrowserApis)

const SECRET = 'Bearer qa-segredo-em-texto-9f3a'

const stored: Tool = {
  ...tool,
  headers: { 'X-Conta': '***', Authorization: '***' }
}

async function renderReady(value?: Tool) {
  const user = userEvent.setup()
  renderWithIntl(
    <>
      <ToolForm tool={value} onSuccess={() => {}} />
      <Toaster />
    </>
  )
  await waitFor(() => expect(saveButton()).toBeEnabled())
  return user
}

const group = () => screen.getByRole('group', { name: 'Headers HTTP' })
const rowsOf = () => within(group()).getAllByRole('listitem')

// Texto fora dos campos (o valor digitado só pode existir no próprio input).
const visibleText = () => document.body.textContent ?? ''

// Todo request que sai do browser de teste (corpo incluído).
function recordRequests() {
  const sent: string[] = []
  server.events.on('request:start', async ({ request }) => {
    sent.push(`${request.method} ${request.url} ${await request.clone().text()}`)
  })
  return sent
}

describe('nome sensível depois do valor', () => {
  it.each(['Authorization', ' x-api-key ', 'X_TOKEN', 'COOKIE'])(
    'renomear um header comum com texto para %j é recusado: nenhum request leva o valor',
    async (renamed) => {
      const bodies = captureSave()
      const sent = recordRequests()
      const user = await renderReady(tool)
      await user.click(screen.getByRole('button', { name: 'Adicionar header' }))
      const [nameInput, valueInput] = within(rowsOf()[0]).getAllByRole('textbox')
      await user.type(nameInput, 'X-Conta')
      await paste(user, valueInput, SECRET)
      // Nome comum aceita texto: ainda nada a recusar. Agora renomeia.
      await user.clear(nameInput)
      await user.type(nameInput, renamed)
      sent.length = 0

      await user.click(saveButton())

      expect(await within(rowsOf()[0]).findByText(/é sensível: use Segredo/)).toBeVisible()
      expect(valueInput).toBeInvalid()
      expect(bodies).toEqual([])
      expect(sent.filter((line) => /^(POST|PUT) /.test(line))).toEqual([])
      expect(sent.join('\n')).not.toContain(SECRET)
      expect(visibleText()).not.toContain(SECRET)
      server.events.removeAllListeners()
    }
  )
})

describe('"Substituir" um valor oculto', () => {
  it('texto num header sensível é recusado; nada com o valor sai do browser', async () => {
    const bodies = captureSave()
    const sent = recordRequests()
    const user = await renderReady(stored)
    await user.click(screen.getByRole('button', { name: 'Substituir o valor de Authorization' }))
    await paste(user, screen.getByLabelText('Novo valor de Authorization'), SECRET)
    sent.length = 0

    await user.click(saveButton())

    expect(await screen.findByText(/Authorization é sensível/)).toBeVisible()
    expect(screen.getByLabelText('Novo valor de Authorization')).toBeInvalid()
    expect(bodies).toEqual([])
    expect(sent.filter((line) => /^(POST|PUT) /.test(line))).toEqual([])
    expect(visibleText()).not.toContain(SECRET)
    server.events.removeAllListeners()
  })

  it('"Manter oculto" depois do texto descarta o texto: o PUT leva só "***"', async () => {
    const bodies = captureSave()
    const user = await renderReady(stored)
    await user.click(screen.getByRole('button', { name: 'Substituir o valor de Authorization' }))
    await paste(user, screen.getByLabelText('Novo valor de Authorization'), SECRET)
    await user.click(screen.getByRole('button', { name: 'Manter o valor oculto de Authorization' }))

    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].headers).toEqual({ 'X-Conta': '***', Authorization: '***' })
    expect(JSON.stringify(bodies[0])).not.toContain(SECRET)
  })

  it('"Substituir" num header comum aceita texto e o envia no lugar do "***"', async () => {
    const bodies = captureSave()
    const user = await renderReady(stored)
    await user.click(screen.getByRole('button', { name: 'Substituir o valor de X-Conta' }))
    await paste(user, screen.getByLabelText('Novo valor de X-Conta'), 'text/plain')

    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].headers).toEqual({ 'X-Conta': 'text/plain', Authorization: '***' })
  })
})

describe('falha do envio', () => {
  it('500 do BFF com um valor em texto: erro genérico, o valor não aparece nem vai ao console', async () => {
    const lines: unknown[][] = []
    const spies = (['log', 'warn', 'error', 'info'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...args) => void lines.push(args))
    )
    server.use(
      http.post('*/api/tools', () => HttpResponse.json({ success: false, error: 'boom' }, { status: 500 }))
    )
    const user = await renderReady()
    await user.type(screen.getByLabelText(/^ID da tool/), 'qa-tool')
    await user.type(screen.getByLabelText(/^Nome \*/), 'QA')
    await user.type(screen.getByLabelText(/^Descrição \*/), 'Tool do QA')
    await paste(user, screen.getByLabelText(/^Rota/), 'https://api.loja.example/v1/x')
    await user.click(screen.getByRole('button', { name: 'Adicionar header' }))
    const [nameInput, valueInput] = within(rowsOf()[0]).getAllByRole('textbox')
    await user.type(nameInput, 'X-Conta')
    await paste(user, valueInput, SECRET)

    await user.click(saveButton())

    expect(await screen.findByText(/Não foi possível salvar a tool/)).toBeVisible()
    expect(visibleText()).not.toContain(SECRET)
    expect(JSON.stringify(lines)).not.toContain(SECRET)
    spies.forEach((spy) => spy.mockRestore())
  })
})
