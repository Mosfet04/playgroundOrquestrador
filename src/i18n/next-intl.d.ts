import type messages from '../../messages/pt-BR.json'
import type { AppLocale } from './locales'

// Chaves e idiomas tipados em useTranslations/getTranslations (next-intl 4,
// AppConfig). O pt-BR é a referência; a paridade com o en é testada.
declare module 'next-intl' {
  interface AppConfig {
    Locale: AppLocale
    Messages: typeof messages
  }
}
