import { render, type RenderOptions } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import type { AppLocale } from '@/i18n/locales'
import en from '../../messages/en.json'
import ptBR from '../../messages/pt-BR.json'

const MESSAGES = { 'pt-BR': ptBR, en }

// Provider mínimo do next-intl para os testes de componente: no app ele vem do
// layout raiz (src/app/layout.tsx), com o idioma do cookie.
export function renderWithIntl(
  ui: React.ReactElement,
  { locale = 'pt-BR', ...options }: RenderOptions & { locale?: AppLocale } = {}
) {
  return render(ui, {
    ...options,
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        {children}
      </NextIntlClientProvider>
    )
  })
}
