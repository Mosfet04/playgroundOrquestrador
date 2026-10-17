'use server'

import { cookies } from 'next/headers'

import { localeSchema } from './localeSchema'
import { LOCALE_COOKIE } from './locales'

const ONE_YEAR = 60 * 60 * 24 * 365

// Troca de idioma (P1-04): grava o cookie. O Next 15.2 devolve na resposta da
// action a rota re-renderizada no novo idioma, sem recarregar a página
// (decisão 0011, D-P1-04-5).
export async function setLocale(locale: string) {
  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, localeSchema.parse(locale), {
    path: '/',
    maxAge: ONE_YEAR,
    httpOnly: true,
    sameSite: 'lax'
  })
}
