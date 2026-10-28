// Valor de um parâmetro do modelo (D-P3-02-2): o formulário guarda texto e o
// tipo é inferido, sem tipo explícito por linha. Número = decimal com ponto
// (sinal e expoente opcionais) finito; booleano = `true`/`false` exatos; o
// resto é texto (inclui `0,7`, `0x10`, `NaN`, `Infinity`). Limite aceito: um
// número que o usuário queira como texto (ex.: `stop: "1"`) não é expresso.
export type ParamKind = 'empty' | 'number' | 'boolean' | 'text'

const NUMBER = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/

export function paramKind(text: string): ParamKind {
  if (text === '') return 'empty'
  if (text === 'true' || text === 'false') return 'boolean'
  return NUMBER.test(text) && Number.isFinite(Number(text)) ? 'number' : 'text'
}

export function paramValue(text: string): string | number | boolean {
  const kind = paramKind(text)
  if (kind === 'number') return Number(text)
  if (kind === 'boolean') return text === 'true'
  return text
}
