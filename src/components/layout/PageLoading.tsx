import { useTranslations } from 'next-intl'

import { LiveStatus } from '@/components/ui/loading'
import { Skeleton } from '@/components/ui/skeleton'

// Fallback de navegação (loading.tsx de cada seção de (app)): o clique na
// sidebar mostra o carregamento na hora, enquanto a página nova não chega
// (QA1-01, #30). Fica por seção, não em (app): o loading.tsx da raiz do grupo
// também embrulharia o catch-all do 404, e o notFound() depois do stream sai
// com status 200.
export function PageLoading() {
  const t = useTranslations('common')
  return (
    <div aria-busy="true" className="mx-auto max-w-7xl space-y-6 p-4 lg:p-6">
      <LiveStatus>{t('loadingPage')}</LiveStatus>
      <Skeleton className="h-8 w-1/4" />
      <div className="space-y-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-16" />
        ))}
      </div>
    </div>
  )
}
