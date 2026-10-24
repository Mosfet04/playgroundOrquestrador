import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import ptBR from '../../messages/pt-BR.json'

// P1-04b: o namespace `playground` não guarda chave morta. Chave inexistente
// (ou `streamErrorKind` inválido) já é barrada pelo typecheck, porque
// `AppConfig.Messages` tipa as chaves (TS2345), então não se repete aqui.

const ROOT = join(__dirname, '../../src')
const SCOPE = ['components/playground', 'hooks', 'components/ui/sonner.tsx']
const filesOf = (path: string): string[] =>
  statSync(path).isDirectory()
    ? readdirSync(path).flatMap((entry) => filesOf(join(path, entry)))
    : /\.tsx?$/.test(path)
      ? [path]
      : []

// O namespace de cada função vem do `useTranslations('ns')` do próprio arquivo.
const used = SCOPE.flatMap((entry) => filesOf(join(ROOT, entry))).flatMap((file) => {
  const source = readFileSync(file, 'utf8')
  const namespaces = new Map(
    [...source.matchAll(/\b(\w+) = useTranslations\((?:'(\w+)')?\)/g)].map(
      ([, name, namespace]) => [name, namespace ?? 'playground']
    )
  )
  return [...source.matchAll(/\b(\w+)(?:\.rich)?\(\s*(['`])([\w.${}]+)\2/g)]
    .filter(([, name]) => namespaces.has(name))
    .map(([, name, , key]) => ({ file, namespace: namespaces.get(name) as string, key }))
})

describe('chaves do playground nos catálogos', () => {
  it('encontra as chaves do escopo (a regex não ficou cega)', () => {
    expect(used.length).toBeGreaterThan(40)
  })

  it('o namespace playground não tem chave sem uso', () => {
    const usedKeys = new Set(
      used.filter(({ namespace }) => namespace === 'playground').map(({ key }) => key)
    )
    const dead = Object.keys(ptBR.playground).filter(
      (key) => key !== 'streamErrorKind' && !usedKeys.has(key)
    )
    expect(dead).toEqual([])
  })
})
