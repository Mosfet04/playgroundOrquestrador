'use client'

import { Suspense, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQueryState } from 'nuqs'
import { Menu, PanelLeft, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet'
import { cn, focusRing } from '@/lib/utils'
import { usePlaygroundStore } from '@/store'
import { LanguageSelect } from './LanguageSelect'
import { Brand, Navigation } from './Navigation'
import { ThemeSelect } from './ThemeSelect'
import { describeRoute } from './routes'

// O painel do playground só existe no Sheet de /playground: fora do chunk
// das demais rotas.
const Sidebar = dynamic(() => import('@/components/playground/Sidebar/Sidebar'))

// Sheet aberto fecha quando a janela chega ao breakpoint da navegação fixa
// (lg, 1024 px). Media query, não listener de resize.
function useCloseOnDesktop(open: boolean, setOpen: (open: boolean) => void) {
  useEffect(() => {
    if (!open) return
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onChange = (event: { matches: boolean }) => {
      if (event.matches) setOpen(false)
    }
    desktop.addEventListener('change', onChange)
    return () => desktop.removeEventListener('change', onChange)
  }, [open, setOpen])
}

// Ao abrir, o foco começa no 1º item da navegação (não no "Fechar menu").
const focusFirstLink = (event: Event) => {
  const first = (event.currentTarget as HTMLElement).querySelector('a')
  if (!first) return
  event.preventDefault()
  first.focus()
}

function MenuSheet() {
  const [open, setOpen] = useState(false)
  const t = useTranslations('nav')
  useCloseOnDesktop(open, setOpen)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 lg:hidden"
          aria-label={t('openMenu')}
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[296px]"
        aria-describedby={undefined}
        onOpenAutoFocus={focusFirstLink}
      >
        <SheetTitle className="sr-only">{t('menu')}</SheetTitle>
        <div className="flex h-14 shrink-0 items-center justify-between pl-4 pr-2">
          <Brand />
          <SheetClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={t('closeMenu')}
            >
              <X aria-hidden="true" />
            </Button>
          </SheetClose>
        </div>
        <Navigation onNavigate={() => setOpen(false)} />
        <div className="space-y-3 border-t border-border p-4">
          <ThemeSelect />
          <LanguageSelect />
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Painel do playground (sessões e agente) abaixo de lg; no desktop ele fica
// dentro da página, à direita da navegação.
function PlaygroundPanelSheet() {
  const [open, setOpen] = useState(false)
  const t = useTranslations('nav')
  useCloseOnDesktop(open, setOpen)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 lg:hidden"
          aria-label={t('openPlaygroundPanel')}
        >
          <PanelLeft aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80" aria-describedby={undefined}>
        <SheetTitle className="sr-only">{t('playgroundPanel')}</SheetTitle>
        <Sidebar />
      </SheetContent>
    </Sheet>
  )
}

// Sem entidade selecionada, o subtítulo é o grupo ("testar").
function PlaygroundSubtitle({ fallback }: { fallback: string }) {
  const [agentId] = useQueryState('agent')
  const [teamId] = useQueryState('team')
  const model = usePlaygroundStore((state) => state.selectedModel)
  const id = agentId ?? teamId
  if (!id) return fallback
  return model ? `${id} · ${model}` : id
}

export function AppHeader({ pageLabel }: { pageLabel?: string }) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const route = describeRoute(pathname)
  const isPlayground = pathname === '/playground'
  const routeLabel = route.label ? t(route.label) : ''
  const current = route.id !== undefined ? pageLabel || route.id : routeLabel
  const currentIsId = route.id !== undefined && !pageLabel
  const subtitle = route.subtitle ? t(route.subtitle).toLowerCase() : ''

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-1 lg:px-6">
      <MenuSheet />
      <nav
        aria-label={t('youAreHere')}
        className="hidden min-w-0 flex-1 lg:block"
      >
        <ol className="flex min-w-0 items-center gap-2 text-sm">
          {route.group && (
            <li className="shrink-0 text-muted-foreground">
              {t(route.group)}
            </li>
          )}
          {route.section && (
            <li className="flex shrink-0 items-center gap-2">
              <span aria-hidden="true" className="text-muted-foreground">
                ›
              </span>
              <Link
                href={route.section.href}
                className={cn('rounded-sm text-primary hover:underline', focusRing)}
              >
                {t(route.section.label)}
              </Link>
            </li>
          )}
          <li className="flex min-w-0 items-center gap-2">
            {route.group && (
              <span aria-hidden="true" className="text-muted-foreground">
                ›
              </span>
            )}
            <span
              aria-current="page"
              title={current}
              className={cn(
                'truncate font-medium text-foreground',
                currentIsId && 'font-mono'
              )}
            >
              {current}
            </span>
          </li>
        </ol>
      </nav>
      <div className="min-w-0 flex-1 px-1 lg:hidden">
        <p
          className={cn(
            'truncate text-base font-semibold',
            currentIsId && 'font-mono'
          )}
        >
          {current}
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {isPlayground ? (
            <Suspense fallback={subtitle}>
              <PlaygroundSubtitle fallback={subtitle} />
            </Suspense>
          ) : (
            subtitle
          )}
        </p>
      </div>
      <LanguageSelect variant="icon" className="hidden shrink-0 lg:inline-flex" />
      <ThemeSelect
        variant="icon"
        className={cn('shrink-0', isPlayground && 'hidden lg:inline-flex')}
      />
      {isPlayground && <PlaygroundPanelSheet />}
    </header>
  )
}
