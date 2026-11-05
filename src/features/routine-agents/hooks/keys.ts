/** Chaves do TanStack Query dos agentes rotineiros (OPE-130). */
export const ROUTINE_QUERY_KEY = "routine-agents"
export const routineKeys = {
    all: [ROUTINE_QUERY_KEY] as const,
    list: (filter: string) => [ROUTINE_QUERY_KEY, "list", filter] as const,
    agent: (id: string) => [ROUTINE_QUERY_KEY, "agent", id] as const,
    settings: [ROUTINE_QUERY_KEY, "settings"] as const,
    opencode: [ROUTINE_QUERY_KEY, "opencode-options"] as const,
    runs: (agentId: string) => [ROUTINE_QUERY_KEY, "runs", agentId] as const,
    run: (runId: string) => [ROUTINE_QUERY_KEY, "run", runId] as const,
    entries: (agentId: string) => [ROUTINE_QUERY_KEY, "entries", agentId] as const,
    metrics: (agentId: string, params: Record<string, string>) => [ROUTINE_QUERY_KEY, "metrics", agentId, params] as const,
}
