import { APP_MEMORY_CHANNEL, routineIdentityOf } from "@/features/ai/agents"
import { OPEX_APP_SLUG } from "@/features/engramind/constants"
import { engramindCall, engramindTarget, type EngramindTarget } from "@/features/engramind/server/client"
import { engramindCodeOf } from "@/features/engramind/server/errors"
import type { EngramindChannel, EngramindSubscription, EngramindToken, IssuedToken } from "@/features/engramind/types"
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@/lib/crypto/secretBox"
import type { IRoutineAgentToken } from "@/lib/db/models/RoutineAgent"
import { ROUTINE_GLOBAL_CHANNEL, routineChannelOf } from "../constants"

/**
 * Identidade de um agente rotineiro no Engramind (OPE-130): o agente `opex/rotineiro-<slug>`, as
 * assinaturas `inject` e o token `agent` próprio (escopos `read` e `write`), guardado **cifrado no
 * documento do agente** (nunca vai para o navegador, para o modelo nem para a auditoria). Tudo é
 * idempotente: repetir não duplica agente, token, canal nem assinatura.
 */

const enc = encodeURIComponent
export const ROUTINE_TOKEN_SCOPES = ["read", "write"]
export const routineAgentRef = (slug: string) => `${OPEX_APP_SLUG}/${routineIdentityOf(slug)}`

/** Canais que todo agente rotineiro assina (nunca removidos pelo reprovisionamento). */
export const baseRoutineChannels = (slug: string) => [APP_MEMORY_CHANNEL, ROUTINE_GLOBAL_CHANNEL, routineChannelOf(slug)]

export async function ensureRoutineEngramindAgent(slug: string, name: string, description: string, target: EngramindTarget): Promise<"exists" | "created"> {
    try {
        await engramindCall("GET", { path: `/v1/agents/${enc(routineAgentRef(slug))}` }, { target })
        return "exists"
    } catch (error) {
        if (engramindCodeOf(error) !== "AGENT_NOT_FOUND") throw error
    }
    try {
        const written = await engramindCall<{ created?: boolean } | null>(
            "POST",
            { path: "/v1/agents", body: { app: OPEX_APP_SLUG, slug: routineIdentityOf(slug), name: `Rotineiro · ${name}`.slice(0, 120), description: description.slice(0, 500) } },
            { target },
        )
        return written?.created === false ? "exists" : "created"
    } catch (error) {
        if (engramindCodeOf(error) !== "SLUG_ALREADY_EXISTS") throw error
        return "exists"
    }
}

/** Assina os canais (`inject`); devolve os que foram assinados agora. */
export async function ensureRoutineSubscriptions(slug: string, channels: readonly string[], target: EngramindTarget): Promise<string[]> {
    const list = await engramindCall<{ subscriptions: EngramindSubscription[] }>("GET", { path: "/v1/subscriptions", query: { agent: routineAgentRef(slug), limit: 200 } }, { target })
    const present = new Set((list?.subscriptions ?? []).map((item) => item.target))
    const created: string[] = []
    for (const channel of [...new Set(channels)]) {
        if (present.has(channel)) continue
        try {
            const written = await engramindCall<{ created?: boolean } | null>("POST", { path: "/v1/subscriptions", body: { agent: routineAgentRef(slug), target: channel, mode: "inject" } }, { target })
            if (written?.created !== false) created.push(channel)
        } catch (error) {
            if (engramindCodeOf(error) !== "SUBSCRIPTION_EXISTS") throw error
        }
    }
    return created
}

/**
 * Cancela a assinatura **exata** do agente no canal (OPE-143): só a assinatura vai; o canal, as memórias e os
 * outros assinantes ficam. Assinatura por prefixo (`x/*`) não é tocada. Devolve `absent` quando não há
 * assinatura (já cancelada à mão), o que torna a operação idempotente. Falha do Engramind sobe.
 */
export async function removeRoutineSubscription(slug: string, channel: string, target: EngramindTarget): Promise<"removed" | "absent"> {
    const list = await engramindCall<{ subscriptions: EngramindSubscription[] }>("GET", { path: "/v1/subscriptions", query: { agent: routineAgentRef(slug), limit: 200 } }, { target })
    const found = (list?.subscriptions ?? []).filter((item) => item.target === channel && !item.is_prefix)
    if (!found.length) return "absent"
    for (const item of found) await engramindCall("DELETE", { path: `/v1/subscriptions/${enc(item.id)}` }, { target })
    return "removed"
}

export function decryptRoutineToken(stored: IRoutineAgentToken | null | undefined): string | null {
    if (!stored || !isEncryptedSecret(stored.secret)) return null
    try {
        return decryptSecret(stored.secret)
    } catch {
        return null
    }
}

async function findToken(slug: string, tokenId: string, target: EngramindTarget): Promise<EngramindToken | null> {
    let cursor: string | null = null
    for (let page = 0; page < 10; page++) {
        const query: Record<string, string | number> = { agent: routineAgentRef(slug), limit: 200 }
        if (cursor) query.cursor = cursor
        const list: { tokens?: EngramindToken[]; next_cursor?: string | null } | null = await engramindCall("GET", { path: "/v1/tokens", query }, { target })
        const found = (list?.tokens ?? []).find((token) => token.id === tokenId)
        if (found) return found
        cursor = list?.next_cursor ?? null
        if (!cursor) return null
    }
    return null
}

/**
 * Token válido do agente: reaproveita o gravado se estiver ativo e com os escopos esperados; senão emite
 * outro (e revoga o anterior). Devolve o registro a gravar (ou o atual) e se emitiu.
 */
export async function ensureRoutineToken(slug: string, stored: IRoutineAgentToken | null, target: EngramindTarget): Promise<{ token: IRoutineAgentToken; issued: boolean }> {
    if (stored && decryptRoutineToken(stored)) {
        const current = await findToken(slug, stored.tokenId, target)
        const scopesOk = Array.isArray(current?.scopes) && current!.scopes.length === ROUTINE_TOKEN_SCOPES.length && ROUTINE_TOKEN_SCOPES.every((scope) => current!.scopes.includes(scope))
        if (current && current.status === "active" && scopesOk) return { token: stored, issued: false }
    }
    const issued = await engramindCall<IssuedToken>("POST", { path: "/v1/tokens", body: { kind: "agent", agent: routineAgentRef(slug), scopes: ROUTINE_TOKEN_SCOPES, label: `Opex · rotineiro (${slug})` } }, { target })
    if (!issued.secret) throw new Error("o Engramind não devolveu o segredo do token")
    if (stored && stored.tokenId !== issued.token.id) await engramindCall("POST", { path: `/v1/tokens/${enc(stored.tokenId)}/revoke`, body: {} }, { target }).catch(() => undefined)
    return { token: { tokenId: issued.token.id, prefix: issued.token.prefix, secret: encryptSecret(issued.secret), issuedAt: new Date() }, issued: true }
}

export interface ChannelSummary {
    slug: string
    name: string
    description: string | null
}

/** Canais ativos do Engramind (para o subagente escolher os extras). */
export async function listEngramindChannels(target: EngramindTarget): Promise<ChannelSummary[]> {
    const rows: ChannelSummary[] = []
    let cursor: string | null = null
    for (let page = 0; page < 10; page++) {
        const query: Record<string, string | number> = { limit: 200 }
        if (cursor) query.cursor = cursor
        const result: { channels?: EngramindChannel[]; next_cursor?: string | null } | null = await engramindCall("GET", { path: "/v1/channels", query }, { target })
        for (const channel of result?.channels ?? []) if (!channel.archived_at) rows.push({ slug: channel.slug, name: channel.name, description: channel.description ?? null })
        cursor = result?.next_cursor ?? null
        if (!cursor) break
    }
    return rows
}

/** Separa os canais assinados entre ativos e arquivados (ou sumidos) no Engramind, na ordem recebida. */
export async function activeRoutineChannels(channels: readonly string[], target: EngramindTarget): Promise<{ active: string[]; archived: string[] }> {
    const live = new Set((await listEngramindChannels(target)).map((channel) => channel.slug))
    return { active: channels.filter((channel) => live.has(channel)), archived: channels.filter((channel) => !live.has(channel)) }
}

/** Alvo com o token do agente rotineiro (mesma URL base da integração); `null` sem token legível. */
export async function routineAgentTarget(stored: IRoutineAgentToken | null | undefined): Promise<EngramindTarget | null> {
    const token = decryptRoutineToken(stored)
    if (!token) return null
    const base = await engramindTarget()
    return { baseUrl: base.baseUrl, token }
}

/**
 * Canais da memória de um turno (execução ou conversa, OPE-160): os assinados (`opex`, o global, o
 * próprio e os extras do provisionamento) menos os arquivados no Engramind (D13), e a lista em que as
 * ferramentas de memória leem e gravam, com o próprio primeiro. Sem conseguir conferir os arquivados,
 * segue com os assinados (o Engramind continua recusando escrita em canal arquivado).
 */
export async function routineMemoryChannels(
    agent: { slug: string; provisioning?: { extras?: readonly { channel: string }[] } | null },
    target: EngramindTarget,
    warn: (message: string) => void,
    onCheckFailed: (error: unknown) => void,
): Promise<{ channels: string[]; memoryChannels: string[] }> {
    const subscribed = [...baseRoutineChannels(agent.slug), ...(agent.provisioning?.extras ?? []).map((item) => item.channel)]
    const channels = await activeRoutineChannels(subscribed, target).then(
        ({ active, archived }) => {
            if (archived.length) warn(`Canal arquivado no Engramind, fora desta execução: ${archived.join(", ")}. Restaure-o na rede ou use "Reprovisionar".`)
            return active
        },
        (error: unknown) => {
            onCheckFailed(error)
            return subscribed
        },
    )
    const own = routineChannelOf(agent.slug)
    return { channels, memoryChannels: [own, ...channels.filter((channel) => channel !== own)] }
}
