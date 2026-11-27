// Valor de um parâmetro do modelo (D-P3-02-2): o formulário guarda texto e o
// tipo é inferido, sem tipo explícito por linha. Número = decimal finito com
// ponto ou com uma vírgula decimal (`0,7` = `0.7`, D-QA1-06-1), sinal e
// expoente opcionais; booleano = `true`/`false` exatos; o resto é texto (inclui
// `1,000.5`, `0,7,1`, `0x10`, `NaN`, `Infinity`). Limite aceito: um número que o
// usuário queira como texto (ex.: `stop: "1"`) não é expresso.
export type ParamKind = 'empty' | 'number' | 'boolean' | 'text'

const NUMBER = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/

// Número finito escrito com ponto (também o `float` da tool, src/lib/toolDefault).
export const isNumberText = (text: string) => NUMBER.test(text) && Number.isFinite(Number(text))

// A 1ª vírgula vira ponto: com ponto ou outra vírgula, o texto não casa com NUMBER.
const withDot = (text: string) => text.replace(',', '.')

export function paramKind(text: string): ParamKind {
  if (text === '') return 'empty'
  if (text === 'true' || text === 'false') return 'boolean'
  return isNumberText(withDot(text)) ? 'number' : 'text'
}

export function paramValue(text: string): string | number | boolean {
  const kind = paramKind(text)
  if (kind === 'number') return Number(withDot(text))
  if (kind === 'boolean') return text === 'true'
  return text
}

// Parâmetros que os provedores só aceitam com número (D-QA1-06-1): com texto ou
// booleano, a chamada ao modelo quebra em runtime.
const NUMERIC_PARAMS = new Set(['temperature', 'top_p', 'top_k', 'seed', 'frequency_penalty', 'presence_penalty'])

export const isNumericParam = (name: string) => NUMERIC_PARAMS.has(name) || /^max_./.test(name)
