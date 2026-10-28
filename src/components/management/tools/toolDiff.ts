import { defaultText } from '@/lib/toolDefault'
import { keyedRows, textRow, type DiffCell, type DiffRow } from '@/lib/formDiff'
import { isReference } from '@/lib/secretRef'
import { MASK } from '@/lib/toolHeaders'
import type { CreateToolForm, Parameter } from '@/types/management'

// Campos do formulário da tool na ordem da tela (P3-06). Header em texto nunca
// aparece: só que difere (o texto pode ser um segredo digitado).
type Label = 'name' | 'description' | 'instructions' | 'method' | 'route' | 'headers' | 'parameters'

const headerCell = (prefixes: string[]) => (value: string): DiffCell =>
  value === MASK
    ? { kind: 'stored' }
    : isReference(value, prefixes)
      ? { kind: 'ref', text: value }
      : { kind: 'secretText' }

const parameterCell = (parameter: Parameter): DiffCell => ({
  kind: 'param',
  type: parameter.type,
  required: parameter.required,
  fallback: defaultText(parameter.default_value),
  description: parameter.description
})

const sameParameter = (a: Parameter, b: Parameter) =>
  a.type === b.type &&
  a.required === b.required &&
  a.description === b.description &&
  JSON.stringify(a.default_value ?? null) === JSON.stringify(b.default_value ?? null)

const byName = (parameters: Parameter[]) =>
  Object.fromEntries(parameters.map((parameter) => [parameter.name, parameter]))

export function diffTool(
  mine: CreateToolForm,
  current: CreateToolForm,
  t: (key: Label) => string,
  prefixes: string[]
): DiffRow[] {
  const l = (key: Label) => t(key).replace(/\s*\*$/, '')
  const mono = { mono: true }
  return [
    ...textRow('name', l('name'), mine.name, current.name),
    ...textRow('description', l('description'), mine.description, current.description, { long: true }),
    ...textRow('instructions', l('instructions'), mine.instructions, current.instructions, { long: true }),
    ...textRow('http_method', l('method'), mine.http_method, current.http_method, mono),
    ...textRow('route', l('route'), mine.route, current.route, mono),
    ...keyedRows('headers', l('headers'), mine.headers, current.headers, headerCell(prefixes), (a, b) => a === b),
    ...keyedRows('parameters', l('parameters'), byName(mine.parameters), byName(current.parameters), parameterCell, sameParameter)
  ]
}

