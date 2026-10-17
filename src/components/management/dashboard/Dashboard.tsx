'use client'

import { useState, useEffect } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
import { DashboardStats, TokenMetrics } from '@/types/dashboard'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label, labelFormatter }: any) => {
  const format = useFormatter()
  if (active && payload && payload.length) {
    return (
      <div className="rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-popover">
        {label && (
          <p className="font-semibold">
            {labelFormatter ? labelFormatter(label, payload) : label}
          </p>
        )}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {payload.map((item: any) => (
          <p key={item.dataKey}>
            {item.name}: {format.number(item.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
}
// Gráficos só com tokens (decisão 0009, D-P1-02-1 = A): série 1 primary, série 2
// muted-foreground; grade em border, eixos em muted-foreground.
const CHART = {
  series1: 'hsl(var(--primary))',
  series2: 'hsl(var(--muted-foreground))',
  grid: 'hsl(var(--border))',
  axis: 'hsl(var(--muted-foreground))',
  surface: 'hsl(var(--card))',
  cursor: 'hsl(var(--muted))'
}
const AXIS_PROPS = { stroke: CHART.grid, tick: { fill: CHART.axis } }

const TIME_FILTERS = ['1h', '24h', '7d', '30d', '90d'] as const

// Eixo de "atividade": a chave do dia vem do BFF como YYYY-MM-DD em UTC; sem o
// timeZone, 2026-10-15 viraria "14 de out." em UTC-3 (P1-04, formatos).
const DAY_FORMAT = { day: 'numeric', month: 'short', timeZone: 'UTC' } as const

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [tokenMetrics, setTokenMetrics] = useState<TokenMetrics[]>([])
  const [timeFilter, setTimeFilter] = useState<string>('24h')
  const [loading, setLoading] = useState(true)
  const t = useTranslations('dashboard')
  const format = useFormatter()
  const formatDay = (time: string) => format.dateTime(new Date(time), DAY_FORMAT)
  const formatNumber = (value: number) => format.number(value)

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
      <div>
        <div className="max-w-7xl mx-auto p-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-1/4" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="text-muted-foreground">
              {t('subtitle')}
            </p>
          </div>
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t('periodPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {TIME_FILTERS.map((filter) => (
                <SelectItem key={filter} value={filter}>
                  {t(`period.${filter}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Estatísticas Gerais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('activeAgents')}</CardTitle>
              <Bot className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-mono text-3xl font-medium tabular-nums">{format.number(stats.activeAgents)}</div>
              <p className="text-xs text-muted-foreground">
                {t('totalAgents', { total: stats.totalAgents })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('uniqueUsers')}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-mono text-3xl font-medium tabular-nums">{format.number(stats.uniqueUsers)}</div>
              <p className="text-xs text-muted-foreground">
                {t('inPeriod')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('sessionsCreated')}</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-mono text-3xl font-medium tabular-nums">{format.number(stats.totalSessions)}</div>
              <p className="text-xs text-muted-foreground">
                {t('sessionsBreakdown', {
                  agents: stats.totalAgentSessions,
                  teams: stats.totalTeamSessions,
                  period: stats.sessionsInPeriod
                })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('tokensConsumed')}</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-mono text-3xl font-medium tabular-nums">
                {format.number(stats.totalTokens)}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('inPeriod')}
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
                {t('aiModels')}
              </CardTitle>
              <CardDescription>
                {t('aiModelsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.models.map((model, index) => (
                  <div key={`${model.name}-${model.provider}-${index}`} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-primary" />
                      <div>
                        <p className="font-medium">{model.name}</p>
                        <p className="text-sm text-muted-foreground">{model.provider}</p>
                      </div>
                    </div>
                    <Badge variant="secondary">{t('uses', { count: model.count })}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                {t('embeddingModels')}
              </CardTitle>
              <CardDescription>
                {t('embeddingModelsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.embeddingModels.map((model) => (
                  <div key={model.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-primary" />
                      <div>
                        <p className="font-medium">{model.name}</p>
                        <p className="text-sm text-muted-foreground">{model.provider}</p>
                      </div>
                    </div>
                    <Badge variant="secondary">{t('uses', { count: model.count })}</Badge>
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
              {t('tokensByEntity')}
            </CardTitle>
            <CardDescription>
              {t('tokensByEntityDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={tokenMetrics}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                <XAxis dataKey="agentName" {...AXIS_PROPS} />
                <YAxis
                  allowDecimals={false}
                  tickFormatter={formatNumber}
                  {...AXIS_PROPS}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: CHART.cursor }} />
                <Legend />
                <Bar dataKey="inputTokens" fill={CHART.series1} name={t('inputTokens')} />
                <Bar dataKey="outputTokens" fill={CHART.series2} name={t('outputTokens')} />
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
                {t('activity')}
              </CardTitle>
              <CardDescription>
                {t('activityDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={stats.activityOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                  <XAxis dataKey="time" tickFormatter={formatDay} {...AXIS_PROPS} />
                  <YAxis
                    allowDecimals={false}
                    tickFormatter={formatNumber}
                    {...AXIS_PROPS}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ stroke: CHART.grid }}
                    labelFormatter={(time) => formatDay(String(time))}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="agentSessions" stackId="1" stroke={CHART.series1} fill={CHART.series1} fillOpacity={0.6} name={t('agentSessions')} />
                  <Area type="monotone" dataKey="teamSessions" stackId="1" stroke={CHART.series2} fill={CHART.series2} fillOpacity={0.6} name={t('teamSessions')} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                {t('sessionsByType')}
              </CardTitle>
              <CardDescription>
                {t('sessionsByTypeDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={[
                      { name: t('agentSessions'), value: stats.totalAgentSessions, fill: CHART.series1 },
                      { name: t('teamSessions'), value: stats.totalTeamSessions, fill: CHART.series2 }
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    stroke={CHART.surface}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${format.number(Number(value))}`}
                  >
                    {[
                      { name: t('agentSessions'), value: stats.totalAgentSessions, fill: CHART.series1 },
                      { name: t('teamSessions'), value: stats.totalTeamSessions, fill: CHART.series2 }
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
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
