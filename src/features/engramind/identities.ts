import type { EngramindAgent, EngramindApp, EngramindToken } from "./types"

/**
 * Gestão de apps, agentes e tokens da aba Identidades (OPE-117; módulo PURO). No Engramind 0.11.0 todo
 * token pertence a um app (`app` obrigatório) e o vínculo app/agente é imutável:
 * - a lista geral mostra só os tokens **administrativos** (`kind: admin`; decisão do dono);
 * - os tokens `app` e os `agent` sem agente aparecem no detalhe do app; os de agente, no agente;
 * - o **token em uso** de um app é o do próprio Opex (app opex) ou o `kind: app` ativo usado por último.
 */

export const TOKEN_EXPIRING_DAYS = 7
export const TOKEN_IDLE_DAYS = 30
const DAY_MS = 24 * 3600_000

export const adminTokens = (tokens: readonly EngramindToken[]) => tokens.filter((token) => token.kind === "admin")

export const tokensOfAgent = (tokens: readonly EngramindToken[], agent: Pick<EngramindAgent, "id" | "slug" | "app">) =>
    tokens.filter((token) => token.agent && (token.agent.id === agent.id || (token.agent.slug === agent.slug && token.app.slug === agent.app.slug)))

const time = (value: string | null | undefined) => (value ? Date.parse(value) : 0)

/** Token em uso do app: o de app do Opex (id conhecido) ou o `kind: app` ativo usado (ou criado) por último. */
export function appTokenInUse(tokens: readonly EngramindToken[], app: Pick<EngramindApp, "slug">, ownIds: readonly (string | null | undefined)[] = []): EngramindToken | null {
    const candidates = tokens.filter((token) => token.app.slug === app.slug && token.kind === "app" && token.status === "active")
    const own = candidates.find((token) => ownIds.includes(token.id))
    if (own) return own
    return [...candidates].sort((a, b) => time(b.last_used_at) - time(a.last_used_at) || time(b.created_at) - time(a.created_at))[0] ?? null
}

/** Tokens do app sem agente (os `app` e os `admin` dele), sem o token em uso (que fica fixo no topo). */
export function tokensOfApp(tokens: readonly EngramindToken[], app: Pick<EngramindApp, "slug">, inUse: EngramindToken | null): EngramindToken[] {
    return tokens.filter((token) => token.app.slug === app.slug && !token.agent && token.id !== inUse?.id)
}

export type TokenAlert = "expiring" | "idle" | "owner-disabled"

export const TOKEN_ALERT_LABELS: Record<TokenAlert, string> = {
    expiring: `Expira em até ${TOKEN_EXPIRING_DAYS} dias`,
    idle: `Sem uso há ${TOKEN_IDLE_DAYS} dias ou mais`,
    "owner-disabled": "App ou agente desativado com o token ativo",
}

/** Alertas de saúde de um token ativo (expirando, sem uso, dono desativado). */
export function tokenHealth(token: EngramindToken, context: { apps: readonly EngramindApp[]; agents: readonly EngramindAgent[] }, now = new Date()): TokenAlert[] {
    if (token.status !== "active") return []
    const alerts: TokenAlert[] = []
    const nowMs = now.getTime()
    if (token.expires_at && Date.parse(token.expires_at) - nowMs <= TOKEN_EXPIRING_DAYS * DAY_MS) alerts.push("expiring")
    const reference = token.last_used_at ?? token.created_at
    if (reference && nowMs - Date.parse(reference) >= TOKEN_IDLE_DAYS * DAY_MS) alerts.push("idle")
    const app = context.apps.find((item) => item.slug === token.app.slug)
    const agent = token.agent ? context.agents.find((item) => item.id === token.agent!.id || (item.slug === token.agent!.slug && item.app.slug === token.app.slug)) : null
    if (app?.disabled_at || agent?.disabled_at) alerts.push("owner-disabled")
    return alerts
}

export interface AppSummary {
    app: EngramindApp
    agents: number
    activeTokens: number
    /** Último uso entre os tokens do app (ISO), ou `null`. */
    lastActivity: string | null
    alerts: number
}

/** Resumo de cada app (contagens e última atividade) para a lista. */
export function appSummaries(apps: readonly EngramindApp[], agents: readonly EngramindAgent[], tokens: readonly EngramindToken[], now = new Date()): AppSummary[] {
    return apps.map((app) => {
        const own = tokens.filter((token) => token.app.slug === app.slug)
        const last = own.map((token) => token.last_used_at).filter((value): value is string => Boolean(value)).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
        return {
            app,
            agents: agents.filter((agent) => agent.app.slug === app.slug).length,
            activeTokens: own.filter((token) => token.status === "active").length,
            lastActivity: last,
            alerts: own.reduce((sum, token) => sum + tokenHealth(token, { apps, agents }, now).length, 0),
        }
    })
}

export type AppStatusFilter = "all" | "active" | "inactive"

/** Filtros da lista de apps: busca (nome/slug), status e "com alertas". */
export function filterAppSummaries(rows: readonly AppSummary[], filters: { term: string; status: AppStatusFilter; alertsOnly: boolean }): AppSummary[] {
    const term = filters.term.trim().toLowerCase()
    return rows.filter((row) => {
        if (term && !row.app.slug.toLowerCase().includes(term) && !row.app.name.toLowerCase().includes(term)) return false
        if (filters.status === "active" && row.app.disabled_at) return false
        if (filters.status === "inactive" && !row.app.disabled_at) return false
        if (filters.alertsOnly && row.alerts === 0) return false
        return true
    })
}
