import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'

import { ToolForm } from '@/components/management/tools/ToolForm'
import type { Tool } from '@/types/management'

import { renderWithIntl } from '../helpers/intl'
import { captureSave, saveButton, stubBrowserApis, tool } from '../helpers/toolForm'

// QA P3-05 (D-P3-05-4): o `***` do header sobrevive a "Substituir" seguido de
// "Manter oculto", mesmo depois de digitada uma referência nova; e o modo
// Segredo com valor de segredo colado não chega ao BFF.

beforeAll(stubBrowserApis)

const stored: Tool = {
  ...tool,
  headers: { Authorization: '***', 'X-Api-Key': 'env:LOJA_API_KEY' }
}

async function renderReady() {
  const user = userEvent.setup()
  renderWithIntl(<ToolForm tool={stored} onSuccess={() => {}} />)
  await waitFor(() => expect(saveButton()).toBeEnabled())
  return user
}

describe('header oculto', () => {
  it('Substituir, digitar uma referência e Manter oculto: o corpo leva *** e não a referência digitada', async () => {
    const bodies = captureSave()
    const user = await renderReady()

    await user.click(screen.getByRole('button', { name: 'Substituir o valor de Authorization' }))
    await user.click(screen.getByRole('combobox', { name: 'Modo do valor de Authorization' }))
    await user.click(screen.getByRole('option', { name: 'Segredo' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Variável de ambiente (Authorization)' }),
      'DESCARTADA_API_KEY'
    )
    await user.click(screen.getByRole('button', { name: 'Manter o valor oculto de Authorization' }))
    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].headers).toEqual({ Authorization: '***', 'X-Api-Key': 'env:LOJA_API_KEY' })
    expect(JSON.stringify(bodies[0])).not.toContain('DESCARTADA')
  })
})

describe('valor de segredo colado no modo Segredo', () => {
  it('é recusado no cliente: nenhuma requisição, e o valor não aparece na mensagem de erro', async () => {
    const bodies = captureSave()
    const user = await renderReady()

    const target = screen.getByRole('textbox', { name: 'Variável de ambiente (X-Api-Key)' })
    await user.clear(target)
    await user.click(target)
    await user.paste('sk-live-abc123')
    await user.click(saveButton())

    const row = within(screen.getByRole('group', { name: 'Headers HTTP' })).getAllByRole('listitem')[1]
    expect(await within(row).findByText(/Use MAIÚSCULAS/)).toBeVisible()
    expect(within(row).getByText(/Use MAIÚSCULAS/).textContent).not.toContain('sk-live')
    expect(bodies).toEqual([])
  })
})
