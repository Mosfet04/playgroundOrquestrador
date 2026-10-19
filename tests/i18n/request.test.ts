import { describe, expect, it, vi } from 'vitest'

import requestConfig from '@/i18n/request'

import en from '../../messages/en.json'
import ptBR from '../../messages/pt-BR.json'

// QA P1-04: o cookie `locale` é entrada do cliente. Só 'pt-BR' e 'en' valem;
// qualquer outra coisa (vazio, caixa errada, operador, HTML, injeção de
// caminho do `import()` do catálogo) cai em pt-BR, sem erro e sem olhar o
// Accept-Language (decisão 0011).
const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'locale' && cookieJar.value !== undefined ? { value: cookieJar.value } : undefined
  })
}))

// `next-intl/server` só carrega na condição react-server do Next; no Vitest o
// getRequestConfig (identidade na lib) é simulado para expor o callback.
vi.mock('next-intl/server', () => ({ getRequestConfig: (config: unknown) => config }))

const resolve = async (value: string | undefined) => {
  cookieJar.value = value
  return (requestConfig as unknown as (p: object) => Promise<{ locale: string; messages: unknown }>)({})
}

describe('request config: idioma pelo cookie', () => {
  it('sem cookie: pt-BR com o catálogo pt-BR', async () => {
    const config = await resolve(undefined)
    expect(config.locale).toBe('pt-BR')
    expect(config.messages).toEqual(ptBR)
  })

  it('cookie en: en com o catálogo en', async () => {
    const config = await resolve('en')
    expect(config.locale).toBe('en')
    expect(config.messages).toEqual(en)
  })

  it.each([
    '',
    ' en',
    'EN',
    'pt',
    'pt-br',
    'fr',
    '../../package',
    '..%2F..%2Fpackage',
    'en/../pt-BR',
    '{"$ne":null}',
    '<script>alert(1)</script>',
    'en\u0000',
    'a'.repeat(5000).slice(0, 40) + '…'
  ])('cookie hostil ou fora da lista (%j): pt-BR', async (value) => {
    const config = await resolve(value)
    expect(config.locale).toBe('pt-BR')
    expect(config.messages).toEqual(ptBR)
  })
})
