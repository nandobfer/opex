import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { publishAppEvent } from "@/lib/pusher/channels"
import { MENTOR_REORG_ACTIVE_STATUSES, MENTOR_REORG_AUDIT_ENTITY, MENTOR_REORG_UPDATED_EVENT } from "../../mentor/constants"
import type { MentorReorgScopeInput, MentorSettings } from "../../mentor/schemas"
import type { MentorReorgDto } from "../../mentor/types"
import { MentorReorg, reorgDb } from "./reorg-models"
import { getMentorReorg, processMentorReorg, resolveReorgScope } from "./reorganize"
import { log } from "./steps"

/**
 * Fila da reorganização do acervo do Mentor: uma por vez, em segundo plano (a aba continua
 * respondendo). O estado vive na memória do processo; uma execução que estava rodando quando o app
 * reiniciou vira `failed` no primeiro uso.
 */

interface ReorgQueueState {
    chain: Promise<unknown> | null
    current: { id: string; controller: AbortController } | null
    startedAt: Date
    recovered: Promise<void> | null
}

const globalForReorg = globalThis as typeof globalThis & { __opexMentorReorg?: ReorgQueueState }
const state = (globalForReorg.__opexMentorReorg ??= { chain: null, current: null, startedAt: new Date(), recovered: null })

/** Execuções órfãs (de antes deste processo) viram `failed`. Uma vez por processo. */
export function recoverOrphanMentorReorgs(): Promise<void> {
    state.recovered ??= (async () => {
        await reorgDb()
        const result = await MentorReorg.updateMany(
            { status: { $in: MENTOR_REORG_ACTIVE_STATUSES }, createdAt: { $lt: state.startedAt } },
            { $set: { status: "failed", error: "Reorganização interrompida: o app reiniciou antes de terminar", finishedAt: new Date() } },
        )
        if (result.modifiedCount) {
            log.warn({ count: result.modifiedCount }, "[adversarial-agent] Reorganizações do Mentor interrompidas pelo reinício")
            await publishAppEvent(MENTOR_REORG_UPDATED_EVENT, {}).catch(() => undefined)
        }
    })().catch((error: unknown) => {
        state.recovered = null
        log.warn({ err: error }, "[adversarial-agent] Não foi possível recuperar as reorganizações do Agente Mentor")
    })
    return state.recovered
}

/** Registra e inicia a revisão do acervo no recorte pedido (409 com outra em andamento). */
export async function startMentorReorg(input: MentorReorgScopeInput, settings: MentorSettings, actorId: string): Promise<MentorReorgDto> {
    await recoverOrphanMentorReorgs()
    if (state.chain) throw new DomainError(409, "Já existe uma reorganização em andamento: aguarde terminar ou cancele.", "MENTOR_REORG_RUNNING")
    const scope = await resolveReorgScope(input, settings)
    if (scope.lists.length > 1 && (!settings.router.provider || !settings.router.model)) {
        throw new DomainError(400, "Configure o provedor e o modelo do Triador para revisar mais de uma lista", "MENTOR_REORG_ROUTER_MISSING")
    }
    if (!settings.writer.provider || !settings.writer.model) throw new DomainError(400, "Configure o provedor e o modelo do redator para revisar o acervo", "MENTOR_REORG_WRITER_MISSING")
    const created = await MentorReorg.create({ status: "queued", targets: scope.targets, centralIds: scope.centralIds, total: 0, done: 0, costUsd: 0, durationMs: null, error: null, startedAt: null, finishedAt: null })
    const id = String(created._id)
    const controller = new AbortController()
    state.current = { id, controller }
    const next = processMentorReorg(id, scope, settings, controller.signal).finally(() => {
        if (state.chain === next) state.chain = null
        if (state.current?.id === id) state.current = null
    })
    state.chain = next
    await recordAudit({ userId: actorId, entidade: MENTOR_REORG_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXECUTAR, depois: { status: "queued", listas: scope.targets, centrais: scope.centralIds } })
    await publishAppEvent(MENTOR_REORG_UPDATED_EVENT, { reorgId: id }).catch(() => undefined)
    return getMentorReorg(id)
}

/** Cancela a revisão em andamento: o que já foi revisado fica visível, sem aprovação. */
export async function cancelMentorReorg(id: string): Promise<MentorReorgDto> {
    await recoverOrphanMentorReorgs()
    await reorgDb()
    const run = await MentorReorg.findById(id).lean()
    if (!run) throw new DomainError(404, "Reorganização não encontrada", "MENTOR_REORG_NOT_FOUND")
    if (!("queued" === run.status || "running" === run.status)) throw new DomainError(409, "Esta reorganização não está em andamento", "MENTOR_REORG_NOT_RUNNING")
    if (state.current?.id === id) state.current.controller.abort()
    else await MentorReorg.updateOne({ _id: id }, { $set: { status: "cancelled", finishedAt: new Date() } })
    await publishAppEvent(MENTOR_REORG_UPDATED_EVENT, { reorgId: id }).catch(() => undefined)
    return getMentorReorg(id)
}

/** Para os testes: espera a reorganização enfileirada terminar. */
export function mentorReorgChain(): Promise<unknown> {
    return state.chain ?? Promise.resolve()
}
