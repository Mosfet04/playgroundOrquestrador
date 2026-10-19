import { describe, expect, it } from 'vitest'

import en from '../../messages/en.json'
import ptBR from '../../messages/pt-BR.json'

// P1-04: nenhuma chave faltando entre os dois catálogos, e os argumentos ICU
// de cada mensagem ({status}, {name}...) são os mesmos nos dois idiomas.

type Catalog = { [key: string]: string | Catalog }

function leaves(catalog: Catalog, prefix = ''): Map<string, string> {
  const result = new Map<string, string>()
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') result.set(path, value)
    else for (const entry of leaves(value, path)) result.set(...entry)
  }
  return result
}

// Só o nome do argumento: `{count, plural, one {# uso} …}` -> count.
const argumentsOf = (message: string) =>
  [...new Set([...message.matchAll(/\{\s*(\w+)\s*[,}]/g)].map(([, name]) => name))].sort()

const pt = leaves(ptBR)
const english = leaves(en)

describe('catálogos pt-BR e en', () => {
  it('têm exatamente as mesmas chaves', () => {
    const missingInEn = [...pt.keys()].filter((key) => !english.has(key))
    const missingInPt = [...english.keys()].filter((key) => !pt.has(key))
    expect({ missingInEn, missingInPt }).toEqual({ missingInEn: [], missingInPt: [] })
  })

  it('não têm mensagem vazia', () => {
    const empty = [...pt, ...english].filter(([, value]) => value.trim() === '')
    expect(empty).toEqual([])
  })

  it('usam os mesmos argumentos em cada mensagem', () => {
    const mismatched = [...pt]
      .filter(([key]) => english.has(key))
      .filter(
        ([key, value]) =>
          argumentsOf(value).join() !== argumentsOf(english.get(key) ?? '').join()
      )
      .map(([key]) => key)
    expect(mismatched).toEqual([])
  })
})
