'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'
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
import { cn } from '@/lib/utils'

const THEMES = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor }
] as const

// `field`: rótulo "Tema" + Select (rodapé do menu no celular, V-P1-02-3).
// `icon`: botão do cabeçalho só com o ícone do tema atual (P1-03), que abre o
// mesmo menu.
export function ThemeSelect({
  variant = 'field',
  className
}: {
  variant?: 'field' | 'icon'
  className?: string
}) {
  const { theme, setTheme } = useTheme()
  const t = useTranslations('theme')
  // O tema só é conhecido no cliente: até montar, o trigger fica vazio e
  // desabilitado, com o mesmo tamanho (sem pulo de layout nem aviso de hidratação).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const current = mounted
    ? THEMES.find(({ value }) => value === theme)
    : undefined

  const themeItems = (
    <SelectContent align="end">
      {THEMES.map(({ value, icon: ThemeIcon }) => (
        <SelectItem key={value} value={value}>
          <span className="flex items-center gap-2">
            <ThemeIcon className="size-4" aria-hidden="true" />
            {t(value)}
          </span>
        </SelectItem>
      ))}
    </SelectContent>
  )

  if (variant === 'icon') {
    const CurrentIcon = current?.icon
    return (
      <Select
        value={current?.value ?? ''}
        onValueChange={setTheme}
        disabled={!current}
      >
        <SelectPrimitive.Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-11 lg:size-9', className)}
            aria-label={
              current
                ? t('trigger', { theme: t(current.value) })
                : t('change')
            }
          >
            {CurrentIcon && <CurrentIcon aria-hidden="true" />}
          </Button>
        </SelectPrimitive.Trigger>
        {themeItems}
      </Select>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <Label
        htmlFor="theme-select"
        className="text-xs font-medium text-muted-foreground"
      >
        {t('label')}
      </Label>
      <Select
        value={mounted ? theme : ''}
        onValueChange={setTheme}
        disabled={!mounted}
      >
        <SelectTrigger id="theme-select" className="h-10 w-44 py-1 md:h-9">
          <SelectValue />
        </SelectTrigger>
        {themeItems}
      </Select>
    </div>
  )
}
