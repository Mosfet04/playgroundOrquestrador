import { defaultText, parseDefault, type DefaultKind } from '@/lib/toolDefault'
import { isReference } from '@/lib/secretRef'
import { headerProblems, MASK, type HeaderProblem, type HeaderRow } from '@/lib/toolHeaders'
import { missingParams, routePlaceholders, spacedPlaceholders } from '@/lib/toolRoute'
import type { CreateToolForm, Tool } from '@/types/management'

// Formatos de referência que o orquestrador aceita (o schema os confirma).
const REFERENCE_PREFIXES = ['env:', 'file:']

// Valores do formulário da tool. O `default_value` do parâmetro é texto
// (D-P3-03-1) e os headers são linhas nome + valor: `hidden` é o valor gravado
// oculto (`***`), `stored` marca a linha que veio assim do orquestrador (pode
// voltar a ficar oculta). `toPayload` os transforma no corpo do BFF.
export type ParameterRow = {
  name: string
  type: string
  description: string
  required: boolean
  default_text: string
}
export type HeaderFormRow = HeaderRow & { stored: boolean }
export type ToolFormValues = Omit<CreateToolForm, 'headers' | 'parameters'> & {
  parameters: ParameterRow[]
  headers: HeaderFormRow[]
}

export const toFormValues = (tool?: Tool | null): ToolFormValues => ({
  id: tool?.id ?? '',
  name: tool?.name ?? '',
  description: tool?.description ?? '',
  route: tool?.route ?? '',
  http_method: tool?.http_method ?? 'GET',
  instructions: tool?.instructions ?? '',
  active: tool?.active ?? true,
  parameters: (tool?.parameters ?? []).map((parameter) => ({
    name: parameter.name,
    type: parameter.type,
    description: parameter.description,
    required: parameter.required,
    default_text: defaultText(parameter.default_value)
  })),
  headers: Object.entries(tool?.headers ?? {}).map(([name, value]) => ({
    name,
    value,
    hidden: value === MASK,
    stored: value === MASK,
    // Referência gravada abre como Segredo (P3-05); o modo é do valor lido, o
    // schema só entra depois (o aviso de fora da regra, o seletor).
    mode: value !== MASK && isReference(value, REFERENCE_PREFIXES) ? 'secret' : 'text',
    original: value === MASK ? '' : value
  }))
})

// Parâmetro cujo nome está na rota é obrigatório (D-P3-03-2).
export function toPayload(values: ToolFormValues): CreateToolForm {
  const inRoute = routePlaceholders(values.route)
  const { parameters, headers, ...rest } = values
  return {
    ...rest,
    headers: Object.fromEntries(headers.map(({ name, value }) => [name.trim(), value])),
    parameters: parameters.map(({ default_text, required, ...parameter }) => {
      const parsed = parseDefault(parameter.type, default_text)
      const name = parameter.name.trim()
      return {
        ...parameter,
        name,
        required: required || inRoute.includes(name),
        ...(parsed.ok && parsed.value !== undefined ? { default_value: parsed.value } : {})
      }
    })
  }
}

// O que impede o envio, calculado no cliente (nada sai do browser enquanto
// houver): placeholder da rota sem parâmetro, valor padrão que não converte
// pelo tipo, header inválido.
export interface ToolProblems {
  missing: string[]
  // Placeholder com espaço nas pontas: não casa com nenhum parâmetro.
  spaced: string[]
  defaults: (DefaultKind | undefined)[]
  headers: HeaderProblem[]
}

export function toolProblems(values: ToolFormValues, prefixes: string[]): ToolProblems {
  return {
    missing: missingParams(
      values.route,
      values.parameters.map(({ name }) => name)
    ),
    spaced: spacedPlaceholders(values.route),
    defaults: values.parameters.map(({ type, default_text }) => {
      const parsed = parseDefault(type, default_text)
      return parsed.ok ? undefined : parsed.type
    }),
    headers: headerProblems(values.headers, prefixes)
  }
}
