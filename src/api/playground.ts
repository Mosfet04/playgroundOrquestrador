import { toast } from 'sonner'

import { APIRoutes } from './routes'

import {
  ComboboxAgent,
  SessionEntry,
  ComboboxTeam
} from '@/types/playground'

export const getPlaygroundAgentsAPI = async (
  endpoint: string
): Promise<ComboboxAgent[]> => {
  const url = APIRoutes.GetPlaygroundAgents(endpoint)
  try {
    const response = await fetch(url, { method: 'GET' })
    if (!response.ok) {
      toast.error(`Failed to fetch playground agents: ${response.statusText}`)
      return []
    }
    const data = await response.json()
    // Handle both array response and config-style response
    const agentList = Array.isArray(data) ? data : (data.agents ?? [])
    // Transform the API response into the expected shape.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agents: ComboboxAgent[] = agentList.map((item: any) => ({
      value: item.agent_id || item.id || '',
      label: item.name || '',
      model: {
        provider: item.model?.provider || ''
      },
      storage: !!(item.storage || item.sessions)
    }))
    return agents
  } catch {
    toast.error('Error fetching playground agents')
    return []
  }
}

export const getPlaygroundStatusAPI = async (base: string): Promise<number> => {
  try {
    // Try /status first (AGUI interface)
    const response = await fetch(APIRoutes.PlaygroundStatus(base), {
      method: 'GET'
    })
    if (response.ok) return response.status
    // Fallback to /health (AgentOS native)
    const healthResponse = await fetch(`${base}/health`, { method: 'GET' })
    return healthResponse.ok ? 200 : healthResponse.status
  } catch {
    return 503
  }
}

export const getAllPlaygroundSessionsAPI = async (
  base: string,
  agentId: string
): Promise<SessionEntry[]> => {
  try {
    const response = await fetch(
      APIRoutes.GetPlaygroundSessions(base, agentId, 'agent'),
      {
        method: 'GET'
      }
    )
    if (!response.ok) {
      if (response.status === 404) {
        return []
      }
      throw new Error(`Failed to fetch sessions: ${response.statusText}`)
    }
    const data = await response.json()
    // Handle paginated response: { data: [...], meta: {...} } or array or { items/sessions: [...] }
    const sessions = Array.isArray(data) ? data : (data.data ?? data.items ?? data.sessions ?? [])
    return sessions.map((s: Record<string, unknown>) => ({
      session_id: (s.session_id ?? s.id ?? '') as string,
      title: (s.session_name ?? s.title ?? s.name ?? s.session_id ?? '') as string,
      created_at: typeof s.created_at === 'string'
        ? Math.floor(new Date(s.created_at as string).getTime() / 1000)
        : (s.created_at ?? s.updated_at ?? 0) as number
    }))
  } catch {
    return []
  }
}

export const getPlaygroundSessionAPI = async (
  base: string,
  _agentId: string,
  sessionId: string
) => {
  const response = await fetch(
    APIRoutes.GetPlaygroundSession(base, sessionId),
    {
      method: 'GET'
    }
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch session: ${response.statusText}`)
  }
  return response.json()
}

export const deletePlaygroundSessionAPI = async (
  base: string,
  _agentId: string,
  sessionId: string
) => {
  const response = await fetch(
    APIRoutes.DeletePlaygroundSession(base, sessionId),
    {
      method: 'DELETE'
    }
  )
  return response
}

export const getPlaygroundTeamsAPI = async (
  endpoint: string
): Promise<ComboboxTeam[]> => {
  const url = APIRoutes.GetPlayGroundTeams(endpoint)
  try {
    const response = await fetch(url, { method: 'GET' })
    if (!response.ok) {
      // Silently return empty - teams may not be supported by the backend
      return []
    }
    const data = await response.json()
    // Handle both array response and config-style response
    const teamList = Array.isArray(data) ? data : (data.teams ?? data.value ?? [])
    if (!Array.isArray(teamList)) return []
    // Transform the API response into the expected shape.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teams: ComboboxTeam[] = teamList.map((item: any) => ({
      value: item.team_id || item.id || '',
      label: item.name || '',
      model: {
        provider: item.model?.provider || ''
      },
      storage: !!(item.storage || item.sessions)
    }))
    return teams
  } catch {
    // Silently return empty - teams endpoint may not exist
    return []
  }
}

export const getPlaygroundTeamSessionsAPI = async (
  base: string,
  teamId: string
): Promise<SessionEntry[]> => {
  try {
    const response = await fetch(
      APIRoutes.GetPlaygroundTeamSessions(base, teamId),
      {
        method: 'GET'
      }
    )
    if (!response.ok) {
      if (response.status === 404) {
        return []
      }
      throw new Error(`Failed to fetch team sessions: ${response.statusText}`)
    }
    const data = await response.json()
    const sessions = Array.isArray(data) ? data : (data.data ?? data.items ?? data.sessions ?? [])
    return sessions.map((s: Record<string, unknown>) => ({
      session_id: (s.session_id ?? s.id ?? '') as string,
      title: (s.session_name ?? s.title ?? s.name ?? s.session_id ?? '') as string,
      created_at: typeof s.created_at === 'string'
        ? Math.floor(new Date(s.created_at as string).getTime() / 1000)
        : (s.created_at ?? s.updated_at ?? 0) as number
    }))
  } catch {
    return []
  }
}

export const getPlaygroundTeamSessionAPI = async (
  base: string,
  _teamId: string,
  sessionId: string
) => {
  const response = await fetch(
    APIRoutes.GetPlaygroundTeamSession(base, sessionId),
    {
      method: 'GET'
    }
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch team session: ${response.statusText}`)
  }
  return response.json()
}

export const deletePlaygroundTeamSessionAPI = async (
  base: string,
  _teamId: string,
  sessionId: string
) => {
  const response = await fetch(
    APIRoutes.DeletePlaygroundTeamSession(base, sessionId),
    {
      method: 'DELETE'
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to delete team session: ${response.statusText}`)
  }
  return response
}
