import { paramKind } from '@/lib/modelParams'

// `default_value` do parâmetro da tool (D-P3-03-1): o formulário guarda texto e
// o valor sai convertido pelo tipo declarado. O orquestrador só o grava (a
// chamada não o usa); aqui ele serve de exemplo no preview.
export type DefaultKind = 'integer' | 'float' | 'object' | 'array'
export type ParsedDefault =
  | { ok: true; value: unknown } // `undefined` = ausente
  | { ok: false; type: DefaultKind }

const INTEGER = /^[+-]?\d+$/

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // JSON inválido: o chamador recusa o texto, sem guardar o erro do parser.
    return undefined
  }
}

export function parseDefault(type: string, text: string): ParsedDefault {
  if (text === '') return { ok: true, value: undefined }
  const trimmed = text.trim()
  switch (type) {
    case 'integer': {
      if (trimmed === '') return { ok: true, value: undefined }
      const value = Number(trimmed)
      return INTEGER.test(trimmed) && Number.isSafeInteger(value)
        ? { ok: true, value }
        : { ok: false, type }
    }
    case 'float':
      if (trimmed === '') return { ok: true, value: undefined }
      return paramKind(trimmed) === 'number'
        ? { ok: true, value: Number(trimmed) }
        : { ok: false, type }
    case 'boolean':
      return { ok: true, value: trimmed === 'true' ? true : trimmed === 'false' ? false : undefined }
    case 'object':
    case 'array': {
      if (trimmed === '') return { ok: true, value: undefined }
      const value = parseJson(trimmed)
      const fits =
        type === 'array'
          ? Array.isArray(value)
          : typeof value === 'object' && value !== null && !Array.isArray(value)
      return fits ? { ok: true, value } : { ok: false, type }
    }
    default:
      return { ok: true, value: text }
  }
}

// Valor gravado -> texto do campo (ausente ou nulo = vazio).
export function defaultText(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
