import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Foco por teclado do Design System (V8) para links fora do Button.
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export const truncateText = (text: string, limit: number) => {
  if (text) {
    return text.length > limit ? `${text.slice(0, limit)}..` : text
  }
  return ''
}

// Sem regex: a antiga tinha backtracking exponencial (BUG-P0-02-1, decisão 0002).
// Credencial na URL é recusada: o endpoint fica no localStorage (decisão 0006).
export const isValidUrl = (url: string): boolean => {
  try {
    const { protocol, username, password } = new URL(url.trim())
    const isHttp = protocol === 'http:' || protocol === 'https:'
    return isHttp && username === '' && password === ''
  } catch {
    return false
  }
}

// Trecho de URL (ex.: `params.id` do App Router, que o Next 15.2 entrega
// codificado). Sequência % inválida volta como veio.
export const decodeUrlSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

// Texto do usuário usado em `$regex` do Mongo casa como literal.
export const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const getJsonMarkdown = (content: object = {}) => {
  let jsonBlock = ''
  try {
    jsonBlock = `\`\`\`json\n${JSON.stringify(content, null, 2)}\n\`\`\``
  } catch {
    jsonBlock = `\`\`\`\n${String(content)}\n\`\`\``
  }

  return jsonBlock
}
