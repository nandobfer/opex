import { AI_AGENTS, MEMORY_IDENTITIES, memoryChannelName, MEMORY_IDENTITY_DEFS, MEMORY_SUBSCRIPTION_TARGETS, MEMORY_TOKEN_SCOPES, fixedMemoryChannels, type MemoryIdentity } from "@/features/ai/agents"
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@/lib/crypto/secretBox"
import { OPEX_APP_SLUG } from "../constants"
import type { BootstrapStepDto, EngramindAgent, EngramindChannel, EngramindSubscription, EngramindToken, IssuedToken } from "../types"
import { engramindCall, engramindTarget, type EngramindTarget } from "./client"
import { engramindCodeOf } from "./errors"
import { ENGRAMIND_STATE_ID, EngramindState, engramindDb, type IEngramindAgentToken } from "./models"
import { AcaoAuditoria, auditEngramind, engramindLog } from "./shared"

/**
 * Rede das memórias dos agentes no Engramind (OPE-104): passo "Memórias dos agentes" do bootstrap,
 * idempotente — cria só o que falta:
 * - os canais fixos (`opex` e `agentes/...`, um por lista sem escopo; os das centrais existentes);
 * - um agente por identidade no app `opex` (`opex`, `maddox`, `adversario`, `desenvolvedor` e `mentor`,
 *   que só escreve e não tem canal próprio);
 * - as assinaturas `inject` de cada agente (`MEMORY_SUBSCRIPTION_TARGETS`: o token de agente só
 *   escreve onde assina);
 * - um token `agent` por identidade com `MEMORY_TOKEN_SCOPES` (`read+write+delete`; o Mentor
 *   `read+write`), guardado cifrado em `engramind_state.agentTokens` e nunca exibido (reemitido quando
 *   falta, foi revogado, expirou ou tem escopos diferentes dos esperados).
 * Canais de central e de cliente também nascem sob demanda (`ensureMemoryChannel`).
 */

const enc = encodeURIComponent
const agentRef = (consumer: MemoryIdentity) => `${OPEX_APP_SLUG}/${consumer}`
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export interface MemoryNetworkSummary {
    channelsCreated: string[]
    channelsRestored: string[]
    agentsCreated: string[]
    subscriptionsCreated: string[]
    tokensIssued: string[]
    warnings: string[]
}

/** Garante um canal (cria; restaura o arquivado). Devolve o que foi feito. */
export async function ensureMemoryChannel(slug: string, name: string, description: string | null, target?: EngramindTarget): Promise<"exists" | "created" | "restored"> {
    const options = target ? { target } : {}
    let channel: EngramindChannel | null = null
    try {
        channel = await engramindCall<EngramindChannel>("GET", { path: `/v1/channels/${enc(slug)}` }, options)
    } catch (error) {
        if (engramindCodeOf(error) !== "CHANNEL_NOT_FOUND") throw error
    }
    if (!channel) {
        try {
            await engramindCall("POST", { path: "/v1/channels", body: { slug, name: name.slice(0, 120), description } }, options)
            return "created"
        } catch (error) {
            if (engramindCodeOf(error) !== "SLUG_ALREADY_EXISTS") throw error
            return "exists"
        }
    }
    if (channel.archived_at) {
        await engramindCall("POST", { path: `/v1/channels/${enc(slug)}/restore`, body: {} }, options)
        return "restored"
    }
    return "exists"
}

/** Arquiva um canal (central excluída): o canal e as memórias continuam recuperáveis. Inexistente → `false`. */
export async function archiveMemoryChannel(slug: string): Promise<boolean> {
    try {
        await engramindCall("POST", { path: `/v1/channels/${enc(slug)}/archive`, body: {} })
        return true
    } catch (error) {
        if (engramindCodeOf(error) === "CHANNEL_NOT_FOUND") return false
        throw error
    }
}

async function ensureAgent(consumer: MemoryIdentity, target: EngramindTarget): Promise<"exists" | "created"> {
    try {
        const agent = await engramindCall<EngramindAgent>("GET", { path: `/v1/agents/${enc(agentRef(consumer))}` }, { target })
        if (agent.disabled_at) engramindLog.warn({ agent: agentRef(consumer) }, "[engramind] agente de memórias desativado no Engramind: os tokens dele não autenticam")
        return "exists"
    } catch (error) {
        if (engramindCodeOf(error) !== "AGENT_NOT_FOUND") throw error
    }
    const def = MEMORY_IDENTITY_DEFS[consumer]
    try {
        await engramindCall("POST", { path: "/v1/agents", body: { app: OPEX_APP_SLUG, slug: consumer, name: def.name, description: def.description } }, { target })
        return "created"
    } catch (error) {
        if (engramindCodeOf(error) !== "SLUG_ALREADY_EXISTS") throw error
        return "exists"
    }
}

async function ensureSubscriptions(consumer: MemoryIdentity, target: EngramindTarget): Promise<string[]> {
    const list = await engramindCall<{ subscriptions: EngramindSubscription[] }>("GET", { path: "/v1/subscriptions", query: { agent: agentRef(consumer), limit: 200 } }, { target })
    const present = new Set((list?.subscriptions ?? []).map((item) => item.target))
    const created: string[] = []
    for (const subscriptionTarget of MEMORY_SUBSCRIPTION_TARGETS[consumer]) {
        if (present.has(subscriptionTarget)) continue
        try {
            await engramindCall("POST", { path: "/v1/subscriptions", body: { agent: agentRef(consumer), target: subscriptionTarget, mode: "inject" } }, { target })
            created.push(`${consumer} → ${subscriptionTarget}`)
        } catch (error) {
            if (engramindCodeOf(error) !== "SUBSCRIPTION_EXISTS") throw error
        }
    }
    return created
}

async function loadAgentTokens(): Promise<Partial<Record<MemoryIdentity, IEngramindAgentToken>>> {
    await engramindDb()
    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ agentTokens: 1 }).lean()
    return state?.agentTokens ?? {}
}

function decryptToken(stored: IEngramindAgentToken | undefined): string | null {
    if (!stored || !isEncryptedSecret(stored.secret)) return null
    try {
        return decryptSecret(stored.secret)
    } catch {
        return null
    }
}

const sameScopes = (current: readonly string[] | undefined, expected: readonly string[]) =>
    Array.isArray(current) && current.length === expected.length && expected.every((scope) => current.includes(scope))

/** Páginas da listagem de tokens percorridas (cada reemissão deixa um revogado na lista do agente). */
const TOKEN_LIST_MAX_PAGES = 10

/**
 * Token gravado do agente, achado pela listagem `GET /v1/tokens?agent=opex/<identidade>` (o contrato
 * do Engramind não lê token por id). `null` = não está na lista (excluído, ou além das páginas lidas).
 */
async function findAgentToken(consumer: MemoryIdentity, tokenId: string, target: EngramindTarget): Promise<EngramindToken | null> {
    let cursor: string | null = null
    for (let page = 0; page < TOKEN_LIST_MAX_PAGES; page++) {
        const query: Record<string, string | number> = { agent: agentRef(consumer), limit: 200 }
        if (cursor) query.cursor = cursor
        const list: { tokens?: EngramindToken[]; next_cursor?: string | null } | null = await engramindCall("GET", { path: "/v1/tokens", query }, { target })
        const found = (list?.tokens ?? []).find((token) => token.id === tokenId)
        if (found) return found
        cursor = list?.next_cursor ?? null
        if (!cursor) return null
    }
    return null
}

/** Token válido do agente (reemite quando falta, não decifra, foi revogado, expirou ou tem outros escopos). Devolve se emitiu. */
async function ensureToken(consumer: MemoryIdentity, target: EngramindTarget, actorId: string): Promise<boolean> {
    const stored = (await loadAgentTokens())[consumer]
    const secret = decryptToken(stored)
    if (stored && secret) {
        const token = await findAgentToken(consumer, stored.tokenId, target)
        // Ativo e com os escopos esperados: nada a fazer; fora da lista, expirado, revogado ou com escopos
        // diferentes reemite (e revoga o anterior).
        if (token && token.status === "active" && sameScopes(token.scopes, MEMORY_TOKEN_SCOPES[consumer])) return false
    }
    const issued = await engramindCall<IssuedToken>("POST", { path: "/v1/tokens", body: { kind: "agent", agent: agentRef(consumer), scopes: MEMORY_TOKEN_SCOPES[consumer], label: `Opex · memórias (${consumer})` } }, { target })
    if (!issued.secret) throw new Error("o Engramind não devolveu o segredo do token")
    const record: IEngramindAgentToken = { tokenId: issued.token.id, prefix: issued.token.prefix, secret: encryptSecret(issued.secret), issuedAt: new Date() }
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { [`agentTokens.${consumer}`]: record } }, { upsert: true })
    // O anterior (sem segredo legível, por exemplo) deixa de valer.
    if (stored && stored.tokenId !== issued.token.id) await engramindCall("POST", { path: `/v1/tokens/${enc(stored.tokenId)}/revoke`, body: {} }, { target }).catch(() => undefined)
    await auditEngramind(actorId, "bootstrap", AcaoAuditoria.EXECUTAR, { passo: "agent-memories", agente: consumer, tokenPrefix: issued.token.prefix })
    return true
}

/** Canais das centrais existentes (import dinâmico: o módulo do agêntico é pesado). */
async function centralChannels(): Promise<{ slug: string; name: string }[]> {
    const { AgenticCentral } = await import("@/lib/db/models/Agentic")
    const centrals = await AgenticCentral.find({}).select({ _id: 1, projectName: 1 }).lean()
    return centrals.map((central) => ({ slug: `${AI_AGENTS["developer-central"].channel}/${String(central._id)}`, name: memoryChannelName("developer-central", central.projectName ?? String(central._id)) }))
}

let inFlight: Promise<{ step: BootstrapStepDto; summary: MemoryNetworkSummary }> | null = null

/** Passo "Memórias dos agentes" (bootstrap, aba de migração, provisionamento sob demanda). Nunca lança. */
export function ensureAgentMemoryNetwork(actorId: string, target?: EngramindTarget): Promise<{ step: BootstrapStepDto; summary: MemoryNetworkSummary }> {
    inFlight ??= runNetwork(actorId, target).finally(() => {
        inFlight = null
    })
    return inFlight
}

async function runNetwork(actorId: string, explicit?: EngramindTarget): Promise<{ step: BootstrapStepDto; summary: MemoryNetworkSummary }> {
    const summary: MemoryNetworkSummary = { channelsCreated: [], channelsRestored: [], agentsCreated: [], subscriptionsCreated: [], tokensIssued: [], warnings: [] }
    try {
        const target = explicit ?? (await engramindTarget())
        const channels = [
            ...fixedMemoryChannels().map((item) => ({ slug: item.slug, name: memoryChannelName(item.agentId), description: AI_AGENTS[item.agentId].description })),
            ...(await centralChannels()).map((item) => ({ ...item, description: AI_AGENTS["developer-central"].description })),
        ]
        for (const channel of channels) {
            const outcome = await ensureMemoryChannel(channel.slug, channel.name, channel.description, target)
            if (outcome === "created") summary.channelsCreated.push(channel.slug)
            if (outcome === "restored") summary.channelsRestored.push(channel.slug)
        }
        for (const consumer of MEMORY_IDENTITIES) {
            if ((await ensureAgent(consumer, target)) === "created") summary.agentsCreated.push(consumer)
            summary.subscriptionsCreated.push(...(await ensureSubscriptions(consumer, target)))
            if (await ensureToken(consumer, target, actorId)) summary.tokensIssued.push(consumer)
        }
        const changed = summary.channelsCreated.length + summary.channelsRestored.length + summary.agentsCreated.length + summary.subscriptionsCreated.length + summary.tokensIssued.length
        if (changed) {
            await auditEngramind(actorId, "bootstrap", AcaoAuditoria.EXECUTAR, {
                passo: "agent-memories",
                canais: summary.channelsCreated,
                restaurados: summary.channelsRestored,
                agentes: summary.agentsCreated,
                assinaturas: summary.subscriptionsCreated,
                tokens: summary.tokensIssued,
            })
        }
        engramindLog.info({ ...summary }, "[engramind] memórias dos agentes conferidas")
        const message = changed
            ? `Memórias dos agentes: ${summary.channelsCreated.length} canal(is) criado(s), ${summary.channelsRestored.length} restaurado(s), ${summary.agentsCreated.length} agente(s), ${summary.subscriptionsCreated.length} assinatura(s) e ${summary.tokensIssued.length} token(s)`
            : "Memórias dos agentes: canais, agentes, tokens e assinaturas já estavam prontos"
        return { step: { id: "agent-memories", status: changed ? "ok" : "skipped", message }, summary }
    } catch (error) {
        engramindLog.warn({ err: messageOf(error) }, "[engramind] não foi possível conferir as memórias dos agentes")
        summary.warnings.push(messageOf(error))
        return { step: { id: "agent-memories", status: "failed", message: `Memórias dos agentes: ${messageOf(error)}` }, summary }
    }
}

const LAZY_RETRY_MS = 5 * 60_000
let lastLazyAttempt = 0

/** Quanto o turno espera o provisionamento sob demanda antes de seguir sem o token. */
const LAZY_WAIT_MS = 3_000
let lazyWaitMs = LAZY_WAIT_MS

/**
 * Segredo do token do agente (`null` sem token). Sem token gravado, dispara o provisionamento uma vez a
 * cada 5 minutos (a conexão já configurada antes da OPE-104 não passa pelo bootstrap de novo) e espera
 * no máximo `LAZY_WAIT_MS`: com o Engramind lento, o turno segue sem o token (cache ou sem memórias) e o
 * provisionamento termina em segundo plano, valendo a partir do próximo turno.
 */
export async function agentTokenFor(consumer: MemoryIdentity): Promise<string | null> {
    const current = decryptToken((await loadAgentTokens())[consumer])
    if (current) return current
    if (Date.now() - lastLazyAttempt < LAZY_RETRY_MS) return null
    lastLazyAttempt = Date.now()
    const network = ensureAgentMemoryNetwork("local")
    let timer: ReturnType<typeof setTimeout> | undefined
    const waited = await Promise.race([network.then(() => true), new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), lazyWaitMs)))])
    clearTimeout(timer)
    if (!waited) {
        engramindLog.info({ consumer, waitMs: lazyWaitMs }, "[engramind] provisionamento das memórias ainda em andamento: o turno segue sem o token do agente")
        return null
    }
    return decryptToken((await loadAgentTokens())[consumer])
}

/** Alvo com o token do agente (mesma URL base da integração); `null` sem token. */
export async function agentTarget(consumer: MemoryIdentity): Promise<EngramindTarget | null> {
    const base = await engramindTarget()
    const token = await agentTokenFor(consumer)
    return token ? { baseUrl: base.baseUrl, token } : null
}

/** Prefixos dos tokens dos agentes (aba Identidades marca "Memórias do Opex"). */
export async function agentTokenPrefixes(): Promise<string[]> {
    return Object.values(await loadAgentTokens())
        .map((item) => item?.prefix)
        .filter((value): value is string => Boolean(value))
}

/** Testes: zera o throttle do provisionamento sob demanda. */
export function resetMemoryNetworkForTests(options: { lazyWaitMs?: number } = {}): void {
    lastLazyAttempt = 0
    inFlight = null
    lazyWaitMs = options.lazyWaitMs ?? LAZY_WAIT_MS
}
