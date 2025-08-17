import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      // Rotas específicas do playground são redirecionadas para o backend
      {
        source: '/api/v1/:path*',
        destination: 'https://7j360k9x-7777.brs.devtunnels.ms/v1/:path*',
      },
      // Rotas de playground sem /v1 também redirecionadas
      {
        source: '/api/playground/:path*',
        destination: 'https://7j360k9x-7777.brs.devtunnels.ms/playground/:path*',
      },
      // APIs de gerenciamento ficam locais (não são redirecionadas)
      // /api/agents/* e /api/tools/* são tratadas localmente
    ];
  },
}

export default nextConfig
