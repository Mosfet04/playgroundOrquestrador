'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import { 
  CheckCircle, 
  Bot, 
  Wrench, 
  MessageSquare, 
  ArrowRight,
  Lightbulb,
  Smartphone
} from 'lucide-react'

interface Step {
  id: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  completed: boolean
}

interface GettingStartedProps {
  onNavigate: (tab: string) => void
}

export function GettingStarted({ onNavigate }: GettingStartedProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [steps, setSteps] = useState<Step[]>([
    {
      id: 'create-agent',
      title: 'Crie seu primeiro agente',
      description: 'Configure um agente IA com modelo, prompt e ferramentas',
      icon: Bot,
      completed: false
    },
    {
      id: 'create-tool',
      title: 'Adicione uma ferramenta HTTP',
      description: 'Configure uma API externa para expandir as capacidades',
      icon: Wrench,
      completed: false
    },
    {
      id: 'test-playground',
      title: 'Teste no playground',
      description: 'Converse com seu agente no playground de chat',
      icon: MessageSquare,
      completed: false
    }
  ])

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const markAsCompleted = (stepId: string) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, completed: true } : step
    ))
  }

  const completedSteps = steps.filter(step => step.completed).length
  const totalSteps = steps.length

  return (
    <div className={cn(
      "space-y-6 overflow-y-auto",
      isMobile ? "p-4 pb-8" : "p-6"
    )}>
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2 mb-2">
          <h1 className="text-2xl font-semibold tracking-tight text-center">
            Bem-vindo ao Agno Manager!
          </h1>
          <span className="text-2xl">🎉</span>
        </div>
        
        <p className={cn(
          "text-muted-foreground",
          isMobile ? "text-sm px-2" : "text-base"
        )}>
          Configure seus primeiros agentes IA em poucos passos
        </p>
        
        <div className={cn(
          "flex items-center justify-center gap-2 flex-wrap",
          isMobile && "px-2"
        )}>
          <Badge variant="outline" className={isMobile ? "text-xs" : ""}>
            {completedSteps} de {totalSteps} concluídos
          </Badge>
          {completedSteps === totalSteps && (
            <StatusBadge active>🎊 Parabéns! Setup concluído</StatusBadge>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className={cn(
        "bg-secondary rounded-full h-2",
        isMobile ? "mx-2" : "w-full"
      )}>
        <div 
          className="bg-primary h-2 rounded-full transition-all duration-300"
          style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
        ></div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {steps.map((step, index) => {
          const Icon = step.icon
          const isCompleted = step.completed
          
          return (
            <Card key={step.id} className={cn(
              "transition-all duration-200",
              isCompleted ? 'border-success' : '',
              isMobile && "mx-2"
            )}>
              <CardHeader className={isMobile ? "p-4" : ""}>
                <div className={cn(
                  "flex gap-4",
                  isMobile ? "flex-col space-y-3" : "items-center"
                )}>
                  {/* Icon and Title Section */}
                  <div className={cn(
                    "flex gap-4",
                    isMobile ? "items-start" : "items-center"
                  )}>
                    <div className={cn(
                      "rounded-full flex items-center justify-center flex-shrink-0",
                      isMobile ? "w-10 h-10" : "w-12 h-12",
                      isCompleted 
                        ? 'bg-muted text-success'
                        : 'bg-primary-soft text-primary'
                    )}>
                      {isCompleted ? (
                        <CheckCircle className={cn(isMobile ? "w-5 h-5" : "w-6 h-6")} />
                      ) : (
                        <Icon className={cn(isMobile ? "w-5 h-5" : "w-6 h-6")} />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <CardTitle className={cn(
                        "flex gap-2",
                        isMobile ? "flex-col items-start text-base" : "items-center"
                      )}>
                        <span className={cn(
                          "text-muted-foreground",
                          isMobile ? "text-xs" : "text-sm"
                        )}>
                          Passo {index + 1}
                        </span>
                        <span className={cn(
                          isCompleted ? 'line-through text-muted-foreground' : '',
                          isMobile ? "text-sm" : ""
                        )}>
                          {step.title}
                        </span>
                      </CardTitle>
                      <CardDescription className={cn(
                        isCompleted ? 'text-success' : '',
                        isMobile ? "text-xs mt-1" : ""
                      )}>
                        {isCompleted ? '✅ Concluído!' : step.description}
                      </CardDescription>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  {!isCompleted && (
                    <div className={cn(
                      "flex gap-2",
                      isMobile ? "flex-col w-full" : "flex-shrink-0"
                    )}>
                      {step.id === 'create-agent' && (
                        <Button 
                          onClick={() => onNavigate('agents')} 
                          className={cn(
                            "gap-2",
                            isMobile ? "w-full justify-center" : ""
                          )}
                          size={isMobile ? "sm" : "default"}
                        >
                          Criar Agente
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      )}
                      {step.id === 'create-tool' && (
                        <Button 
                          onClick={() => onNavigate('tools')} 
                          className={cn(
                            "gap-2",
                            isMobile ? "w-full justify-center" : ""
                          )}
                          size={isMobile ? "sm" : "default"}
                        >
                          Criar Tool
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      )}
                      {step.id === 'test-playground' && (
                        <Button 
                          onClick={() => onNavigate('playground')} 
                          className={cn(
                            "gap-2",
                            isMobile ? "w-full justify-center" : ""
                          )}
                          size={isMobile ? "sm" : "default"}
                        >
                          Ir ao Playground
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        onClick={() => markAsCompleted(step.id)}
                        className={isMobile ? "w-full" : ""}
                        size={isMobile ? "sm" : "default"}
                      >
                        Marcar como feito
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
            </Card>
          )
        })}
      </div>

      {/* Dicas úteis */}
      <Card className={isMobile ? "mx-2" : ""}>
        <CardHeader className={isMobile ? "p-4 pb-2" : ""}>
          <CardTitle className={cn(
            "flex items-center gap-2",
            isMobile ? "text-base" : ""
          )}>
            <Lightbulb className={cn(isMobile ? "w-4 h-4" : "w-5 h-5")} />
            Dicas Úteis
          </CardTitle>
        </CardHeader>
        <CardContent className={cn(
          "space-y-3",
          isMobile ? "p-4 pt-0" : ""
        )}>
          <div className={cn(
            "space-y-2",
            isMobile ? "text-xs" : "text-sm"
          )}>
            <div className={cn(
              "space-y-2",
              isMobile && "space-y-3"
            )}>
              <p className={isMobile ? "leading-relaxed" : ""}>
                💡 <strong>Providers suportados:</strong> Ollama (local), OpenAI, Anthropic, Google, Groq, Azure
              </p>
              <p className={isMobile ? "leading-relaxed" : ""}>
                🔧 <strong>Ferramentas HTTP:</strong> Configure APIs como Weather, GitHub, qualquer REST API
              </p>
              <p className={isMobile ? "leading-relaxed" : ""}>
                🧠 <strong>RAG (Opcional):</strong> Adicione base de conhecimento para contexto personalizado
              </p>
              <p className={isMobile ? "leading-relaxed" : ""}>
                ⚡ <strong>Sincronização automática:</strong> Agentes criados aqui ficam disponíveis no orquestrador imediatamente
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mobile optimization notice */}
      {isMobile && (
        <Card className="mx-2 border-border bg-muted">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-foreground text-sm">
              <Smartphone className="w-4 h-4 text-primary" />
              Otimizado para Mobile
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-muted-foreground leading-relaxed">
              ✨ Esta interface foi otimizada para o seu dispositivo móvel. 
              Navegue facilmente entre abas usando o menu superior.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Next Steps */}
      {completedSteps === totalSteps && (
        <Card className={cn(
          "border-success",
          isMobile && "mx-2"
        )}>
          <CardHeader className={isMobile ? "p-4 pb-2" : ""}>
            <CardTitle className={cn(
              "text-success",
              isMobile ? "text-base" : ""
            )}>
              🎉 Próximos Passos
            </CardTitle>
          </CardHeader>
          <CardContent className={isMobile ? "p-4 pt-0" : ""}>
            <div className={cn(
              "space-y-2",
              isMobile ? "text-xs space-y-3" : "text-sm"
            )}>
              <p className={isMobile ? "leading-relaxed" : ""}>
                ✅ Explore recursos avançados como RAG e configurações personalizadas
              </p>
              <p className={isMobile ? "leading-relaxed" : ""}>
                ✅ Crie múltiplos agentes especializados para diferentes tarefas
              </p>
              <p className={isMobile ? "leading-relaxed" : ""}>
                ✅ Configure ferramentas HTTP para APIs do seu negócio
              </p>
              <p className={isMobile ? "leading-relaxed" : ""}>
                ✅ Teste integrações com o orquestrador Python
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Bottom spacing for mobile */}
      {isMobile && <div className="h-4" />}
    </div>
  )
}
