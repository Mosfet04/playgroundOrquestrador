'use client'

import { useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import * as SelectPrimitive from '@radix-ui/react-select'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { setLocale } from '@/i18n/actions'
import { LOCALES, LOCALE_NAMES } from '@/i18n/locales'
import { cn } from '@/lib/utils'

const languageItems = (
  <SelectContent align="end">
    {LOCALES.map((locale) => (
      <SelectItem key={locale} value={locale} lang={locale}>
        {LOCALE_NAMES[locale].name}
      </SelectItem>
    ))}
  </SelectContent>
)

// Seletor de idioma (P1-04), no padrão do ThemeSelect: `icon` no cabeçalho do
// desktop (código PT/EN) e `field` no rodapé do menu do celular. O idioma vem
// do servidor (cookie). Trocar só chama a server action: no Next 15.2, gravar o
// cookie nela já devolve a árvore re-renderizada (decisão 0011, D-P1-04-5), sem
// recarregar a página nem perder o estado do cliente.
export function LanguageSelect({
  variant = 'field',
  className
}: {
  variant?: 'field' | 'icon'
  className?: string
}) {
  const t = useTranslations('language')
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()
  const current = LOCALE_NAMES[locale]

  // O Select do Radix só chama onValueChange quando o valor muda.
  const changeLocale = (value: string) => {
    if (isPending) return
    startTransition(async () => {
      await setLocale(value)
    })
  }

  // Durante a troca o trigger fica ocupado e indisponível só por ARIA (com o
  // visual de desabilitado): o atributo `disabled` tiraria o foco do seletor
  // (V-P1-04-10).
  const busy = { 'aria-busy': isPending, 'aria-disabled': isPending }

  if (variant === 'icon') {
    return (
      <Select value={locale} onValueChange={changeLocale}>
        <SelectPrimitive.Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            {...busy}
            className={cn(
              'size-9 font-mono text-xs font-medium aria-disabled:opacity-50',
              className
            )}
            aria-label={t('trigger', { name: current.name })}
          >
            {current.code}
          </Button>
        </SelectPrimitive.Trigger>
        {languageItems}
      </Select>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <Label
        htmlFor="language-select"
        className="text-xs font-medium text-muted-foreground"
      >
        {t('label')}
      </Label>
      <Select value={locale} onValueChange={changeLocale}>
        <SelectTrigger
          id="language-select"
          {...busy}
          className="h-10 w-44 py-1 aria-disabled:opacity-50 md:h-9"
        >
          <SelectValue />
        </SelectTrigger>
        {languageItems}
      </Select>
    </div>
  )
}
