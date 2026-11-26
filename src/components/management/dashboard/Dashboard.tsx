'use client'

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { LiveStatus, LoadErrorState } from '@/components/ui/loading'
import { useProviderLabel } from '@/components/management/common/ProviderModel'
import { 
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
  Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DASHBOARD_PERIODS, DashboardStats } from '@/types/dashboard'
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

// Eixo de "atividade": a chave do dia vem do BFF como YYYY-MM-DD em UTC; sem o
// timeZone, 2026-10-15 viraria "14 de out." em UTC-3 (P1-04, formatos).
const DAY_FORMAT = { day: 'numeric', month: 'short', timeZone: 'UTC' } as const

// Falha de carga: status HTTP, ou sem status quando não houve resposta.
type LoadError = { status?: number }

// Gráfico sem pontos: texto na mesma altura, sem eixos vazios (V-P1-05-9).
function ChartEmpty({ className }: { className: string }) {
  const t = useTranslations('dashboard')
  return (
    <div className={cn('flex flex-col items-center justify-center gap-1 text-center', className)}>
      <p className="text-base font-semibold">{t('noData')}</p>
      <p className="max-w-[40ch] text-sm text-muted-foreground">{t('noDataHint')}</p>
    </div>
  )
}

// Corpo do gráfico na altura final. O ResponsiveContainer mede 0 px no 1º frame:
// até a primeira medida, um skeleton da mesma altura cobre o corpo (nunca em branco).
function ChartFrame({ height, children }: { height: number; children: ReactElement }) {
  const [measured, setMeasured] = useState(false)
  return (
    <div className="relative" style={{ height }}>
      {!measured && <Skeleton className="absolute inset-0" />}
      <ResponsiveContainer
        width="100%"
        height="100%"
        onResize={(width) => {
          if (width > 0) setMeasured(true)
        }}
      >
        {children}
      </ResponsiveContainer>
    </div>
  )
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [period, setPeriod] = useState<(typeof DASHBOARD_PERIODS)[number]>('today')
  const [loading, setLoading] = useState(true)
  // Pedido em curso (carga e troca de período): marca a área dos cards como ocupada.
  const [pending, setPending] = useState(true)
  const [statsError, setStatsError] = useState<LoadError | null>(null)
  const t = useTranslations('dashboard')
  const providerLabel = useProviderLabel()
  const format = useFormatter()
  const formatDay = (time: string) => format.dateTime(new Date(time), DAY_FORMAT)
  const formatNumber = (value: number) => format.number(value)

  // Só a requisição mais recente escreve (troca rápida de período). Os números
  // do período anterior ficam na tela até os novos chegarem; o "Tentar de novo"
  // usa o retorno (deu certo?).
  const requestId = useRef(0)
  const fetchStats = useCallback(async (): Promise<boolean> => {
    const id = ++requestId.current
    const isCurrent = () => id === requestId.current
    setPending(true)
    try {
      const response = await fetch(`/api/dashboard/stats?period=${period}`)
      const data = response.ok ? await response.json() : null
      if (!isCurrent()) return false
      if (data?.success) {
        setStats(data.data)
        setStatsError(null)
        return true
      }
      setStatsError({ status: response.status })
    } catch (error) {
      console.error('Error fetching stats:', error)
      if (isCurrent()) setStatsError({})
    } finally {
      if (isCurrent()) {
        setLoading(false)
        setPending(false)
      }
    }
    return false
  }, [period])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const title = (
    <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">
      {t('title')}
    </h1>
  )

  if (loading) {
    return (
      <div className="relative mx-auto max-w-7xl p-6">
        <div aria-busy="true">
          {/* Fora do fluxo (no padding): o indicador não empurra o esqueleto. */}
          <div className="absolute left-6 top-2">
            <LiveStatus>
              <span className="sr-only">{t('loading')}</span>
            </LiveStatus>
          </div>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Skeleton className="mb-1 h-7 w-40" />
                <Skeleton className="h-6 w-72 max-w-full max-sm:h-12" />
              </div>
              <Skeleton className="h-10 w-48" />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((key) => (
                <Skeleton key={key} className="h-[130px]" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {[0, 1].map((key) => (
                <Skeleton key={key} className="h-[164px]" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Skeleton className="h-[370px]" />
              <Skeleton className="h-[370px] max-sm:h-[394px]" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Só as séries com valor no período: a zerada não vira fatia, ponto nem legenda.
  const sessionsByType = [
    { key: 'agent', name: t('agentSessions'), value: stats?.totalAgentSessions ?? 0, fill: CHART.series1 },
    { key: 'team', name: t('teamSessions'), value: stats?.totalTeamSessions ?? 0, fill: CHART.series2 }
  ].filter((slice) => slice.value > 0)
  const activity = stats?.activityOverTime ?? []
  const activityCandidates: { key: 'agentSessions' | 'teamSessions'; name: string; color: string }[] = [
    { key: 'agentSessions', name: t('agentSessions'), color: CHART.series1 },
    { key: 'teamSessions', name: t('teamSessions'), color: CHART.series2 }
  ]
  const activitySeries = activityCandidates.filter(({ key }) => activity.some((point) => (point[key] ?? 0) > 0))
  const singlePoint = activity.length === 1

  return (
    <div>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            {title}
            <p className="text-muted-foreground">
              {t('subtitle')}
            </p>
          </div>
          <Select
            value={period}
            onValueChange={(value) => {
              const next = DASHBOARD_PERIODS.find((option) => option === value)
              if (next) setPeriod(next)
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t('periodPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {DASHBOARD_PERIODS.map((filter) => (
                <SelectItem key={filter} value={filter}>
                  {t(`period.${filter}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Os cards (ou o erro) ocupam a área abaixo do cabeçalho: trocar o
            período com falha mantém o seletor e o foco. */}
        <div aria-busy={pending} className="space-y-6">
        {statsError || !stats ? (
          <LoadErrorState
            title={t('loadError')}
            status={statsError?.status}
            onRetry={fetchStats}
          />
        ) : (
        <>
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
              <CardTitle className="text-sm font-medium">{t('peakDailyUsers')}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-mono text-3xl font-medium tabular-nums">{format.number(stats.peakDailyUsers)}</div>
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
                  teams: stats.totalTeamSessions
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
              {stats.models.length === 0 && (
                <p className="text-muted-foreground">{t('noModels')}</p>
              )}
              <div className="space-y-3">
                {stats.models.map((model, index) => (
                  <div key={`${model.name}-${model.provider}-${index}`} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-primary" />
                      <div>
                        <p className="font-medium">{model.name}</p>
                        <p className="text-sm text-muted-foreground">{providerLabel(model.provider)}</p>
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
              {stats.embeddingModels.length === 0 && (
                <p className="text-muted-foreground">{t('noEmbeddings')}</p>
              )}
              <div className="space-y-3">
                {stats.embeddingModels.map((model) => (
                  <div key={`${model.name}|${model.provider}`} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-primary" />
                      <div>
                        <p className="font-medium">{model.name}</p>
                        <p className="text-sm text-muted-foreground">{providerLabel(model.provider)}</p>
                      </div>
                    </div>
                    <Badge variant="secondary">{t('uses', { count: model.count })}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

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
              {activitySeries.length === 0 ? (
                <ChartEmpty className="h-[250px]" />
              ) : (
                <ChartFrame height={250}>
                  <AreaChart data={activity}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                    <XAxis dataKey="time" tickFormatter={formatDay} {...AXIS_PROPS} />
                    <YAxis width="auto" allowDecimals={false} tickFormatter={formatNumber} {...AXIS_PROPS} />
                    <Tooltip
                      content={<CustomTooltip />}
                      cursor={{ stroke: CHART.grid }}
                      labelFormatter={(time) => formatDay(String(time))}
                    />
                    <Legend />
                    {activitySeries.map(({ key, name, color }) => (
                      <Area
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stackId="1"
                        stroke={color}
                        fill={color}
                        fillOpacity={0.6}
                        name={name}
                        // Com 1 ponto a área não tem segmento: o ponto na cor da série é o que se vê.
                        dot={singlePoint ? { r: 4, fill: color, fillOpacity: 1, stroke: CHART.surface, strokeWidth: 2 } : false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </AreaChart>
                </ChartFrame>
              )}
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
              {sessionsByType.length === 0 ? (
                <ChartEmpty className="h-[250px] max-sm:h-[274px]" />
              ) : (
                <>
                  {/* Bloco de 250 px (274 no celular, onde a legenda de 2 itens quebra em 2
                      linhas): a mesma altura do estado vazio e do esqueleto (V12). */}
                  <ChartFrame height={220}>
                    <PieChart>
                      <Pie
                        data={sessionsByType}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={sessionsByType.length > 1 ? 2 : 0}
                        stroke={CHART.surface}
                        dataKey="value"
                      >
                        {sessionsByType.map((slice) => (
                          <Cell key={slice.key} fill={slice.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ChartFrame>
                  <ul
                    aria-label={t('sessionsByType')}
                    className="mt-2.5 flex min-h-[44px] flex-wrap content-start justify-center gap-x-4 gap-y-1 text-sm sm:min-h-0"
                  >
                    {sessionsByType.map((slice) => (
                      <li key={slice.key} className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ background: slice.fill }}
                        />
                        <span>
                          {slice.name}: <span className="font-mono tabular-nums">{format.number(slice.value)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </div>
        </>
        )}
        </div>
      </div>
    </div>
  )
}
