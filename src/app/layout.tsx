import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { ThemeProvider } from 'next-themes'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

// IBM Plex servida de src/app/fonts (decisão 0008); licença em src/app/fonts/OFL.txt.
const plexSans = localFont({
  src: [
    {
      path: './fonts/IBMPlexSans-Regular.woff2',
      weight: '400',
      style: 'normal'
    },
    {
      path: './fonts/IBMPlexSans-Medium.woff2',
      weight: '500',
      style: 'normal'
    },
    {
      path: './fonts/IBMPlexSans-SemiBold.woff2',
      weight: '600',
      style: 'normal'
    }
  ],
  variable: '--font-sans',
  display: 'swap'
})

// O preload do next/font vale por chamada: o itálico tem chamada própria para
// ser baixado só quando aparece (decisão 0009, D-P1-02-3); a regra que o usa
// está em globals.css.
const plexSansItalic = localFont({
  src: './fonts/IBMPlexSans-Italic.woff2',
  weight: '400',
  style: 'italic',
  variable: '--font-sans-italic',
  display: 'swap',
  preload: false
})

const plexMono = localFont({
  src: [
    {
      path: './fonts/IBMPlexMono-Regular.woff2',
      weight: '400',
      style: 'normal'
    },
    { path: './fonts/IBMPlexMono-Medium.woff2', weight: '500', style: 'normal' }
  ],
  variable: '--font-mono',
  display: 'swap'
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata')
  return {
    title: { default: t('title'), template: t('titleTemplate') },
    description: t('description')
  }
}

// Idioma pelo cookie (src/i18n/request.ts, decisão 0011): `lang`, catálogo do
// cliente e <title> mudam juntos na resposta da server action do seletor.
export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexSansItalic.variable} ${plexMono.variable}`}
    >
      <body className="bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <NuqsAdapter>{children}</NuqsAdapter>
            <Toaster />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
