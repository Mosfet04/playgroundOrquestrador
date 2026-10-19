import { describe, expect, it } from 'vitest'

import en from '../../messages/en.json'
import ptBR from '../../messages/pt-BR.json'

// V-P1-04-6 (glossário) nos catálogos. Cobertura por tela está nos E2E.

type Catalog = { [key: string]: string | Catalog }

function leaves(catalog: Catalog, prefix = ''): [string, string][] {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [[path, value] as [string, string]] : leaves(value, path)
  })
}

const pt = leaves(ptBR)
const english = leaves(en)

describe('glossário (docs/design/P1-04.md)', () => {
  it('pt-BR: sem "Deletar", "ferramenta", "Provider" nem "time/equipe" no lugar de Team', () => {
    const offenders = pt.filter(([, value]) =>
      /Deletar|deletar|ferramenta|\bProviders?\b|\b(time|equipe)s?\b/i.test(value)
    )
    expect(offenders).toEqual([])
  })

  it('EN: sem português nos valores (acento ou palavras do glossário)', () => {
    const offenders = english.filter(([, value]) =>
      /[áàâãéêíóôõúç]|\b(Excluir|Salvar|Cancelar|Agentes?|Ferramenta|Provedor|Sessões|Início)\b/i.test(
        value
      )
    )
    expect(offenders).toEqual([])
  })

  it('P1-05: sem a promessa de mudança aplicada na hora nem nome/navegação antigos', () => {
    const offenders = [...pt, ...english].filter(([, value]) =>
      /imediatamente|immediately|hot reload|sincroniza[çc][ãa]o autom[áa]tica|automatic sync|Agno Manager|entre abas|between tabs/i.test(value)
    )
    expect(offenders).toEqual([])
  })

  it('pt-BR: títulos de seção e de card em caixa de frase (sem Title Case)', () => {
    // chaves de título/cabeçalho; termos do glossário e nomes próprios podem ter maiúscula
    const allowed = /^(Team|Teams|Tool|Tools|Playground|Dashboard|RAG|HTTP|IA|ID|API|Agno|Manager|Retrieval|Augmented|Generation)$/
    // fora: nome da marca (metadata) e as frases de dicas/próximos passos do GettingStarted
    const titles = pt.filter(
      ([key]) =>
        !/^(metadata|home\.tips|home\.nextSteps)\b/.test(key) &&
        /(^|\.)(title|[a-zA-Z]*Title|basicInfo|modelSettings|rag|tools|http|parameters|headers|activity|sessionsByType|tokensByEntity|aiModels|embeddingModels)$/.test(key)
    )
    const titleCased = titles.filter(([, value]) =>
      value
        .replace(/^[^\p{L}]+/u, '')
        .split(/\s+/)
        .slice(1)
        .some((word) => /^\p{Lu}\p{Ll}{3,}$/u.test(word) && !allowed.test(word))
    )
    expect(titleCased).toEqual([])
  })

  it('reticências com o caractere … e não três pontos, nos dois idiomas', () => {
    const offenders = [...pt, ...english].filter(([, value]) => value.includes('...'))
    expect(offenders).toEqual([])
  })

  it('texto de interface não carrega as mensagens cruas do BFF (nenhum "success"/"error:" nos catálogos)', () => {
    const offenders = [...pt, ...english].filter(([, value]) => /\bsuccess\b|error:/i.test(value))
    expect(offenders).toEqual([])
  })
})
