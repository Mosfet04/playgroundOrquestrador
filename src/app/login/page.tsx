import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'

import { LanguageSelect } from '@/components/layout/LanguageSelect'
import { Brand } from '@/components/layout/Navigation'
import { ThemeSelect } from '@/components/layout/ThemeSelect'
import { Card } from '@/components/ui/card'
import { safeNextPath } from '@/lib/safeNext'
import { LoginForm } from './LoginForm'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth')
  // Com o modelo do layout raiz: "Entrar · Playground do Orquestrador".
  return { title: t('title') }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

// P2-01: fora da casca (app). O middleware traz para cá sem sessão, com
// `?next=` e, se a sessão venceu, `?reason=expired` (decisão 0017).
export default async function LoginPage({
  searchParams
}: {
  searchParams: SearchParams
}) {
  const { next, reason } = await searchParams
  return (
    <LoginView
      next={safeNextPath(typeof next === 'string' ? next : undefined)}
      expired={reason === 'expired'}
    />
  )
}

function LoginView({ next, expired }: { next: string; expired: boolean }) {
  const t = useTranslations('auth')
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center justify-end gap-1 px-1 lg:px-6">
        <LanguageSelect variant="icon" className="size-11 lg:size-9" />
        <ThemeSelect variant="icon" />
      </div>
      <main
        id="conteudo"
        className="flex flex-1 justify-center px-4 pb-6 pt-4 md:pb-8 md:pt-16"
      >
        <div className="flex w-full max-w-[400px] flex-col gap-4 md:gap-6">
          <Brand />
          <Card className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {t('title')}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('description')}
              </p>
            </div>
            <LoginForm next={next} expired={expired} />
          </Card>
        </div>
      </main>
    </div>
  )
}
