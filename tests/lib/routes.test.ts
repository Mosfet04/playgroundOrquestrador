import { describe, expect, it } from 'vitest'

import { activeState, describeRoute } from '@/components/layout/routes'

// P1-03, comportamento 2: item ativo por igualdade (`page`) ou sub-rota
// (`true`); em `/` só por igualdade. Entrada hostil não pode casar por prefixo.

describe('activeState', () => {
  it.each([
    ['/', '/', 'page'],
    ['/agents', '/agents', 'page'],
    ['/agents/x', '/agents', 'true'],
    ['/agents/new', '/agents', 'true'],
    ['/agents/a%2Fb%3Fc', '/agents', 'true'],
    ['/tools/clima', '/tools', 'true']
  ])('%s em %s -> %s', (pathname, href, expected) => {
    expect(activeState(pathname, href)).toBe(expected)
  })

  it.each([
    ['/agentsx', '/agents'],
    ['/agents-old/x', '/agents'],
    ['/tools', '/agents'],
    ['/playground/x', '/'],
    ['/agents', '/'],
    ['/dashboard', '/playground']
  ])('%s não ativa %s', (pathname, href) => {
    expect(activeState(pathname, href)).toBeUndefined()
  })
})

// Rótulos são chaves do catálogo `nav` (P1-04); o cabeçalho traduz.
describe('describeRoute', () => {
  it('lista: grupo e seção sem trilha de detalhe', () => {
    expect(describeRoute('/agents')).toEqual({
      group: 'configure',
      label: 'agents',
      subtitle: 'configure'
    })
  })

  it('/ não tem grupo e usa "playground" como subtítulo', () => {
    expect(describeRoute('/')).toEqual({ label: 'home', subtitle: 'playground' })
  })

  it.each([
    ['/agents/new', 'newAgent', 'agents'],
    ['/tools/new', 'newTool', 'tools']
  ] as const)('%s: rótulo de criação, não um id', (pathname, label, section) => {
    expect(describeRoute(pathname)).toEqual({
      group: 'configure',
      section: { href: `/${section}`, label: section },
      label,
      subtitle: section
    })
  })

  it('detalhe: o id decodificado aparece como texto, sem interpretação', () => {
    expect(describeRoute('/agents/%3Cscript%3E%20a%2Fb')).toEqual({
      group: 'configure',
      section: { href: '/agents', label: 'agents' },
      id: '<script> a/b',
      subtitle: 'agents'
    })
  })

  it('sequência % inválida volta como veio e não quebra', () => {
    expect(describeRoute('/tools/%E0%A4%A').id).toBe('%E0%A4%A')
  })

  it('rota fora do mapa devolve trilha vazia', () => {
    expect(describeRoute('/nao-existe')).toEqual({})
  })
})
