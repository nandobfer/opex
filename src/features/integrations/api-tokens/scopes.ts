import { z } from "zod"
import { defaultToolConfirms, type OpexToolRisk } from "@/features/opex-agent/tool-tree"

/**
 * Escopos dos tokens de sistema da API interna (módulo PURO: tela e servidor).
 *
 * - `api:v1:*` — todas as rotas da API v1 que exigem escopo (atuais e futuras);
 * - `api:v1:<recurso>` — uma rota (declarada em `PUBLIC_TOKEN_ROUTES`);
 * - `mcp:owner` — usar o servidor MCP do dono (`initialize`/`ping`/`tools/list`) e o grupo Contexto;
 * - `mcp:owner:tool:*` · `mcp:owner:group:<grupo>` · `mcp:owner:tool:<nome>` — ferramentas concedidas
 *   (curinga e grupo são dinâmicos: ferramenta nova entra sozinha; a lista explícita fica fixa);
 * - `mcp:owner:destructive` — libera, entre as concedidas, as destrutivas e as que pedem confirmação
 *   por padrão (sem ele, são recusadas: pelo token não existe confirmação no chat).
 *
 * Token legado (sem `escopos` gravado) não tem escopo: continua só com as rotas livres (`whoami`).
 */

export const API_SCOPE_ALL = "api:v1:*"
export const MCP_OWNER_SCOPE = "mcp:owner"
export const MCP_OWNER_ALL_TOOLS = "mcp:owner:tool:*"
export const MCP_OWNER_DESTRUCTIVE = "mcp:owner:destructive"
const API_PREFIX = "api:v1:"
const TOOL_PREFIX = "mcp:owner:tool:"
const GROUP_PREFIX = "mcp:owner:group:"

export const apiRouteScope = (resource: string) => `${API_PREFIX}${resource}`
export const mcpOwnerToolScope = (tool: string) => `${TOOL_PREFIX}${tool}`
export const mcpOwnerGroupScope = (group: string) => `${GROUP_PREFIX}${group}`

/** Grupos que o token não recebe: os arquivos do chat dependem de uma conversa do Maddox. */
export const MADDOX_TOKEN_EXCLUDED_GROUPS: readonly string[] = ["files"]

const SCOPE_PATTERN = /^(api:v1:(\*|[a-z0-9][a-z0-9_.-]*)|mcp:owner|mcp:owner:destructive|mcp:owner:tool:(\*|[A-Za-z0-9_-]+)|mcp:owner:group:[a-z0-9][a-z0-9-]*)$/

export const apiTokenScopeSchema = z.string().regex(SCOPE_PATTERN, "Escopo inválido")

/** Escopos concedidos a um token: pelo menos um, sem repetição, MCP só com `mcp:owner`. */
export const apiTokenScopesSchema = z
    .array(apiTokenScopeSchema)
    .min(1, "Escolha pelo menos um escopo")
    .max(500, "Escopos demais")
    .superRefine((scopes, ctx) => {
        if (new Set(scopes).size !== scopes.length) ctx.addIssue({ code: "custom", message: "Escopo repetido" })
        const needsOwner = scopes.some((scope) => scope.startsWith("mcp:owner:"))
        if (needsOwner && !scopes.includes(MCP_OWNER_SCOPE)) ctx.addIssue({ code: "custom", message: "Ferramentas do MCP exigem o acesso ao MCP do dono" })
    })

export const isApiScope = (scope: string) => scope.startsWith(API_PREFIX)
export const isToolScope = (scope: string) => scope.startsWith(TOOL_PREFIX) && scope !== MCP_OWNER_ALL_TOOLS
export const isGroupScope = (scope: string) => scope.startsWith(GROUP_PREFIX)
export const toolOfScope = (scope: string) => scope.slice(TOOL_PREFIX.length)
export const groupOfScope = (scope: string) => scope.slice(GROUP_PREFIX.length)

/** Escopos efetivos de um token gravado (`undefined`/`null` = legado, sem escopo). */
export function effectiveScopes(saved: readonly string[] | null | undefined): { scopes: string[]; legacy: boolean } {
    return Array.isArray(saved) && saved.length > 0 ? { scopes: [...saved], legacy: false } : { scopes: [], legacy: true }
}

/** A rota está liberada? `null` = livre para qualquer token válido. */
export function routeAllowed(scopes: readonly string[], required: string | null): boolean {
    if (required === null) return true
    return scopes.includes(required) || (required.startsWith(API_PREFIX) && scopes.includes(API_SCOPE_ALL))
}

/** Metadados de ferramenta usados na decisão (os mesmos de `OpexToolMetaDto`). */
export interface ScopeToolMeta {
    name: string
    group: string
    risk: OpexToolRisk
    confirmByDefault?: boolean
    alwaysOn?: boolean
}

export const isTokenGrantableTool = (meta: Pick<ScopeToolMeta, "group">) => !MADDOX_TOKEN_EXCLUDED_GROUPS.includes(meta.group)

/**
 * Pelo token, exige `mcp:owner:destructive`: tudo o que pediria confirmação no chat por padrão e também
 * o que o dono marcou "pede confirmação" nas configurações do Maddox (`overrides`). Desligar a
 * confirmação de uma destrutiva no chat não a libera para o token.
 */
export const toolNeedsDestructiveScope = (meta: Pick<ScopeToolMeta, "name" | "risk" | "confirmByDefault">, overrides: Readonly<Record<string, boolean>> = {}) =>
    defaultToolConfirms(meta) || overrides[meta.name] === true

export type ToolScopeRefusal = "no_mcp" | "not_grantable" | "not_granted" | "destructive"
export type ToolScopeDecision = { ok: true } | { ok: false; reason: ToolScopeRefusal }

/** A ferramenta é coberta pela concessão (sem olhar o escopo destrutivo)? */
export function toolGranted(scopes: readonly string[], meta: ScopeToolMeta): boolean {
    if (!scopes.includes(MCP_OWNER_SCOPE) || !isTokenGrantableTool(meta)) return false
    return Boolean(meta.alwaysOn) || scopes.includes(MCP_OWNER_ALL_TOOLS) || scopes.includes(mcpOwnerGroupScope(meta.group)) || scopes.includes(mcpOwnerToolScope(meta.name))
}

/** Decisão do token para uma ferramenta do MCP do dono (verificada SEMPRE no servidor). */
export function mcpOwnerToolDecision(scopes: readonly string[], meta: ScopeToolMeta, overrides: Readonly<Record<string, boolean>> = {}): ToolScopeDecision {
    if (!scopes.includes(MCP_OWNER_SCOPE)) return { ok: false, reason: "no_mcp" }
    if (!isTokenGrantableTool(meta)) return { ok: false, reason: "not_grantable" }
    if (!toolGranted(scopes, meta)) return { ok: false, reason: "not_granted" }
    if (toolNeedsDestructiveScope(meta, overrides) && !scopes.includes(MCP_OWNER_DESTRUCTIVE)) return { ok: false, reason: "destructive" }
    return { ok: true }
}

/** Ferramentas concedidas que exigem o escopo destrutivo (com e sem ele concedido). */
export function grantedSensitiveTools<T extends ScopeToolMeta>(scopes: readonly string[], tools: readonly T[]): T[] {
    return tools.filter((tool) => toolGranted(scopes, tool) && toolNeedsDestructiveScope(tool))
}

/** Escopo que libera uma ferramenta (texto da documentação). */
export function toolScopeHint(meta: ScopeToolMeta): string {
    if (!isTokenGrantableTool(meta)) return "não disponível por token"
    const grant = meta.alwaysOn ? MCP_OWNER_SCOPE : `${mcpOwnerToolScope(meta.name)} | ${mcpOwnerGroupScope(meta.group)} | ${MCP_OWNER_ALL_TOOLS}`
    return toolNeedsDestructiveScope(meta) ? `${grant} + ${MCP_OWNER_DESTRUCTIVE}` : grant
}

// ---------------------------------------------------------------- seleção da tela

export type ToolGrantMode = "all" | "groups" | "tools"

export interface ApiTokenScopeSelection {
    apiAll: boolean
    apiRoutes: string[]
    mcpOwner: boolean
    toolMode: ToolGrantMode
    groups: string[]
    tools: string[]
    destructive: boolean
}

export const EMPTY_SCOPE_SELECTION: ApiTokenScopeSelection = { apiAll: false, apiRoutes: [], mcpOwner: false, toolMode: "all", groups: [], tools: [], destructive: false }

/** Seleção da tela → escopos gravados (o modo de ferramentas decide qual concessão vale). */
export function selectionToScopes(selection: ApiTokenScopeSelection): string[] {
    const scopes: string[] = []
    if (selection.apiAll) scopes.push(API_SCOPE_ALL)
    else scopes.push(...selection.apiRoutes)
    if (selection.mcpOwner) {
        scopes.push(MCP_OWNER_SCOPE)
        if (selection.toolMode === "all") scopes.push(MCP_OWNER_ALL_TOOLS)
        if (selection.toolMode === "groups") scopes.push(...selection.groups.map(mcpOwnerGroupScope))
        if (selection.toolMode === "tools") scopes.push(...selection.tools.map(mcpOwnerToolScope))
        if (selection.destructive) scopes.push(MCP_OWNER_DESTRUCTIVE)
    }
    return [...new Set(scopes)]
}

/** Escopos gravados → seleção da tela (edição). */
export function scopesToSelection(scopes: readonly string[]): ApiTokenScopeSelection {
    const groups = scopes.filter(isGroupScope).map(groupOfScope)
    const tools = scopes.filter(isToolScope).map(toolOfScope)
    // MCP sem curinga, grupo nem ferramenta = nenhuma além do Contexto: lista explícita vazia (nunca "Todas").
    const toolMode: ToolGrantMode = scopes.includes(MCP_OWNER_ALL_TOOLS) ? "all" : groups.length ? "groups" : tools.length || scopes.includes(MCP_OWNER_SCOPE) ? "tools" : "all"
    return {
        apiAll: scopes.includes(API_SCOPE_ALL),
        apiRoutes: scopes.filter((scope) => isApiScope(scope) && scope !== API_SCOPE_ALL),
        mcpOwner: scopes.includes(MCP_OWNER_SCOPE),
        toolMode,
        groups,
        tools,
        destructive: scopes.includes(MCP_OWNER_DESTRUCTIVE),
    }
}

// ---------------------------------------------------------------- resumo legível

export interface ScopeCatalogForSummary {
    groups: readonly { id: string; label: string }[]
    tools: readonly (ScopeToolMeta & { label?: string })[]
}

export type ScopeBadgeTone = "default" | "secondary" | "warning" | "destructive"
export interface ScopeBadge {
    key: string
    label: string
    tone: ScopeBadgeTone
}

export interface ScopeSummary {
    badges: ScopeBadge[]
    lines: string[]
    /** Ferramentas liberadas pelo token (com a regra destrutiva aplicada). */
    allowedTools: number
    /** Concedidas que dependem do escopo destrutivo: liberadas (com ele) ou bloqueadas (sem ele). */
    sensitiveTools: string[]
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Resumo para a tela (badges e frases), a auditoria e os logs. */
export function describeScopes(saved: readonly string[] | null | undefined, catalog?: ScopeCatalogForSummary): ScopeSummary {
    const { scopes, legacy } = effectiveScopes(saved)
    if (legacy) return { badges: [{ key: "legacy", label: "Legado · só whoami", tone: "secondary" }], lines: ["Token antigo, sem escopo: acessa só as rotas livres (GET /api/v1/whoami)."], allowedTools: 0, sensitiveTools: [] }
    const badges: ScopeBadge[] = []
    const lines: string[] = []
    if (scopes.includes(API_SCOPE_ALL)) {
        badges.push({ key: "api", label: "API v1", tone: "default" })
        lines.push("API v1: todas as rotas (atuais e futuras).")
    } else {
        const routes = scopes.filter(isApiScope)
        if (routes.length) {
            badges.push({ key: "api", label: `API v1 · ${plural(routes.length, "rota", "rotas")}`, tone: "default" })
            lines.push(`API v1: ${routes.join(", ")}.`)
        }
    }
    let allowedTools = 0
    let sensitiveTools: string[] = []
    if (scopes.includes(MCP_OWNER_SCOPE)) {
        const destructive = scopes.includes(MCP_OWNER_DESTRUCTIVE)
        if (catalog) {
            allowedTools = catalog.tools.filter((tool) => mcpOwnerToolDecision(scopes, tool).ok).length
            sensitiveTools = grantedSensitiveTools(scopes, catalog.tools).map((tool) => tool.label ?? tool.name)
        }
        const groupLabel = (id: string) => catalog?.groups.find((group) => group.id === id)?.label ?? id
        const groups = scopes.filter(isGroupScope).map(groupOfScope)
        const tools = scopes.filter(isToolScope).map(toolOfScope)
        const grant = scopes.includes(MCP_OWNER_ALL_TOOLS)
            ? "todas as ferramentas (inclusive as futuras)"
            : groups.length
              ? `grupos ${groups.map(groupLabel).join(", ")}`
              : tools.length
                ? plural(tools.length, "ferramenta escolhida", "ferramentas escolhidas")
                : "só o grupo Contexto"
        badges.push({ key: "mcp", label: catalog ? `MCP · ${plural(allowedTools, "ferramenta", "ferramentas")}` : "MCP do dono", tone: "default" })
        lines.push(`MCP do dono: ${grant}${catalog ? ` — ${plural(allowedTools, "ferramenta liberada", "ferramentas liberadas")} hoje` : ""}.`)
        if (destructive) {
            badges.push({ key: "destructive", label: "Destrutivas", tone: "destructive" })
            lines.push(`Ferramentas destrutivas LIBERADAS, sem confirmação${sensitiveTools.length ? `: ${sensitiveTools.join(", ")}` : ""}.`)
        } else if (sensitiveTools.length) {
            lines.push(`Destrutivas recusadas (sem o escopo destrutivo): ${sensitiveTools.join(", ")}.`)
        }
    }
    return { badges, lines, allowedTools, sensitiveTools }
}
