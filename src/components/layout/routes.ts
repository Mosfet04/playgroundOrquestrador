import {
  BarChart3,
  Bot,
  House,
  MessageSquare,
  Users,
  Wrench,
  type LucideIcon
} from 'lucide-react'

import type { Messages } from 'next-intl'

import { decodeUrlSegment } from '@/lib/utils'

// Mapa de rotas da P1-03 (docs/design/P1-03.md). /settings entra quando a
// tela existir (P4-05); grupo sem item não aparece.
// Rótulos são chaves do catálogo `nav` (P1-04): quem desenha traduz.

export type NavLabel = keyof Messages['nav']

export type NavItem = {
  href: string
  label: NavLabel
  icon: LucideIcon
  /** Rótulo de `<href>/new`, para seções com criação em rota própria. */
  newLabel?: NavLabel
}

export type NavGroup = { label?: NavLabel; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  { items: [{ href: '/', label: 'home', icon: House }] },
  {
    label: 'test',
    items: [{ href: '/playground', label: 'playground', icon: MessageSquare }]
  },
  {
    label: 'configure',
    items: [
      { href: '/agents', label: 'agents', icon: Bot, newLabel: 'newAgent' },
      { href: '/teams', label: 'teams', icon: Users, newLabel: 'newTeam' },
      { href: '/tools', label: 'tools', icon: Wrench, newLabel: 'newTool' }
    ]
  },
  {
    label: 'observe',
    items: [{ href: '/dashboard', label: 'dashboard', icon: BarChart3 }]
  }
]

/** `page` na rota exata; `true` numa sub-rota (`/agents/x`). `/` só por igualdade. */
export function activeState(pathname: string, href: string) {
  if (pathname === href) return 'page'
  if (href !== '/' && pathname.startsWith(`${href}/`)) return 'true'
  return undefined
}

export type RouteInfo = {
  group?: NavLabel
  /** Lista da seção, link na trilha quando a página é um detalhe ou a criação. */
  section?: { href: string; label: NavLabel }
  /** Último nível da trilha e título no celular (lista ou criação). */
  label?: NavLabel
  /** Num detalhe, o id da URL no lugar do rótulo: mono, trocado pelo nome quando chega. */
  id?: string
  /** Subtítulo mono do cabeçalho no celular (em minúsculas). */
  subtitle?: NavLabel
}

export function describeRoute(pathname: string): RouteInfo {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const state = activeState(pathname, item.href)
      if (!state) continue
      const groupInfo = group.label ? { group: group.label } : {}
      if (state === 'page')
        return {
          ...groupInfo,
          label: item.label,
          subtitle: group.label ?? 'playground'
        }
      const segment = pathname.slice(item.href.length + 1)
      const section = { href: item.href, label: item.label }
      const subtitle = item.label
      if (segment === 'new' && item.newLabel)
        return { ...groupInfo, section, label: item.newLabel, subtitle }
      return { ...groupInfo, section, id: decodeUrlSegment(segment), subtitle }
    }
  }
  return {}
}
