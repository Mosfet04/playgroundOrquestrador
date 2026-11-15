import { secretIssue } from './secretRef'

// Diferenças entre o formulário e uma versão da config (conflito da P3-06,
// revisão antes de salvar da P4-02): uma linha por campo (ou por chave de uma
// lista) que difere. Código puro: o rótulo já vem traduzido e nenhum valor de
// segredo entra (referência, `***` e máscara são células próprias).

export type DiffCell =
  // Texto vazio ⇒ "vazio" na tela. `long`: prompt e descrições (recolhe em 4 linhas).
  | { kind: 'text'; text: string; mono: boolean; long: boolean }
  | { kind: 'bool'; on: boolean }
  | { kind: 'absent' }
  // Só os itens que não estão do outro lado; `same` = quantos são iguais nos dois.
  | { kind: 'ids'; ids: string[]; same: number }
  | { kind: 'ref'; text: string }
  // Header com o valor gravado oculto (`***`) e valor em texto (nunca exibido).
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

// `\r\n`, `\r` e `\n` são iguais: o textarea normaliza o valor só de passar pelo campo.
const asText = (value: Scalar) =>
  value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value))
    ? ''
    : String(value).replace(/\r\n?/g, '\n')

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

// Chave de API (`api_key_ref`): valor gravado fora da regra (D-P3-05-5) pode ser
// o próprio segredo colado, então só a referência válida aparece.
const secretCell = (value: Scalar, prefixes: string[]): DiffCell => {
  const text = asText(value)
  return text === '' || secretIssue(text, prefixes) === undefined
    ? textCell(text, { mono: true })
    : { kind: 'secretText' }
}

export function secretRow(
  key: string,
  label: string,
  mine: Scalar,
  current: Scalar,
  prefixes: string[]
): DiffRow[] {
  return asText(mine) === asText(current)
    ? []
    : [{ key, label, mine: secretCell(mine, prefixes), current: secretCell(current, prefixes) }]
}

const WINDOW_LINES = 4
// Iguais mantidos antes da 1ª diferença: o corte da tela conta linhas visuais
// (cerca de 120 caracteres na coluna), não as da janela (D-P4-02-5).
const KEPT_PREFIX = 40

function cutCommonPrefix(a: string, b: string) {
  let common = 0
  while (common < a.length && a[common] === b[common]) common++
  if (common <= KEPT_PREFIX) return [a, b]
  const start = common - KEPT_PREFIX
  // Não começa no meio de um emoji (par substituto).
  const cut = /[\uDC00-\uDFFF]/.test(a[start]) ? start + 1 : start
  return [`…${a.slice(cut)}`, `…${b.slice(cut)}`]
}

// Texto longo recolhido (D-P4-02-3): a janela que começa uma linha antes da
// primeira que difere; `skipped` = linhas iguais acima dela.
export function changedWindow(mine: string, current: string) {
  const a = mine.split('\n')
  const b = current.split('\n')
  let first = 0
  while (first < a.length && first < b.length && a[first] === b[first]) first++
  const skipped = Math.max(first - 1, 0)
  const slice = (lines: string[]) => lines.slice(skipped, skipped + WINDOW_LINES).join('\n')
  const [mineShown, currentShown] = cutCommonPrefix(slice(a), slice(b))
  return { skipped, mine: mineShown, current: currentShown }
}

// Ausente conta como desligado (o orquestrador usa o default, que o chamador
// já aplicou aos dois lados).
export function boolRow(key: string, label: string, mine?: boolean, current?: boolean): DiffRow[] {
  return !!mine === !!current
    ? []
    : [{ key, label, mine: { kind: 'bool', on: !!mine }, current: { kind: 'bool', on: !!current } }]
}

// Conjunto (D-P4-02-4): a UI são caixas de seleção, a ordem é a do clique.
export function idsRow(key: string, label: string, mine: string[], current: string[]): DiffRow[] {
  const inMine = new Set(mine)
  const inCurrent = new Set(current)
  const onlyMine = mine.filter((id) => !inCurrent.has(id))
  const onlyCurrent = current.filter((id) => !inMine.has(id))
  if (onlyMine.length === 0 && onlyCurrent.length === 0) return []
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

export const ABSENT: DiffCell = { kind: 'absent' }

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
  const names = [...Object.keys(mine), ...Object.keys(current).filter((name) => !Object.hasOwn(mine, name))]
  return names.flatMap((name) => {
    // O nome vem do usuário: `constructor` não pode achar o protótipo.
    const a = Object.hasOwn(mine, name) ? mine[name] : undefined
    const b = Object.hasOwn(current, name) ? current[name] : undefined
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

// Apara o que o BFF apara (`schema.ts` de cada rota): a comparação e o PUT saem do
// mesmo valor, e um espaço nas pontas não vira alteração.
export function trimFields<T extends object>(values: T, names: readonly (keyof T)[]): T {
  const trimmed = { ...values }
  for (const name of names) {
    const value = trimmed[name]
    if (typeof value === 'string') trimmed[name] = value.trim() as T[keyof T]
  }
  return trimmed
}

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
