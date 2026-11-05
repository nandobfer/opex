import { z } from "zod"
import { DomainError } from "@/lib/api/route"
import { recordAudit, AcaoAuditoria } from "@/lib/audit/record"
import { integrationChannel, publishToChannels } from "@/lib/pusher/channels"
import { engramindCall, type EngramindTarget } from "@/features/engramind/server/client"
import { engramindCodeOf } from "@/features/engramind/server/errors"
import type { EngramindMemory, MemoryWrite } from "@/features/engramind/types"
import { AI_MEMORIES_UPDATED_EVENT, AI_MEMORY_AUDIT_ENTITY } from "@/features/ai/constants"
import { routineLog } from "./shared"

/**
 * Memória do agente rotineiro em qualquer canal que ele assina (OPE-130, D13–D15): gravação por
 * **chave** (upsert do Engramind: uma entrada por item, sem duplicar a cada execução), edição por id e
 * listagem paginada com o texto inteiro. Sempre com o **token do próprio agente**; o canal é conferido
 * antes contra a lista de permissão (`allowed`: assinados e não arquivados). Token do agente recusado
 * (`AUTH_INVALID`, pelo código) → repete com a credencial de gestor restrita ao mesmo canal, com aviso;
 * escrita negada no canal e erros de outro tipo sobem.
 */

/** Chave da memória no canal (regra do Engramind). */
export const memoryKeySchema = z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9:_-]+$/, "Chave inválida: use só letras, números, \":\", \"_\" e \"-\" (até 80)")
export const memoryTitleSchema = z.string().trim().min(3).max(200)
export const memoryTagsSchema = z.array(z.string().trim().min(1).max(40)).max(20)

export interface RoutineMemoryEnv {
    slug: string
    label: string
    runId: string
    target: EngramindTarget
    /** Canais assinados e não arquivados (o primeiro é o próprio do agente). */
    allowed: readonly string[]
    /** Aviso que vai para a execução (passo/log) quando a credencial do agente é recusada. */
    warn?: (message: string) => void
}

export interface RoutineMemoryView {
    id: string
    canal: string
    chave: string | null
    titulo: string | null
    texto?: string
    categoria: string
    versao: number
    tags: string[]
    fixada: boolean
    doDono: boolean
    atualizadaEm: string
}

const OWNER_SOURCES = new Set(["owner", "dono"])

export function assertAllowedChannel(env: Pick<RoutineMemoryEnv, "allowed">, channel: string): string {
    if (env.allowed.includes(channel)) return channel
    throw new DomainError(400, `O agente não assina o canal "${channel}" (ou ele está arquivado). Canais disponíveis: ${env.allowed.join(", ")}`, "ROUTINE_CHANNEL_NOT_ALLOWED", { valid: [...env.allowed] })
}

export function toRoutineMemoryView(memory: EngramindMemory, full: boolean): RoutineMemoryView {
    return {
        id: memory.id,
        canal: memory.channel,
        chave: memory.key ?? null,
        titulo: memory.title ?? null,
        ...(full ? { texto: memory.text } : {}),
        categoria: memory.category,
        versao: memory.version,
        tags: memory.tags ?? [],
        fixada: memory.status === "permanent",
        doDono: Boolean(memory.origin?.source && OWNER_SOURCES.has(memory.origin.source)),
        atualizadaEm: memory.updated_at,
    }
}

/** Chamada com o token do agente; só `AUTH_INVALID` (token recusado) repete com a credencial de gestor. */
async function call<T>(env: RoutineMemoryEnv, method: "GET" | "POST" | "PATCH", request: { path: string; query?: Record<string, string | number | undefined>; body?: unknown }): Promise<T> {
    try {
        return await engramindCall<T>(method, request, { target: env.target })
    } catch (error) {
        const code = engramindCodeOf(error)
        if (code === "CHANNEL_NOT_SUBSCRIBED" || code === "SCOPE_REQUIRED") throw new DomainError(403, "O agente não tem escrita (ou leitura) neste canal: use \"Reprovisionar\" na configuração do agente ou escolha outro canal.", "ROUTINE_CHANNEL_FORBIDDEN")
        if (code === "MEMORY_VERSION_CONFLICT") throw new DomainError(409, "A memória mudou desde a última leitura: releia com list_my_memories e tente de novo com a versão atual.", "MEMORY_VERSION_CONFLICT")
        if (code === "CHANNEL_ARCHIVED") throw new DomainError(409, "O canal está arquivado e não recebe escrita: escolha outro canal.", "CHANNEL_ARCHIVED")
        if (code === "MEMORY_DUPLICATE") throw new DomainError(409, "Já existe uma memória com o mesmo texto neste canal: atualize aquela em vez de criar outra.", "MEMORY_DUPLICATE")
        if (code !== "AUTH_INVALID") throw error
        const message = "O Engramind recusou o token do agente rotineiro: a operação usou a credencial do Opex, restrita ao mesmo canal. Use \"Reprovisionar\" para emitir outro token."
        routineLog.warn({ slug: env.slug, runId: env.runId, method, path: request.path }, `[routine-agents] ${message}`)
        env.warn?.(message)
        return engramindCall<T>(method, request)
    }
}

async function audit(env: RoutineMemoryEnv, memory: EngramindMemory, acao: (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria], extra: Record<string, unknown>) {
    await recordAudit({
        userId: "local",
        entidade: AI_MEMORY_AUDIT_ENTITY,
        entidadeId: memory.id,
        acao,
        depois: { canal: memory.channel, ...(memory.key ? { chave: memory.key } : {}), rotineiro: env.slug, ator: "agente:rotineiro", execucao: env.runId, ...extra },
    }).catch((error: unknown) => routineLog.warn({ err: error, memoryId: memory.id }, "[routine-agents] auditoria da memória falhou"))
    await publishToChannels([integrationChannel("ai")], AI_MEMORIES_UPDATED_EVENT, { agentId: "routine", routineSlug: env.slug }).catch(() => undefined)
}

export interface RememberInput {
    canal: string
    texto: string
    chave?: string
    titulo?: string
    tags?: string[]
    categoria?: string
}

export async function rememberInChannel(env: RoutineMemoryEnv, input: RememberInput) {
    const channel = assertAllowedChannel(env, input.canal)
    const { parseText, resolveCategory } = await import("@/features/ai/server/agent-memory-service")
    const text = await parseText(input.texto, channel)
    const category = await resolveCategory(input.categoria ?? null)
    const body = {
        channel,
        text,
        ...(category ? { category } : {}),
        origin: { source: "rotineiro", label: env.label },
        ...(input.chave ? { key: input.chave, upsert: true } : {}),
        ...(input.titulo ? { title: input.titulo } : {}),
        ...(input.tags ? { tags: input.tags } : {}),
    }
    const result = await call<MemoryWrite>(env, "POST", { path: "/v1/memories", body })
    const similares = (result.similar ?? []).filter((item) => item.id !== result.memory.id).map((item) => ({ id: item.id, resumo: item.title ?? "", similaridade: item.score ?? 0 }))
    // Com chave, `created: false` = a entrada da chave foi atualizada (nenhuma nova).
    const criada = result.duplicate ? false : result.created !== false
    if (!result.duplicate) await audit(env, result.memory, criada ? AcaoAuditoria.CRIAR : AcaoAuditoria.ATUALIZAR, { versao: result.memory.version })
    return { id: result.memory.id, canal: channel, chave: result.memory.key ?? input.chave ?? null, criada, atualizada: Boolean(input.chave) && !criada && !result.duplicate, duplicada: result.duplicate, versao: result.memory.version, similares }
}

export interface UpdateInput {
    id: string
    texto?: string
    titulo?: string
    categoria?: string
    tags?: string[]
    versao?: number
}

export async function updateInChannel(env: RoutineMemoryEnv, input: UpdateInput) {
    const path = `/v1/memories/${encodeURIComponent(input.id)}`
    const current = await call<EngramindMemory>(env, "GET", { path })
    assertAllowedChannel(env, current.channel)
    const body: Record<string, unknown> = {}
    if (input.texto !== undefined) {
        const { parseText } = await import("@/features/ai/server/agent-memory-service")
        body.text = await parseText(input.texto, current.channel)
    }
    if (input.categoria !== undefined) {
        const { resolveCategory } = await import("@/features/ai/server/agent-memory-service")
        body.category = await resolveCategory(input.categoria)
    }
    if (input.titulo !== undefined) body.title = input.titulo
    if (input.tags !== undefined) body.tags = input.tags
    if (!Object.keys(body).length) throw new DomainError(400, "Informe o que mudar: texto, título, categoria ou tags.", "ROUTINE_MEMORY_NOTHING_TO_UPDATE")
    body.expected_version = input.versao ?? current.version
    body.origin = { source: "rotineiro", label: env.label }
    const written = await call<MemoryWrite | EngramindMemory>(env, "PATCH", { path, body })
    const memory = "memory" in written ? written.memory : written
    await audit(env, memory, AcaoAuditoria.ATUALIZAR, { versao: memory.version })
    const similar = "similar" in written ? (written.similar ?? []) : []
    return { id: memory.id, canal: memory.channel, versao: memory.version, similares: similar.filter((item) => item.id !== memory.id).map((item) => ({ id: item.id, resumo: item.title ?? "", similaridade: item.score ?? 0 })) }
}

export interface ListInput {
    canal: string
    chave?: string
    formato: "completo" | "titulos"
    cursor?: string
    limite: number
}

export async function listInChannel(env: RoutineMemoryEnv, input: ListInput) {
    const channel = assertAllowedChannel(env, input.canal)
    const full = input.formato === "completo"
    const page = await call<{ memories: EngramindMemory[]; next_cursor: string | null }>(env, "GET", {
        path: "/v1/memories",
        query: { channels: channel, limit: input.limite, ...(input.chave ? { key: input.chave } : {}), ...(input.cursor ? { cursor: input.cursor } : {}), ...(full ? {} : { fields: "title" }) },
    })
    const memorias = (page.memories ?? []).filter((memory) => memory.channel === channel).map((memory) => toRoutineMemoryView(memory, full))
    const next = page.next_cursor ?? null
    return {
        canal: channel,
        memorias,
        proximoCursor: next,
        parcial: next !== null,
        ...(next !== null ? { aviso: "Há mais memórias neste canal: chame de novo com cursor = proximoCursor antes de concluir que algo não existe." } : {}),
    }
}
