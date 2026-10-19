import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// Sem argumento, o plugin usa src/i18n/request.ts (idioma pelo cookie).
const withNextIntl = createNextIntlPlugin()

const nextConfig: NextConfig = {
  devIndicators: false,
}

export default withNextIntl(nextConfig)
