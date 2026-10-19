import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setLocale } from '@/i18n/actions'

// A server action é uma fronteira (POST público): só grava 'pt-BR' ou 'en'.
// Sem o runtime do Next no Vitest, o cookies() de next/headers é simulado.
const cookieStore = vi.hoisted(() => ({
  set: (name: string, value: string, options: object) => ({ name, value, options })
}))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))

describe('setLocale (server action)', () => {
  let set: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    set = vi.spyOn(cookieStore, 'set')
  })

  it('grava o idioma no cookie `locale`, para o site todo, por um ano e fora do JS', async () => {
    await setLocale('en')

    expect(set).toHaveBeenCalledWith('locale', 'en', {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: 'lax'
    })
  })

  // A action é POST público: o corpo pode não ser string.
  it.each([null, undefined, 42, { $ne: 'x' }, ['en']])(
    'recusa payload que não é string (%j) sem gravar nada',
    async (value) => {
      await expect(setLocale(value as unknown as string)).rejects.toThrow()
      expect(set).not.toHaveBeenCalled()
    }
  )

  it.each(['fr', 'EN', '', 'pt-BR; Path=/admin', 'en\r\nSet-Cookie: a=b', ' en'])(
    'recusa valor fora da lista (%s) sem gravar nada',
    async (value) => {
      await expect(setLocale(value)).rejects.toThrow()
      expect(set).not.toHaveBeenCalled()
    }
  )
})
