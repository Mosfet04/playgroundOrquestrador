import {
  BarChart3,
  Bot,
  House,
  MessageSquare,
  Wrench,
  type LucideIcon
} from 'lucide-react'

import { decodeUrlSegment } from '@/lib/utils'

// Mapa de rotas da P1-03 (docs/design/P1-03.md). /teams e /settings entram
// quando as telas existirem (P3-04, P4-05); grupo sem item não aparece.

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  /** Rótulo de `<href>/new`, para seções com criação em rota própria. */
  newLabel?: string
}

export type NavGroup = { label?: string; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  { items: [{ href: '/', label: 'Início', icon: House }] },
  {
    label: 'Testar',
    items: [{ href: '/playground', label: 'Playground', icon: MessageSquare }]
  },
  {
    label: 'Configurar',
    items: [
      { href: '/agents', label: 'Agentes', icon: Bot, newLabel: 'Novo agente' },
      { href: '/tools', label: 'Tools', icon: Wrench, newLabel: 'Nova tool' }
    ]
  },
  {
    label: 'Observar',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: BarChart3 }]
  }
]

/** `page` na rota exata; `true` numa sub-rota (`/agents/x`). `/` só por igualdade. */
export function activeState(pathname: string, href: string) {
  if (pathname === href) return 'page'
  if (href !== '/' && pathname.startsWith(`${href}/`)) return 'true'
  return undefined
}

export type RouteInfo = {
  group?: string
  /** Lista da seção, link na trilha quando a página é um detalhe ou a criação. */
  section?: { href: string; label: string }
  /** Último nível da trilha e título no celular. */
  current: string
  /** `current` é o id da URL (detalhe): mono, trocado pelo nome quando chega. */
  isId: boolean
  /** Subtítulo mono do cabeçalho no celular. */
  subtitle: string
}

export function describeRoute(pathname: string): RouteInfo {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const state = activeState(pathname, item.href)
      if (!state) continue
      const groupLabel = group.label ?? 'playground'
      if (state === 'page')
        return {
          group: group.label,
          current: item.label,
          isId: false,
          subtitle: groupLabel.toLowerCase()
        }
      const segment = pathname.slice(item.href.length + 1)
      const newLabel = segment === 'new' ? item.newLabel : undefined
      return {
        group: group.label,
        section: { href: item.href, label: item.label },
        current: newLabel ?? decodeUrlSegment(segment),
        isId: !newLabel,
        subtitle: item.label.toLowerCase()
      }
    }
  }
  return { current: '', isId: false, subtitle: '' }
}
