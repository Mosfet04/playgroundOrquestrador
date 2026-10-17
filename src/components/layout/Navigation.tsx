'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { cn, focusRing } from '@/lib/utils'
import { NAV_GROUPS, activeState } from './routes'

// Marca (V1): quadrado de 28 px com o gradiente da marca e o glifo de três nós.
export function Brand() {
  const t = useTranslations('nav')
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-gradient-to-br from-primary to-signal text-primary-foreground">
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
          <path
            d="M4 4.5 12 8M4 11.5 12 8M4 4.5v7"
            stroke="currentColor"
            strokeWidth="1.25"
            fill="none"
          />
          <circle cx="4" cy="4.5" r="2" fill="currentColor" />
          <circle cx="4" cy="11.5" r="2" fill="currentColor" />
          <circle cx="12" cy="8" r="2" fill="currentColor" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">{t('brandName')}</span>
        <span className="block font-mono text-xs text-muted-foreground">
          {t('brandTag')}
        </span>
      </span>
    </div>
  )
}

export function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const t = useTranslations('nav')

  return (
    <nav
      aria-label={t('mainNavigation')}
      className="flex-1 space-y-4 overflow-y-auto px-3 py-4"
    >
      {NAV_GROUPS.map((group) => (
        <div key={group.items[0].href} className="space-y-1">
          {group.label && (
            <p className="px-3 pb-1 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t(group.label)}
            </p>
          )}
          <ul className="space-y-1">
            {group.items.map(({ href, label, icon: Icon }) => {
              const current = activeState(pathname, href)
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={current}
                    onClick={onNavigate}
                    className={cn(
                      'relative flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors lg:h-9',
                      focusRing,
                      current
                        ? 'bg-primary-soft font-medium text-foreground'
                        : 'text-foreground hover:bg-accent'
                    )}
                  >
                    {current && (
                      <span
                        aria-hidden="true"
                        className="absolute -left-3 inset-y-1.5 w-[3px] rounded-r-sm bg-gradient-to-b from-primary to-signal shadow-glow"
                      />
                    )}
                    <Icon
                      aria-hidden="true"
                      className={cn(
                        'size-4 shrink-0',
                        current ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                    {t(label)}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
