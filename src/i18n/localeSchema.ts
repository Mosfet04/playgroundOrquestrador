import { z } from 'zod'

import { DEFAULT_LOCALE, LOCALES, type AppLocale } from './locales'

// Fronteira do idioma no servidor: o cookie (request.ts) e a server action
// (actions.ts). Fora do bundle do cliente, que só precisa de locales.ts.
export const localeSchema = z.enum(LOCALES)

export const parseLocale = (value: unknown): AppLocale =>
  localeSchema.catch(DEFAULT_LOCALE).parse(value)
