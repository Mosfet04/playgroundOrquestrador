import { describe, expect, it } from 'vitest'

import { diffTool } from '@/components/management/tools/toolDiff'
import { changedWindow, paramsRows } from '@/lib/formDiff'
import type { CreateToolForm } from '@/types/management'

// QA da P4-02: propriedades da janela de texto longo e nomes hostis nas listas por
// chave. Os casos pontuais da janela estão em formDiff.test.ts.

const SKIP_LOW_SURROGATE = /^…[\uDC00-\uDFFF]/

// Texto determinístico com o que costuma quebrar a varredura: \r\n, emoji, vazio.
function randomText(seed: { value: number }, size: number) {
  const pieces = ['a', 'b', ' ', '\n', '\r\n', '😀', '😁', '😀😁😀😁😀😁😀😁😀😁😀😁', 'palavra longa o bastante '.repeat(3), '']
  let text = ''
  for (let index = 0; index < size; index++) {
    seed.value = (seed.value * 1103515245 + 12345) & 0x7fffffff
    text += pieces[seed.value % pieces.length]
  }
  return text
}

describe('changedWindow: propriedades', () => {
  it('as duas caixas sempre diferem, o corte é o mesmo nos dois lados e nunca parte um emoji', () => {
    const seed = { value: 42 }
    let compared = 0
    let cuts = 0
    for (let round = 0; round < 2000; round++) {
      const base = randomText(seed, 30)
      const a = base + randomText(seed, 3)
      const b = base + randomText(seed, 3)
      if (a === b) continue
      compared++
      const { mine, current, skipped } = changedWindow(a, b)

      expect(mine).not.toBe(current)
      expect(mine.startsWith('…')).toBe(current.startsWith('…'))
      expect(skipped).toBeGreaterThanOrEqual(0)
      // O "…" só tira o que é igual: o que sobrou é o final do trecho de cada lado.
      if (mine.startsWith('…')) {
        const lines = (text: string) => text.split('\n').slice(skipped, skipped + 4).join('\n')
        expect(lines(a).endsWith(mine.slice(1))).toBe(true)
        expect(lines(b).endsWith(current.slice(1))).toBe(true)
        const cut = lines(a).length - (mine.length - 1)
        expect(lines(b).length - (current.length - 1)).toBe(cut)
        expect(lines(a).slice(0, cut)).toBe(lines(b).slice(0, cut))
        cuts++
        expect(mine).not.toMatch(SKIP_LOW_SURROGATE)
        expect(current).not.toMatch(SKIP_LOW_SURROGATE)
      }
      // As linhas puladas são iguais nos dois lados.
      expect(a.split('\n').slice(0, skipped)).toEqual(b.split('\n').slice(0, skipped))
    }
    expect(compared).toBeGreaterThan(1000)
    expect(cuts).toBeGreaterThan(100)
  })

  it('linha única de 100 KB com a mudança no fim: só o trecho final, nos dois lados', () => {
    const line = 'x'.repeat(100_000)
    const { mine, current, skipped } = changedWindow(`${line}A`, `${line}B`)

    expect(skipped).toBe(0)
    expect(mine).toBe(`…${'x'.repeat(40)}A`)
    expect(current).toBe(`…${'x'.repeat(40)}B`)
  })

  it('emoji no ponto de corte (posição ímpar, o corte cairia no meio do par): o par fica inteiro de fora', () => {
    const start = `${'😀'.repeat(50)}x`
    const { mine, current } = changedWindow(`${start}A`, `${start}B`)

    expect(mine).not.toMatch(SKIP_LOW_SURROGATE)
    expect(current).not.toMatch(SKIP_LOW_SURROGATE)
    expect(mine.endsWith('xA')).toBe(true)
    expect(current.endsWith('xB')).toBe(true)
    expect(mine.slice(1, -2)).toBe('😀'.repeat(19))
  })
})

const tool = (extra: Partial<CreateToolForm>): CreateToolForm => ({
  id: 't',
  name: 'T',
  description: 'd',
  route: 'https://x.test/',
  http_method: 'GET',
  instructions: '',
  active: true,
  headers: {},
  parameters: [],
  ...extra
})
const label = (key: string) => key

describe('BUG P4-02-B4: nome de header ou parâmetro igual a uma propriedade de Object', () => {
  const OWN = (name: string, value: unknown) => Object.fromEntries([[name, value]]) as Record<string, string>

  it.each(['constructor', 'toString', 'valueOf'])('header novo chamado %s não derruba a comparação', (name) => {
    const rows = diffTool(tool({ headers: OWN(name, 'valor') }), tool({}), label, ['env:', 'file:'])

    expect(rows.map((row) => row.current)).toEqual([{ kind: 'absent' }])
  })

  it('parâmetro novo chamado constructor tem "Antes" ausente, não uma célula de lixo', () => {
    const parameter = { name: 'constructor', type: 'string', description: 'd', required: false }
    const rows = diffTool(tool({ parameters: [parameter] }), tool({}), label, ['env:', 'file:'])

    expect(rows[0].current).toEqual({ kind: 'absent' })
  })

  it('parâmetro do modelo gravado chamado valueOf, removido: a remoção vira linha', () => {
    expect(paramsRows('model_params', 'Params', {}, OWN('valueOf', '1'))).toHaveLength(1)
  })
})
