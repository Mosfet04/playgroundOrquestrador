export const APIRoutes = {
  GetPlaygroundAgents: (PlaygroundApiUrl: string) =>
    `${PlaygroundApiUrl}/agents`,
  AgentRun: (PlaygroundApiUrl: string, agentId: string) =>
    `${PlaygroundApiUrl}/agents/${agentId}/runs`,
  PlaygroundStatus: (PlaygroundApiUrl: string) =>
    `${PlaygroundApiUrl}/status`,
  GetPlaygroundSessions: (PlaygroundApiUrl: string, componentId: string, type: string = 'agent') =>
    `${PlaygroundApiUrl}/sessions?type=${type}&component_id=${encodeURIComponent(componentId)}&limit=20&page=1&sort_by=updated_at&sort_order=desc`,
  GetPlaygroundSession: (
    PlaygroundApiUrl: string,
    sessionId: string
  ) =>
    `${PlaygroundApiUrl}/sessions/${sessionId}?type=agent`,

  DeletePlaygroundSession: (
    PlaygroundApiUrl: string,
    sessionId: string
  ) =>
    `${PlaygroundApiUrl}/sessions/${sessionId}?type=agent`,

  GetPlayGroundTeams: (PlaygroundApiUrl: string) =>
    `${PlaygroundApiUrl}/teams`,
  TeamRun: (PlaygroundApiUrl: string, teamId: string) =>
    `${PlaygroundApiUrl}/teams/${teamId}/runs`,
  GetPlaygroundTeamSessions: (PlaygroundApiUrl: string, teamId: string) =>
    `${PlaygroundApiUrl}/sessions?type=team&component_id=${encodeURIComponent(teamId)}&limit=20&page=1&sort_by=updated_at&sort_order=desc`,
  GetPlaygroundTeamSession: (
    PlaygroundApiUrl: string,
    sessionId: string
  ) =>
    `${PlaygroundApiUrl}/sessions/${sessionId}?type=team`,
  DeletePlaygroundTeamSession: (
    PlaygroundApiUrl: string,
    sessionId: string
  ) => `${PlaygroundApiUrl}/sessions/${sessionId}?type=team`
}
