import { describe, expect, it } from 'vitest'

import { safeNextPath } from '@/lib/safeNext'

// P2-01: o `?next=` do login só leva a um caminho deste app (sem open redirect).

describe('safeNextPath', () => {
  it.each([
    ['/agents', '/agents'],
    ['/agents/a%2Fb?tab=1#x', '/agents/a%2Fb?tab=1#x'],
    ['/playground?agent=alfa&session=s1', '/playground?agent=alfa&session=s1'],
    ['/', '/'],
    ['/agents/./x/../y', '/agents/y']
  ])('aceita o caminho interno %s', (next, expected) => {
    expect(safeNextPath(next)).toBe(expected)
  })

  it.each([
    null,
    undefined,
    '',
    'agents',
    '//evil.com',
    '//evil.com/agents',
    'https://evil.com',
    'http://evil.com/agents',
    'javascript:alert(1)',
    '\\\\evil.com',
    '/\\evil.com',
    '\\/evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    ' //evil.com',
    // R1 (review P2-01): `.`/`..` normalizados pelo URL viram `//host`.
    '/.//evil.com',
    '/%2e//evil.com/x',
    '/%2E%2E//evil.com',
    '/a/..//evil.com',
    '/a/%2e%2e//evil.com',
    '/./\\evil.com'
  ])('manda %j para /', (next) => {
    expect(safeNextPath(next)).toBe('/')
  })
})
