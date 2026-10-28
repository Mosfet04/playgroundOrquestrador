// Diferenças entre o formulário e a versão atual da config (P3-06, D-P3-06-1):
// uma linha por campo (ou por chave de uma lista) que difere. Código puro: o
// rótulo já vem traduzido e nenhum valor de segredo entra (referência, `***` e
// máscara são células próprias).

export type DiffCell =
  // Texto vazio ⇒ "vazio" na tela. `long`: prompt e descrições (recolhe em 4 linhas).
  | { kind: 'text'; text: string; mono: boolean; long: boolean }
  | { kind: 'bool'; on: boolean }
  | { kind: 'absent' }
  // Só os itens que não estão do outro lado; `same` = quantos são iguais nos dois.
  | { kind: 'ids'; ids: string[]; same: number }
  // Mesmos itens em outra ordem: a lista inteira.
  | { kind: 'order'; ids: string[] }
  | { kind: 'ref'; text: string }
  // Header com o valor gravado oculto (`***`) e header em texto (nunca exibido).
  | { kind: 'stored' }
  | { kind: 'secretText' }
  | { kind: 'param'; type: string; required: boolean; fallback: string; description: string }

export type DiffRow = {
  key: string
  label: string
  /** Chave da lista (header, parâmetro): a linha lê "label › item". */
  item?: string
  mine: DiffCell
  current: DiffCell
}

type Scalar = string | number | boolean | null | undefined
type Options = { mono?: boolean; long?: boolean }

const asText = (value: Scalar) =>
  value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value))
    ? ''
    : String(value)

export const textCell = (value: Scalar, { mono = false, long = false }: Options = {}): DiffCell => ({
  kind: 'text',
  text: asText(value),
  mono,
  long
})

export function textRow(
  key: string,
  label: string,
  mine: Scalar,
  current: Scalar,
  options?: Options
): DiffRow[] {
  return asText(mine) === asText(current)
    ? []
    : [{ key, label, mine: textCell(mine, options), current: textCell(current, options) }]
}

// Ausente conta como desligado (o orquestrador usa o default, que o chamador
// já aplicou aos dois lados).
export function boolRow(key: string, label: string, mine?: boolean, current?: boolean): DiffRow[] {
  return !!mine === !!current
    ? []
    : [{ key, label, mine: { kind: 'bool', on: !!mine }, current: { kind: 'bool', on: !!current } }]
}

export function idsRow(key: string, label: string, mine: string[], current: string[]): DiffRow[] {
  const inMine = new Set(mine)
  const inCurrent = new Set(current)
  const onlyMine = mine.filter((id) => !inCurrent.has(id))
  const onlyCurrent = current.filter((id) => !inMine.has(id))
  if (onlyMine.length === 0 && onlyCurrent.length === 0) {
    return mine.join('\n') === current.join('\n')
      ? []
      : [{ key, label, mine: { kind: 'order', ids: mine }, current: { kind: 'order', ids: current } }]
  }
  const same = mine.length - onlyMine.length
  return [
    {
      key,
      label,
      mine: { kind: 'ids', ids: onlyMine, same },
      current: { kind: 'ids', ids: onlyCurrent, same }
    }
  ]
}

const ABSENT: DiffCell = { kind: 'absent' }

// Lista por chave: uma linha por chave que difere; a chave só de um lado mostra
// "ausente" no outro. A ordem é a do formulário, depois as só da versão atual.
export function keyedRows<T>(
  key: string,
  label: string,
  mine: Record<string, T>,
  current: Record<string, T>,
  cell: (value: T) => DiffCell,
  equal: (a: T, b: T) => boolean
): DiffRow[] {
  const names = [...Object.keys(mine), ...Object.keys(current).filter((name) => !(name in mine))]
  return names.flatMap((name) => {
    const a = name in mine ? mine[name] : undefined
    const b = name in current ? current[name] : undefined
    if (a !== undefined && b !== undefined && equal(a, b)) return []
    return [
      {
        key: `${key}:${name}`,
        label,
        item: name,
        mine: a === undefined ? ABSENT : cell(a),
        current: b === undefined ? ABSENT : cell(b)
      }
    ]
  })
}

type ParamValue = string | number | boolean

export const paramsRows = (
  key: string,
  label: string,
  mine: Record<string, ParamValue> = {},
  current: Record<string, ParamValue> = {}
) =>
  keyedRows(
    key,
    label,
    mine,
    current,
    (value) => textCell(value, { mono: true }),
    (a, b) => String(a) === String(b)
  )

// Valor padrão que falta nos dois lados (execução do agent, do team): o da
// versão atual ausente vale o default do schema, como no formulário.
export function withDefaults<T extends object>(values: T, defaults: Partial<T>): T {
  const filled = { ...values }
  for (const name of Object.keys(defaults) as (keyof T)[]) {
    const value = filled[name]
    const missing = value === undefined || (typeof value === 'number' && Number.isNaN(value))
    if (missing && defaults[name] !== undefined) filled[name] = defaults[name]
  }
  return filled
}
