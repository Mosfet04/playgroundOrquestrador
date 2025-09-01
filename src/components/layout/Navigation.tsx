'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { 
  MessageSquare, 
  Bot, 
  Wrench, 
  Settings,
  Home,
  BookOpen,
  BarChart3,
  Menu,
  X,
  Search
} from 'lucide-react'

interface NavigationItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  description?: string
}

const navigationItems: NavigationItem[] = [
  {
    id: 'getting-started',
    label: 'Primeiros Passos',
    icon: BookOpen,
    description: 'Guia de configuração inicial'
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: BarChart3,
    description: 'Métricas e estatísticas'
  },
  {
    id: 'playground',
    label: 'Playground',
    icon: MessageSquare,
    description: 'Chat com agentes IA'
  },
  {
    id: 'session-viewer',
    label: 'Session Viewer',
    icon: Search,
    description: 'Buscar chat por Session ID'
  },
  {
    id: 'agents',
    label: 'Agentes',
    icon: Bot,
    description: 'Gerenciar agentes IA'
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: Wrench,
    description: 'Gerenciar ferramentas'
  }
]

interface NavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  isMobile?: boolean
  isOpen?: boolean
  onToggle?: () => void
}

export function Navigation({ activeTab, onTabChange, isMobile = false, isOpen = false, onToggle }: NavigationProps) {
  return (
    <>
      {/* Mobile Menu Button */}
      {isMobile && (
        <Button
          variant="ghost"
          size="sm"
          className="fixed top-4 left-4 z-50 md:hidden bg-background border border-border shadow-lg"
          onClick={onToggle}
        >
          {isOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </Button>
      )}

      {/* Navigation Sidebar */}
      <nav className={cn(
        "bg-background border-r border-border flex flex-col transition-transform duration-300 ease-in-out",
        isMobile ? [
          "fixed top-0 left-0 h-full z-40 w-80",
          isOpen ? "translate-x-0" : "-translate-x-full"
        ] : "w-64 relative"
      )}>
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Home className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Agno Manager</h1>
              <p className="text-sm text-muted-foreground">
                Orquestrador de Agentes IA
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 p-4">
          <div className="space-y-2">
            {navigationItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              
              return (
                <Button
                  key={item.id}
                  variant={isActive ? 'secondary' : 'ghost'}
                  className={cn(
                      'w-full justify-start gap-3 h-auto p-3',
                      isActive && 'bg-secondary text-black'
                  )}
                  onClick={() => onTabChange(item.id)}
                  >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-medium truncate">{item.label}</div>
                    {item.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {item.description}
                      </div>
                    )}
                  </div>
                </Button>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <div className="text-xs text-muted-foreground text-center">
            v1.0.0 - Powered by Agno
          </div>
        </div>
      </nav>
    </>
  )
}
