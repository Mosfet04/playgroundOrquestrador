import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'

import { SecretRefField } from '@/components/management/common/SecretRefField'

import { renderWithIntl } from '../helpers/intl'
import { stubBrowserApis } from '../helpers/toolForm'

// QA P3-05: o seletor só com teclado, em inglês e com valor hostil colado.

beforeAll(stubBrowserApis)

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <SecretRefField
      id="ref"
      label="API key reference"
      emptyHelp="Empty."
      value={value}
      original={initial}
      onChange={setValue}
      prefixes={['env:', 'file:']}
      status="ready"
      locked={false}
    />
  )
}

const group = () => screen.getByRole('group', { name: 'API key reference' })

describe('SecretRefField: teclado', () => {
  it('Tab leva do formato ao alvo; Enter e setas escolhem o formato; Escape fecha sem trocar', async () => {
    const user = userEvent.setup()
    renderWithIntl(<Harness />)

    await user.tab()
    expect(screen.getByRole('combobox', { name: 'Formato' })).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(screen.getByRole('listbox')).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Formato' })).toHaveTextContent('env:')

    await user.keyboard('{Enter}{ArrowDown}{Enter}')
    expect(screen.getByRole('combobox', { name: 'Formato' })).toHaveTextContent('file:')

    await user.tab()
    expect(screen.getByRole('textbox', { name: 'Caminho do arquivo' })).toHaveFocus()
    await user.keyboard('/run/secrets/openai_key')
    expect(within(group()).getByText('file:/run/secrets/openai_key')).toBeVisible()
  })
})

describe('SecretRefField: em inglês e valor hostil', () => {
  it('rótulos em inglês, sem português', () => {
    renderWithIntl(<Harness initial="env:OPENAI_API_KEY" />, { locale: 'en' })

    expect(within(group()).getByRole('combobox', { name: 'Format' })).toBeVisible()
    expect(within(group()).getByRole('textbox', { name: 'Environment variable' })).toHaveValue('OPENAI_API_KEY')
    expect(within(group()).getByText('Saved as')).toBeVisible()
    expect(group().textContent).not.toMatch(/Gravada|Variável|Só a referência|Formato/)
  })

  it('markup e valor de segredo colado viram texto no chip, sem virar elemento nem campo de senha', async () => {
    const user = userEvent.setup()
    renderWithIntl(<Harness />)

    await user.click(screen.getByRole('textbox', { name: 'Variável de ambiente' }))
    await user.paste('<img src=x onerror=alert(1)>sk-live-123')

    expect(group().querySelector('img')).toBeNull()
    expect(group().querySelector('input[type="password"]')).toBeNull()
    expect(within(group()).getByText('env:<img src=x onerror=alert(1)>sk-live-123')).toBeVisible()
  })
})
