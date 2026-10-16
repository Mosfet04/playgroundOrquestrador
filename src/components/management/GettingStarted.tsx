'use client'

import { useState } from 'react'
import Link from 'next/link'
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

// Atalho de cada passo (link real, P1-03).
const stepLinks: Record<string, { href: string; label: string }> = {
  'create-agent': { href: '/agents/new', label: 'Criar Agente' },
  'create-tool': { href: '/tools/new', label: 'Criar Tool' },
  'test-playground': { href: '/playground', label: 'Ir ao Playground' }
}

export function GettingStarted() {
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

  const markAsCompleted = (stepId: string) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, completed: true } : step
    ))
  }

  const completedSteps = steps.filter(step => step.completed).length
  const totalSteps = steps.length

  return (
    <div className="space-y-6 p-4 pb-8 lg:p-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2 mb-2">
          <h1 className="text-2xl font-semibold tracking-tight text-center">
            Bem-vindo ao Agno Manager!
          </h1>
          <span className="text-2xl">🎉</span>
        </div>
        
        <p className="px-2 text-sm text-muted-foreground lg:px-0 lg:text-base">
          Configure seus primeiros agentes IA em poucos passos
        </p>
        
        <div className="flex flex-wrap items-center justify-center gap-2 px-2 lg:px-0">
          <Badge variant="outline">
            {completedSteps} de {totalSteps} concluídos
          </Badge>
          {completedSteps === totalSteps && (
            <StatusBadge active>🎊 Parabéns! Setup concluído</StatusBadge>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mx-2 h-2 rounded-full bg-secondary lg:mx-0">
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
              "mx-2 lg:mx-0"
            )}>
              <CardHeader className="p-4 lg:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  {/* Icon and Title Section */}
                  <div className="flex items-start gap-4 lg:items-center">
                    <div className={cn(
                      "flex size-10 flex-shrink-0 items-center justify-center rounded-full lg:size-12",
                      isCompleted 
                        ? 'bg-muted text-success'
                        : 'bg-primary-soft text-primary'
                    )}>
                      {isCompleted ? (
                        <CheckCircle className="size-5 lg:size-6" />
                      ) : (
                        <Icon className="size-5 lg:size-6" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <CardTitle className="flex flex-col items-start gap-2 text-base lg:flex-row lg:items-center">
                        <span className="text-xs text-muted-foreground lg:text-sm">
                          Passo {index + 1}
                        </span>
                        <span className={cn(
                          isCompleted ? 'line-through text-muted-foreground' : '',
                          "text-sm lg:text-base"
                        )}>
                          {step.title}
                        </span>
                      </CardTitle>
                      <CardDescription className={cn(
                        isCompleted ? 'text-success' : '',
                        "mt-1 text-xs lg:mt-0 lg:text-sm"
                      )}>
                        {isCompleted ? '✅ Concluído!' : step.description}
                      </CardDescription>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  {!isCompleted && (
                    <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-shrink-0 lg:flex-row">
                      <Button asChild className="w-full justify-center gap-2 lg:w-auto">
                        <Link href={stepLinks[step.id].href}>
                          {stepLinks[step.id].label}
                          <ArrowRight className="w-4 h-4" aria-hidden="true" />
                        </Link>
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => markAsCompleted(step.id)}
                        className="w-full lg:w-auto"
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
      <Card className="mx-2 lg:mx-0">
        <CardHeader className="p-4 pb-2 lg:p-6">
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="size-4 lg:size-5" />
            Dicas Úteis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 lg:p-6 lg:pt-0">
          <div className="space-y-2 text-xs lg:text-sm">
            <div className="space-y-3 lg:space-y-2">
              <p className="leading-relaxed lg:leading-normal">
                💡 <strong>Providers suportados:</strong> Ollama (local), OpenAI, Anthropic, Google, Groq, Azure
              </p>
              <p className="leading-relaxed lg:leading-normal">
                🔧 <strong>Ferramentas HTTP:</strong> Configure APIs como Weather, GitHub, qualquer REST API
              </p>
              <p className="leading-relaxed lg:leading-normal">
                🧠 <strong>RAG (Opcional):</strong> Adicione base de conhecimento para contexto personalizado
              </p>
              <p className="leading-relaxed lg:leading-normal">
                ⚡ <strong>Sincronização automática:</strong> Agentes criados aqui ficam disponíveis no orquestrador imediatamente
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mobile optimization notice */}
      <Card className="mx-2 border-border bg-muted lg:hidden">
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

      {/* Next Steps */}
      {completedSteps === totalSteps && (
        <Card className="mx-2 border-success lg:mx-0">
          <CardHeader className="p-4 pb-2 lg:p-6">
            <CardTitle className="text-success">
              🎉 Próximos Passos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 lg:p-6 lg:pt-0">
            <div className="space-y-3 text-xs lg:space-y-2 lg:text-sm">
              <p className="leading-relaxed lg:leading-normal">
                ✅ Explore recursos avançados como RAG e configurações personalizadas
              </p>
              <p className="leading-relaxed lg:leading-normal">
                ✅ Crie múltiplos agentes especializados para diferentes tarefas
              </p>
              <p className="leading-relaxed lg:leading-normal">
                ✅ Configure ferramentas HTTP para APIs do seu negócio
              </p>
              <p className="leading-relaxed lg:leading-normal">
                ✅ Teste integrações com o orquestrador Python
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Bottom spacing for mobile */}
      <div className="h-4 lg:hidden" />
    </div>
  )
}
