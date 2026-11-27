import type { EngramindToken } from "../types"
import { engramindCall, type EngramindTarget } from "./client"
import { engramindCodeOf } from "./errors"
import { AcaoAuditoria, auditEngramind, engramindLog } from "./shared"

/**
 * Migração A (OPE-206): tokens gravados no banco DESTA instância que pertencem a outro app do Engramind.
 *
 * Uma instância ligada com a chave de outro app (ex.: o Opex do Alfredo com a chave do `alfredopex`) criou, antes
 * da OPE-206, os agentes e tokens no app `opex` do dono. Na subida e no "Conferir canais e agentes":
 * 1. junta os ids gravados aqui: os tokens dos agentes (`engramind_state.agentTokens`), o token de app
 *    (`engramind_state.appToken`) e os dos rotineiros (`RoutineAgent.engramindToken`);
 * 2. confere o app de cada um em `GET /v1/tokens` (token admin);
 * 3. revoga SÓ aquele id (nunca por agente, app ou rótulo: os tokens do dono gravados em outro banco ficam
 *    intocados), apaga o registro e limpa os caches derivados (contexto, entregas, similares), que apontam para
 *    memórias de outro app;
 * 4. o provisionamento seguinte (`runNetwork`) recria agentes, canais, assinaturas e tokens no app certo, e os
 *    rotineiros afetados são reprovisionados (`afterProvision`).
 * Sem token de outro app (a instância do dono), não escreve nada.
 */

const TOKEN_LIST_MAX_PAGES = 50
const enc = encodeURIComponent

type StoredKind = "agent" | "app" | "routine"

export interface StoredToken {
    kind: StoredKind
    tokenId: string
    /** Identidade (agente de memórias) ou id do rotineiro. */
    owner: string
}

export interface ForeignTokensResult {
    /** Ids revogados (`tk_…`). */
    revoked: string[]
    /** Rotineiros reprovisionados depois da rede (no app certo). */
    afterProvision: () => Promise<void>
}

const noop = async () => undefined

/** Ids gravados no banco desta instância. */
async function storedTokens(): Promise<StoredToken[]> {
    const { EngramindState, ENGRAMIND_STATE_ID, engramindDb } = await import("./models")
    await engramindDb()
    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ agentTokens: 1, appToken: 1 }).lean()
    const rows: StoredToken[] = []
    for (const [identity, token] of Object.entries(state?.agentTokens ?? {})) if (token?.tokenId) rows.push({ kind: "agent", tokenId: token.tokenId, owner: identity })
    if (state?.appToken?.tokenId) rows.push({ kind: "app", tokenId: state.appToken.tokenId, owner: "app" })
    const { RoutineAgent } = await import("@/lib/db/models/RoutineAgent")
    const agents = await RoutineAgent.find({ "engramindToken.tokenId": { $exists: true } })
        .select({ _id: 1, engramindToken: 1 })
        .lean<{ _id: unknown; engramindToken?: { tokenId?: string } | null }[]>()
    for (const agent of agents) if (agent.engramindToken?.tokenId) rows.push({ kind: "routine", tokenId: agent.engramindToken.tokenId, owner: String(agent._id) })
    return rows
}

/** Tokens do Engramind por id, só os gravados aqui (pagina até achar todos). */
async function tokensById(ids: ReadonlySet<string>, target: EngramindTarget): Promise<Map<string, EngramindToken>> {
    const found = new Map<string, EngramindToken>()
    let cursor: string | null = null
    for (let page = 0; page < TOKEN_LIST_MAX_PAGES; page++) {
        const query: Record<string, string | number> = { limit: 200 }
        if (cursor) query.cursor = cursor
        const list: { tokens?: EngramindToken[]; next_cursor?: string | null } | null = await engramindCall("GET", { path: "/v1/tokens", query }, { target })
        for (const token of list?.tokens ?? []) if (ids.has(token.id)) found.set(token.id, token)
        if (found.size === ids.size) break
        cursor = list?.next_cursor ?? null
        if (!cursor) break
    }
    return found
}

/** Separa os tokens gravados que são de outro app (puro). Token que não está na lista fica de fora (o provisionamento reemite). */
export function foreignTokensOf(stored: readonly StoredToken[], tokens: ReadonlyMap<string, Pick<EngramindToken, "app">>, app: string): StoredToken[] {
    return stored.filter((item) => {
        const token = tokens.get(item.tokenId)
        return Boolean(token && token.app?.slug && token.app.slug !== app)
    })
}

async function forget(item: StoredToken, actorId: string): Promise<void> {
    if (item.kind === "agent") {
        const { EngramindState, ENGRAMIND_STATE_ID } = await import("./models")
        await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID, [`agentTokens.${item.owner}.tokenId`]: item.tokenId }, { $unset: { [`agentTokens.${item.owner}`]: "" } })
        return
    }
    if (item.kind === "app") {
        const { EngramindState, ENGRAMIND_STATE_ID } = await import("./models")
        await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID, "appToken.tokenId": item.tokenId }, { $set: { appToken: null } })
        const { updateIntegration } = await import("@/features/integrations/services/integration-service")
        const { ENGRAMIND_INTEGRATION_ID } = await import("../constants")
        await updateIntegration(ENGRAMIND_INTEGRATION_ID, { secrets: { appToken: { action: "clear" } } }, actorId)
        return
    }
    const { RoutineAgent } = await import("@/lib/db/models/RoutineAgent")
    await RoutineAgent.updateOne({ _id: item.owner, "engramindToken.tokenId": item.tokenId }, { $set: { engramindToken: null } })
}

/** Caches derivados que apontam para memórias de outro app (nunca memórias: só o que o Opex guardou delas). */
async function purgeDerivedCaches(): Promise<void> {
    const { EngramindContextCache, EngramindDelivery, EngramindRelatedMemory } = await import("./models")
    await Promise.all([EngramindContextCache.deleteMany({}), EngramindDelivery.deleteMany({}), EngramindRelatedMemory.deleteMany({})])
}

export async function migrateForeignTokens(actorId: string, adminTarget: EngramindTarget): Promise<ForeignTokensResult> {
    const stored = await storedTokens()
    if (!stored.length) return { revoked: [], afterProvision: noop }
    const { instanceApp, resetInstanceCache } = await import("./instance")
    const app = await instanceApp()
    const tokens = await tokensById(new Set(stored.map((item) => item.tokenId)), adminTarget)
    const foreign = foreignTokensOf(stored, tokens, app)
    if (!foreign.length) return { revoked: [], afterProvision: noop }
    const revoked: string[] = []
    const routines: string[] = []
    for (const item of foreign) {
        try {
            await engramindCall("POST", { path: `/v1/tokens/${enc(item.tokenId)}/revoke`, body: {} }, { target: adminTarget })
        } catch (error) {
            if (engramindCodeOf(error) !== "TOKEN_NOT_FOUND") {
                // Sem revogar, o registro fica: a próxima conferência tenta de novo.
                engramindLog.warn({ tokenId: item.tokenId, kind: item.kind, err: error instanceof Error ? error.message : String(error) }, "[engramind] token de outro app não revogado agora")
                continue
            }
        }
        await forget(item, actorId)
        revoked.push(item.tokenId)
        if (item.kind === "routine") routines.push(item.owner)
    }
    if (!revoked.length) return { revoked, afterProvision: noop }
    await purgeDerivedCaches()
    resetInstanceCache()
    const detail = foreign.filter((item) => revoked.includes(item.tokenId)).map((item) => ({ tokenId: item.tokenId, tipo: item.kind, de: tokens.get(item.tokenId)?.app.slug ?? null, dono: item.owner }))
    await auditEngramind(actorId, "foreign-tokens", AcaoAuditoria.EXECUTAR, { passo: "foreign-tokens", app, revogados: detail })
    engramindLog.warn({ app, revoked: detail }, "[engramind] tokens de outro app revogados (migração A): o provisionamento recria no app da instância")
    return {
        revoked,
        afterProvision: async () => {
            const { startProvisioning } = await import("@/features/routine-agents/server/provisioning")
            for (const id of routines) void startProvisioning(id, "retry", actorId)
        },
    }
}
