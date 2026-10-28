import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { SecretRefField } from '@/components/management/common/SecretRefField'

import { renderWithIntl } from '../helpers/intl'

// P3-05 (D-P3-05-1, D-P3-05-5): o seletor de segredo único. Spec:
// docs/design/P3-05.md §3 (V-P3-05-1..10).

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
})

function Harness({
  initial = '',
  prefixes = ['env:', 'file:'],
  status = 'ready',
  locked = false,
  error,
  seen
}: {
  initial?: string
  prefixes?: string[]
  status?: 'loading' | 'error' | 'ready'
  locked?: boolean
  error?: string
  seen?: string[]
}) {
  const [value, setValue] = useState(initial)
  return (
    <SecretRefField
      id="ref"
      label="Referência da chave de API"
      emptyHelp="Vazio: o agente não define chave própria."
      value={value}
      original={initial}
      onChange={(next) => {
        seen?.push(next)
        setValue(next)
      }}
      prefixes={prefixes}
      status={status}
      locked={locked}
      error={error}
    />
  )
}

const group = () => screen.getByRole('group', { name: 'Referência da chave de API' })
const format = () => screen.getByRole('combobox', { name: 'Formato' })
const target = (name = 'Variável de ambiente') => screen.getByRole('textbox', { name })
const output = () => within(group()).getByText('Gravada como')

describe('SecretRefField', () => {
  it('V-1/2: vazio mostra env:, o alvo com exemplo, o chip "—" e a ajuda terminando em "Vazio: …"', () => {
    renderWithIntl(<Harness />)

    expect(format()).toHaveTextContent('env:')
    expect(target()).toHaveValue('')
    expect(target()).toHaveAttribute('placeholder', 'ex.: OPENAI_API_KEY')
    expect(target()).toHaveAttribute('autocomplete', 'off')
    expect(target()).toHaveAttribute('type', 'text')
    expect(output()).toHaveTextContent(/Gravada como\s*—\s*vazio/)
    expect(group()).toHaveTextContent('Só a referência, nunca a chave.')
    expect(group()).toHaveTextContent('Variável de ambiente do servidor do orquestrador')
    expect(group()).toHaveTextContent(/Vazio: o agente não define chave própria\.$/)
  })

  it('o rótulo leva ao alvo e o Input descreve chip, ajuda e erro', () => {
    renderWithIntl(<Harness error="Valor recusado pelo orquestrador" />)

    expect(target()).toHaveAccessibleDescription(
      /Gravada como.*Só a referência.*Valor recusado pelo orquestrador/
    )
    expect(target()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Valor recusado pelo orquestrador').closest('p')).toHaveClass(
      'text-destructive'
    )
  })

  it('digitar o alvo monta formato + alvo e mostra a referência', async () => {
    const seen: string[] = []
    const user = userEvent.setup()
    renderWithIntl(<Harness seen={seen} />)

    await user.type(target(), 'OPENAI_API_KEY')

    expect(seen.at(-1)).toBe('env:OPENAI_API_KEY')
    expect(output()).toHaveTextContent('Gravada como env:OPENAI_API_KEY')
  })

  it('V-3: trocar para file: muda placeholder, rótulo do alvo e ajuda; mantém o alvo', async () => {
    const seen: string[] = []
    const user = userEvent.setup()
    renderWithIntl(<Harness initial="env:OPENAI_API_KEY" seen={seen} />)

    await user.click(format())
    await user.click(screen.getByRole('option', { name: 'file:' }))

    expect(format()).toHaveTextContent('file:')
    expect(target('Caminho do arquivo')).toHaveValue('OPENAI_API_KEY')
    expect(target('Caminho do arquivo')).toHaveAttribute('placeholder', 'ex.: /run/secrets/openai_key')
    expect(group()).toHaveTextContent('Caminho absoluto de um arquivo do servidor do orquestrador')
    expect(seen.at(-1)).toBe('file:OPENAI_API_KEY')
  })

  it('formato escolhido sem alvo fica escolhido e o valor segue vazio', async () => {
    const seen: string[] = []
    const user = userEvent.setup()
    renderWithIntl(<Harness seen={seen} />)

    await user.click(format())
    await user.click(screen.getByRole('option', { name: 'file:' }))

    expect(format()).toHaveTextContent('file:')
    expect(seen.at(-1)).toBe('')
    expect(target('Caminho do arquivo')).toHaveValue('')
  })

  it('V-6: colar a referência completa separa formato e alvo e anuncia o formato', async () => {
    const seen: string[] = []
    const user = userEvent.setup()
    renderWithIntl(<Harness initial="file:/run/secrets/x" seen={seen} />)

    const field = target('Caminho do arquivo')
    await user.clear(field)
    await user.click(field)
    await user.paste('env:OPENAI_API_KEY')

    expect(format()).toHaveTextContent('env:')
    expect(target()).toHaveValue('OPENAI_API_KEY')
    expect(seen.at(-1)).toBe('env:OPENAI_API_KEY')
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Formato env: aplicado')
  })

  it('apagar o alvo deixa a referência vazia', async () => {
    const seen: string[] = []
    const user = userEvent.setup()
    renderWithIntl(<Harness initial="env:OPENAI_API_KEY" seen={seen} />)

    await user.clear(target())

    expect(seen.at(-1)).toBe('')
    expect(output()).toHaveTextContent(/Gravada como\s*—\s*vazio/)
  })

  it('nunca mostra o valor como senha nem pede a chave', () => {
    renderWithIntl(<Harness initial="env:OPENAI_API_KEY" />)

    expect(document.querySelector('input[type="password"]')).toBeNull()
  })

  describe('valor gravado fora da regra (D-P3-05-5)', () => {
    it('V-7: env:openai_key abre preenchido com aviso, sem erro', () => {
      renderWithIntl(<Harness initial="env:openai_key" />)

      expect(format()).toHaveTextContent('env:')
      expect(target()).toHaveValue('openai_key')
      const warning = within(group()).getByText(/está fora da regra do orquestrador/)
      expect(warning.closest('p')).toHaveClass('text-warning')
      expect(target()).not.toHaveAttribute('aria-invalid')
      expect(target()).toHaveAccessibleDescription(/fora da regra do orquestrador/)
    })

    it('alterado o alvo, o aviso some (a regra vale e o erro vem do formulário)', async () => {
      const user = userEvent.setup()
      renderWithIntl(<Harness initial="env:openai_key" />)

      await user.type(target(), 'x')

      expect(within(group()).queryByText(/está fora da regra do orquestrador/)).toBeNull()
    })

    it('V-8: sem prefixo abre com o Select em "Formato" e o valor inteiro no alvo', () => {
      renderWithIntl(<Harness initial="sk-abc123" />)

      expect(format()).toHaveTextContent('Formato')
      expect(target('Alvo da referência')).toHaveValue('sk-abc123')
      expect(group()).toHaveTextContent('não usa nenhum formato aceito (env:, file:)')
      expect(group()).toHaveTextContent('Escolha o formato da referência.')
    })

    it('V-8: vault:prod/openai mostra vault: selecionado e na lista, e o aviso o cita', async () => {
      const user = userEvent.setup()
      renderWithIntl(<Harness initial="vault:prod/openai" />)

      expect(format()).toHaveTextContent('vault:')
      expect(target('Alvo da referência')).toHaveValue('prod/openai')
      expect(group()).toHaveTextContent('O formato vault: não está entre os aceitos (env:, file:)')
      await user.click(format())
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        'env:',
        'file:',
        'vault:'
      ])
    })
  })

  describe('V-9: schema e só leitura', () => {
    it('carregando: Select e Input desabilitados com o valor gravado visível e o aviso', () => {
      renderWithIntl(<Harness initial="env:OPENAI_API_KEY" prefixes={[]} status="loading" locked />)

      expect(format()).toBeDisabled()
      expect(format()).toHaveTextContent('env:')
      expect(target()).toBeDisabled()
      expect(target()).toHaveValue('OPENAI_API_KEY')
      expect(
        within(group()).getByText('Carregando formatos do orquestrador…').closest('[role="status"]')
      ).toBeInTheDocument()
      expect(group()).toHaveAttribute('aria-busy', 'true')
      // Sem formatos não há como avaliar o valor gravado: nenhum aviso falso.
      expect(group()).not.toHaveTextContent('não está entre os aceitos')
      expect(group().querySelector('.text-warning')).toBeNull()
      expect(output()).toHaveTextContent('Gravada como env:OPENAI_API_KEY')
    })

    it('falha: desabilitado e a ajuda diz de onde vêm os formatos', () => {
      renderWithIntl(<Harness initial="env:OPENAI_API_KEY" prefixes={[]} status="error" locked />)

      expect(format()).toBeDisabled()
      expect(target('Variável de ambiente')).toBeDisabled()
      expect(group()).toHaveTextContent('Os formatos vêm do orquestrador.')
      expect(group().querySelector('.text-warning')).toBeNull()
      expect(within(group()).queryByText('Carregando formatos do orquestrador…')).toBeNull()
    })

    it('só leitura: desabilitado, valor e chip visíveis', () => {
      renderWithIntl(<Harness initial="file:/run/secrets/key" locked />)

      expect(format()).toBeDisabled()
      expect(target('Caminho do arquivo')).toBeDisabled()
      expect(output()).toHaveTextContent('Gravada como file:/run/secrets/key')
    })
  })

  it('o caminho longo quebra linha no chip em vez de cortar', async () => {
    const path = `file:/run/secrets/${'a'.repeat(120)}`
    renderWithIntl(<Harness initial={path} />)

    await waitFor(() => expect(output()).toHaveTextContent(path))
    expect(within(output()).getByText(path)).toHaveClass('whitespace-normal', 'break-all')
  })
})
