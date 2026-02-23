'use client'
import { useState, Suspense, useEffect } from 'react'
import Sidebar from '@/components/playground/Sidebar/Sidebar'
import { ChatArea } from '@/components/playground/ChatArea'
import { Navigation } from '@/components/layout/Navigation'
import { AgentManagement } from '@/components/management/agents/AgentManagement'
import { ToolManagement } from '@/components/management/tools/ToolManagement'
import { Dashboard } from '@/components/management/dashboard/Dashboard'
import { GettingStarted } from '@/components/management/GettingStarted'

export default function Home() {
  const [activeTab, setActiveTab] = useState('getting-started')
  const [isMobile, setIsMobile] = useState(false)
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth >= 768) {
        setIsNavigationOpen(false)
        setIsSidebarOpen(false)
      }
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const renderContent = () => {
    switch (activeTab) {
      case 'getting-started':
        return <GettingStarted onNavigate={setActiveTab} />
      case 'dashboard':
        return <Dashboard />
      case 'playground':
        return (
          <div className="flex h-screen bg-background/80 relative">
            {/* Overlay para sidebar do playground */}
            {isMobile && isSidebarOpen && (
              <div 
                className="fixed inset-0 bg-black/50 z-44 md:hidden"
                onClick={() => setIsSidebarOpen(false)}
              />
            )}
            
            <Sidebar 
              isMobile={isMobile}
              isOpen={isSidebarOpen}
              onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
            />
            <ChatArea 
              isMobile={isMobile} 
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            />
          </div>
        )
      case 'agents':
        return <AgentManagement />
      case 'tools':
        return <ToolManagement />
      default:
        return <GettingStarted onNavigate={setActiveTab} />
    }
  }

  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <div className="flex h-screen bg-background">
        {/* Mobile overlay para navigation */}
        {isMobile && isNavigationOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setIsNavigationOpen(false)}
          />
        )}
        
        <Navigation 
          activeTab={activeTab} 
          onTabChange={(tab) => {
            setActiveTab(tab)
            if (isMobile) {
              setIsNavigationOpen(false)
              setIsSidebarOpen(false) // Fechar sidebar do playground também
            }
          }}
          isMobile={isMobile}
          isOpen={isNavigationOpen}
          onToggle={() => setIsNavigationOpen(!isNavigationOpen)}
        />
        
        <div className="flex-1 overflow-y-auto">
          {renderContent()}
        </div>
      </div>
    </Suspense>
  )
}
