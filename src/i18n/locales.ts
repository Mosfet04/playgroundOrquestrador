// Idiomas da UI (decisão 0011). O idioma vive no cookie, sem prefixo na URL;
// sem cookie, ou com valor fora da lista, vale pt-BR (localeSchema.ts).
// Importado pelo seletor no cliente: sem zod aqui.
export const LOCALES = ['pt-BR', 'en'] as const
export type AppLocale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = 'pt-BR'
export const LOCALE_COOKIE = 'locale'

// Cada idioma escrito no próprio idioma (P1-04, seletor), igual em toda a UI.
export const LOCALE_NAMES: Record<AppLocale, { code: string; name: string }> = {
  'pt-BR': { code: 'PT', name: 'Português (Brasil)' },
  en: { code: 'EN', name: 'English' }
}
