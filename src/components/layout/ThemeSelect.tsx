'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

const THEMES = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor }
] as const

export function ThemeSelect() {
  const { theme, setTheme } = useTheme()
  // O tema só é conhecido no cliente: até montar, o trigger fica vazio e
  // desabilitado, com o mesmo tamanho (sem pulo de layout nem aviso de hidratação).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="flex items-center justify-between gap-2">
      <Label
        htmlFor="theme-select"
        className="text-xs font-medium text-muted-foreground"
      >
        Tema
      </Label>
      <Select
        value={mounted ? theme : ''}
        onValueChange={setTheme}
        disabled={!mounted}
      >
        <SelectTrigger id="theme-select" className="h-10 w-36 py-1 md:h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {THEMES.map(({ value, label, icon: ThemeIcon }) => (
            <SelectItem key={value} value={value}>
              <span className="flex items-center gap-2">
                <ThemeIcon className="size-4" aria-hidden="true" />
                {label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
