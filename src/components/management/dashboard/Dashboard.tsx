'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from 'recharts'
import { 
  Activity,
  Users,
  Bot,
  MessageSquare,
  Zap,
  Brain,
  Database,
  TrendingUp,
  Clock
} from 'lucide-react'
import { DashboardStats, TokenMetrics, TimeFilter } from '@/types/dashboard'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-black border border-white text-white p-2 rounded shadow-lg">
        <p className="font-bold">{label}</p>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {payload.map((item: any) => (
          <p key={item.dataKey}>
            {item.name}: {item.value.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
}
const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1']

const timeFilters: TimeFilter[] = [
  { label: 'Última Hora', value: '1h' },
  { label: 'Últimas 24h', value: '24h' },
  { label: 'Últimos 7 dias', value: '7d' },
  { label: 'Últimos 30 dias', value: '30d' },
  { label: 'Últimos 90 dias', value: '90d' }
]

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [tokenMetrics, setTokenMetrics] = useState<TokenMetrics[]>([])
  const [timeFilter, setTimeFilter] = useState<string>('24h')
  const [loading, setLoading] = useState(true)

  // Buscar estatísticas gerais
  const fetchStats = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/dashboard/stats')
      const data = await response.json()
      
      if (data.success) {
        setStats(data.data)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoading(false)
    }
  }

  // Buscar métricas de tokens
  const fetchTokenMetrics = async () => {
    try {
      const response = await fetch(`/api/dashboard/tokens?timeFilter=${timeFilter}`)
      const data = await response.json()
      
      if (data.success) {
        setTokenMetrics(data.data)
      }
    } catch (error) {
      console.error('Error fetching token metrics:', error)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  useEffect(() => {
    fetchTokenMetrics()
  }, [timeFilter])

  if (loading || !stats) {
    return (
      <div className="management-form">
        <div className="max-w-7xl mx-auto p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="management-form">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">
              Visão geral do sistema e métricas de uso
            </p>
          </div>
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-48 bg-black border border-white text-white">
              <SelectValue placeholder="Selecionar período" />
            </SelectTrigger>
            <SelectContent className="bg-black border border-white text-white">
              {timeFilters.map((filter) => (
                <SelectItem key={filter.value} value={filter.value}>
                  {filter.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Estatísticas Gerais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Agentes Ativos</CardTitle>
              <Bot className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeAgents}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalAgents} total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usuários Únicos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.uniqueUsers}</div>
              <p className="text-xs text-muted-foreground">
                No período selecionado
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sessões Criadas</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSessions}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalAgentSessions} agents · {stats.totalTeamSessions} teams · {stats.sessionsInPeriod} no período
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tokens Consumidos</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.totalTokens.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                No período selecionado
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Modelos Utilizados */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Modelos de IA
              </CardTitle>
              <CardDescription>
                Modelos utilizados pelos agentes ativos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.models.map((model, index) => (
                  <div key={`${model.name}-${model.provider}-${index}`} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <div>
                        <p className="font-medium">{model.name}</p>
                        <p className="text-sm text-muted-foreground">{model.provider}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-black">{model.count} uso(s)</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Modelos de Embedding
              </CardTitle>
              <CardDescription>
                Modelos de embedding em uso no RAG
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.embeddingModels.map((model, index) => (
                  <div key={model.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <div>
                        <p className="font-medium">{model.name}</p>
                        <p className="text-sm text-muted-foreground">{model.provider}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-black">{model.count} uso(s)</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Métricas de Tokens por Entidade */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Consumo de Tokens por Entidade
            </CardTitle>
            <CardDescription>
              Total de tokens consumidos por cada agente/team no período selecionado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={tokenMetrics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="agentName" />
                <YAxis />
                <Tooltip
                    content={<CustomTooltip />}
                  formatter={(value?: string | number) => [typeof value === 'number' ? value.toLocaleString() : String(value ?? ''), 'Tokens']}
                  labelFormatter={(label) => {
                    const item = tokenMetrics.find(m => m.agentName === label)
                    const type = item?.entityType === 'team' ? 'Team' : 'Agent'
                    return `${type}: ${label}`
                  }}
                />
                <Legend />
                <Bar dataKey="inputTokens" fill="#8884d8" name="Tokens de Entrada" />
                <Bar dataKey="outputTokens" fill="#82ca9d" name="Tokens de Saída" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribuição de Sessões por Usuário */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Atividade por Tempo
              </CardTitle>
              <CardDescription>
                Distribuição de sessões ao longo do tempo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={stats.activityOverTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area type="monotone" dataKey="agentSessions" stackId="1" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} name="Agent Sessions" />
                  <Area type="monotone" dataKey="teamSessions" stackId="1" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.6} name="Team Sessions" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Sessões por Tipo
              </CardTitle>
              <CardDescription>
                Distribuição de sessões entre Agents e Teams
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Agent Sessions', value: stats.totalAgentSessions, fill: '#8884d8' },
                      { name: 'Team Sessions', value: stats.totalTeamSessions, fill: '#82ca9d' }
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({name, value}) => `${name}: ${value}`}
                  >
                    {[
                      { name: 'Agent Sessions', value: stats.totalAgentSessions, fill: '#8884d8' },
                      { name: 'Team Sessions', value: stats.totalTeamSessions, fill: '#82ca9d' }
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
