'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Search, MessageSquare, Clock, Bot, User, Wrench, Copy } from 'lucide-react'
import { getSessionByIdAPI } from '@/api/playground'
import { cn } from '@/lib/utils'

interface SessionData {
  session_id: string
  agent_id: string
  title: string
  created_at: number
  memory: {
    runs: Array<{
      messages: Array<{
        content: string
        from_history: boolean
        stop_after_tool_call: boolean
        role: 'user' | 'system' | 'assistant' | 'tool'
        created_at: number
      }>
    }>
  }
}

export function SessionViewer() {
  const [sessionId, setSessionId] = useState('')
  const [agentId, setAgentId] = useState('coding_agent') // valor padrão baseado no exemplo
  const [baseUrl, setBaseUrl] = useState('http://localhost:7777/playground')
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!sessionId.trim()) {
      toast.error('Por favor, insira um Session ID')
      return
    }

    if (!agentId.trim()) {
      toast.error('Por favor, insira um Agent ID')
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      const data = await getSessionByIdAPI(baseUrl, agentId, sessionId)
      setSessionData(data)
      toast.success('Sessão carregada com sucesso!')
    } catch (err) {
      console.error('Erro ao buscar sessão:', err)
      setError('Erro ao carregar a sessão. Verifique se o Session ID e Agent ID estão corretos.')
      toast.error('Erro ao carregar a sessão')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado para a área de transferência!')
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('pt-BR')
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'user':
        return <User className="w-4 h-4" />
      case 'assistant':
      case 'agent':
        return <Bot className="w-4 h-4" />
      case 'tool':
        return <Wrench className="w-4 h-4" />
      default:
        return <MessageSquare className="w-4 h-4" />
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'user':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'assistant':
      case 'agent':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'tool':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Session Viewer</h1>
          <p className="text-muted-foreground">
            Visualize e analise conversas de chat por Session ID, similar ao playground do OpenAI
          </p>
        </div>

        {/* Formulário de busca */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Buscar Sessão
            </CardTitle>
            <CardDescription>
              Insira o Session ID e Agent ID para carregar os dados da conversa
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Base URL</label>
                <Input
                  placeholder="http://localhost:7777/playground"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Agent ID</label>
                <Input
                  placeholder="coding_agent"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Session ID</label>
                <Input
                  placeholder="323e8b47-115c-4b83-946d-db1843525307"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                />
              </div>
            </div>
            <Button 
              onClick={handleSearch} 
              disabled={loading}
              className="w-full md:w-auto"
            >
              {loading ? 'Carregando...' : 'Buscar Sessão'}
            </Button>
          </CardContent>
        </Card>

        {/* Erro */}
        {error && (
          <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
            <CardContent className="pt-6">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Dados da sessão */}
        {sessionData && (
          <div className="space-y-4">
            {/* Informações da sessão */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Informações da Sessão
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Session ID</label>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                        {sessionData.session_id}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(sessionData.session_id)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Agent ID</label>
                    <code className="bg-muted px-2 py-1 rounded text-sm font-mono block">
                      {sessionData.agent_id}
                    </code>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Título</label>
                    <p className="text-sm">{sessionData.title}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Criado em</label>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{formatTimestamp(sessionData.created_at)}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Total de Runs</label>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        {sessionData.memory?.runs?.length || 0} runs
                      </Badge>
                      <span className="text-xs text-muted-foreground">(exibindo apenas o último)</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Mensagens no Último Run</label>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        {sessionData.memory?.runs?.[sessionData.memory.runs.length - 1]?.messages?.length || 0} mensagens
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Conversas - Último Run */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Último Run ({sessionData.memory?.runs?.[sessionData.memory.runs.length - 1]?.messages?.length || 0} mensagens)
                </CardTitle>
                <CardDescription>
                  Mensagens do run mais recente desta sessão com horários detalhados
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sessionData.memory?.runs && sessionData.memory.runs.length > 0 ? (
                  (() => {
                    const lastRun = sessionData.memory.runs[sessionData.memory.runs.length - 1];
                    return (
                      <div className="space-y-4">
                        {/* Cabeçalho do Último Run */}
                        <div className="flex items-center gap-2 pb-2 border-b">
                          <Badge variant="outline" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                            Run #{sessionData.memory.runs.length} (Mais Recente)
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {lastRun.messages?.length || 0} mensagens
                          </span>
                        </div>

                        {/* Mensagens do Último Run */}
                        {lastRun.messages && lastRun.messages.length > 0 ? (
                          <div className="space-y-3 text-black">
                            {lastRun.messages.map((message, messageIndex) => (
                              <div 
                                key={messageIndex} 
                                className={cn(
                                  "border rounded-lg p-4",
                                  message.role === 'user' && "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800",
                                  message.role === 'assistant' && "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
                                  message.role === 'system' && "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800",
                                  message.role === 'tool' && "bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800"
                                )}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <Badge className={getRoleBadgeColor(message.role)}>
                                      {getRoleIcon(message.role)}
                                      <span className="ml-1 capitalize">{message.role}</span>
                                    </Badge>
                                    {message.from_history && (
                                      <Badge variant="secondary" className="text-xs">
                                        Do Histórico
                                      </Badge>
                                    )}
                                    {message.stop_after_tool_call && (
                                      <Badge variant="destructive" className="text-xs">
                                        Stop After Tool Call
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Clock className="w-3 h-3" />
                                    <span className="font-mono">
                                      {new Date(message.created_at * 1000).toLocaleTimeString('pt-BR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit'
                                      })}
                                    </span>
                                    <span className="text-xs opacity-75">
                                      ({new Date(message.created_at * 1000).toLocaleDateString('pt-BR')})
                                    </span>
                                  </div>
                                </div>
                                <div className="whitespace-pre-wrap text-sm font-mono p-3 rounded border text-black">
                                  {message.content}
                                </div>
                                <div className="flex justify-end mt-2">
                                  <span className="text-xs text-muted-foreground">
                                    Mensagem #{messageIndex + 1}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-sm">
                            Nenhuma mensagem no último run.
                          </p>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhum run encontrado nesta sessão.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
