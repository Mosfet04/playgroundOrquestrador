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

describe('describeRoute', () => {
  it('lista: grupo e seção sem trilha de detalhe', () => {
    expect(describeRoute('/agents')).toMatchObject({
      group: 'Configurar',
      current: 'Agentes',
      isId: false,
      subtitle: 'configurar'
    })
  })

  it('/ não tem grupo e usa "playground" como subtítulo', () => {
    expect(describeRoute('/')).toMatchObject({
      group: undefined,
      current: 'Início',
      subtitle: 'playground'
    })
  })

  it.each([
    ['/agents/new', 'Novo agente', 'Agentes'],
    ['/tools/new', 'Nova tool', 'Tools']
  ])('%s: rótulo de criação, não um id', (pathname, current, section) => {
    expect(describeRoute(pathname)).toMatchObject({
      current,
      isId: false,
      section: { label: section }
    })
  })

  it('detalhe: o id decodificado aparece como texto, sem interpretação', () => {
    expect(describeRoute('/agents/%3Cscript%3E%20a%2Fb')).toMatchObject({
      current: '<script> a/b',
      isId: true,
      section: { href: '/agents', label: 'Agentes' }
    })
  })

  it('sequência % inválida volta como veio e não quebra', () => {
    expect(describeRoute('/tools/%E0%A4%A').current).toBe('%E0%A4%A')
  })

  it('rota fora do mapa devolve trilha vazia', () => {
    expect(describeRoute('/nao-existe')).toMatchObject({ current: '', isId: false })
  })
})
