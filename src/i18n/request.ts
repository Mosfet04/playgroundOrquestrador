import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

import { parseLocale } from './localeSchema'
import { LOCALE_COOKIE } from './locales'

// Idioma da requisição pelo cookie, sem prefixo na URL nem Accept-Language
// (decisão 0011). Lido pelo plugin do next-intl (next.config.ts).
export default getRequestConfig(async () => {
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value)
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default
  }
})
