import { z } from "zod"
import { MENTOR_SKIP_KINDS, type MentorOperation, type MentorSkipKind } from "./constants"
import { checkWriterSkip, writerJson } from "./decision"

/**
 * Operações do redator do Agente Mentor (OPE-165, módulo puro). Para cada caso o redator recebe a lista
 * de destino (escolhida pelo Triador) com id, versão e marca do dono, e responde com as operações nela:
 * criar, atualizar, fundir (a absorvida é arquivada) e arquivar. Nunca excluir. Memória do dono: pode ser
 * atualizada e receber uma fusão; nunca arquivada nem absorvida.
 */

/** Memória da lista de destino como o redator a vê. */
export interface WriterMemory {
    id: string
    summary: string
    text: string
    version: number
    owner: boolean
}

/**
 * Operações por caso: proteção folgada contra resposta descontrolada (não é limite de memórias; o digestor
 * separa as lições em casos). Passar dele não descarta em silêncio: volta ao redator com o motivo.
 */
export const MENTOR_WRITER_MAX_OPERATIONS = 40

const reason = z.string().trim().max(2000).optional().default("")
const text = z.string().trim().min(3)
const id = z.string().trim().min(1)

const operationSchema = z.discriminatedUnion("op", [
    z.object({ op: z.literal("create"), text, category: z.string().trim().max(60).nullish(), reason }),
    z.object({ op: z.literal("update"), memoryId: id, text, reason }),
    z.object({ op: z.literal("merge"), into: id, absorb: z.array(z.object({ memoryId: id })).min(1).max(20), text, reason }),
    z.object({ op: z.literal("archive"), memoryId: id, reason }),
])
export type WriterOperationAnswer = z.infer<typeof operationSchema>

const answerSchema = z.object({
    operations: z.array(operationSchema).optional().default([]),
    skip: z.object({ kind: z.enum(MENTOR_SKIP_KINDS).optional(), memoryId: id.optional(), reason }).nullish(),
})
export type WriterOpsAnswer = z.infer<typeof answerSchema>

/** Resposta do redator. `null` = sem o JSON esperado. */
export function parseWriterOps(raw: string): WriterOpsAnswer | null {
    const parsed = answerSchema.safeParse(writerJson(raw))
    return parsed.success ? parsed.data : null
}

/** Operação pronta para aplicar: os ids conferidos e a versão LIDA da lista (nunca a do modelo). */
export interface ResolvedOperation {
    op: MentorOperation
    memoryId: string | null
    version: number | null
    text: string | null
    category: string | null
    absorb: { memoryId: string; version: number }[]
    reason: string
}

export type WriterResolution =
    | { kind: "operations"; operations: ResolvedOperation[] }
    | { kind: "skip"; skipKind: MentorSkipKind; memoryId: string | null; reason: string }
    | { kind: "rejected"; rejection: string }

const ownerArchive = (memory: WriterMemory) => `A memória ${memory.id} foi escrita pelo dono: ela pode ser atualizada ou receber uma fusão, mas nunca ser arquivada nem absorvida.`

/**
 * Confere a resposta do redator contra a lista de destino. `update` com id inexistente vira `create`; os
 * demais ids fora da lista, memória do dono arquivada/absorvida ou a mesma memória em duas operações são
 * recusados com o motivo (pt-BR) para a nova tentativa.
 */
export function resolveWriterOps(answer: WriterOpsAnswer, memories: readonly WriterMemory[], otherIds: readonly string[] = []): WriterResolution {
    const byId = new Map(memories.map((memory) => [memory.id, memory]))
    if (answer.operations.length > MENTOR_WRITER_MAX_OPERATIONS) {
        return { kind: "rejected", rejection: `A resposta trouxe ${answer.operations.length} operações; o máximo por caso é ${MENTOR_WRITER_MAX_OPERATIONS}. Consolide (funda as memórias parecidas numa só operação) e responda de novo.` }
    }
    if (!answer.operations.length) {
        if (!answer.skip) return { kind: "rejected", rejection: 'Responda com "operations" (ao menos uma) ou com "skip".' }
        const refused = checkWriterSkip(answer.skip, [...byId.keys()], otherIds)
        if (refused) return { kind: "rejected", rejection: refused }
        const cited = answer.skip.memoryId ?? answer.skip.reason?.match(/\bm_[A-Za-z0-9]+\b/)?.[0] ?? null
        return { kind: "skip", skipKind: answer.skip.kind!, memoryId: answer.skip.kind === "covered" && cited && byId.has(cited) ? cited : null, reason: answer.skip.reason ?? "" }
    }
    const touched = new Set<string>()
    const touch = (memoryId: string): string | null => {
        if (touched.has(memoryId)) return `A memória ${memoryId} aparece em mais de uma operação: junte tudo numa operação só.`
        touched.add(memoryId)
        return null
    }
    const operations: ResolvedOperation[] = []
    for (const item of answer.operations) {
        if (item.op === "create") {
            operations.push({ op: "create", memoryId: null, version: null, text: item.text, category: item.category ?? null, absorb: [], reason: item.reason })
            continue
        }
        if (item.op === "update") {
            const memory = byId.get(item.memoryId)
            if (!memory) {
                operations.push({ op: "create", memoryId: null, version: null, text: item.text, category: null, absorb: [], reason: item.reason })
                continue
            }
            const repeated = touch(memory.id)
            if (repeated) return { kind: "rejected", rejection: repeated }
            operations.push({ op: "update", memoryId: memory.id, version: memory.version, text: item.text, category: null, absorb: [], reason: item.reason })
            continue
        }
        if (item.op === "archive") {
            const memory = byId.get(item.memoryId)
            if (!memory) return { kind: "rejected", rejection: `A memória ${item.memoryId} não é da lista de destino: só arquive memórias DESTA lista.` }
            if (memory.owner) return { kind: "rejected", rejection: ownerArchive(memory) }
            const repeated = touch(memory.id)
            if (repeated) return { kind: "rejected", rejection: repeated }
            operations.push({ op: "archive", memoryId: memory.id, version: memory.version, text: null, category: null, absorb: [], reason: item.reason })
            continue
        }
        const into = byId.get(item.into)
        if (!into) return { kind: "rejected", rejection: `A memória ${item.into} (destino da fusão) não é da lista de destino.` }
        const absorbIds = [...new Set(item.absorb.map((entry) => entry.memoryId))].filter((memoryId) => memoryId !== into.id)
        if (!absorbIds.length) return { kind: "rejected", rejection: "A fusão precisa absorver ao menos uma memória diferente da que recebe o texto." }
        const absorb: { memoryId: string; version: number }[] = []
        for (const memoryId of absorbIds) {
            const memory = byId.get(memoryId)
            if (!memory) return { kind: "rejected", rejection: `A memória ${memoryId} (absorvida na fusão) não é da lista de destino.` }
            if (memory.owner) return { kind: "rejected", rejection: ownerArchive(memory) }
            absorb.push({ memoryId, version: memory.version })
        }
        for (const memoryId of [into.id, ...absorbIds]) {
            const repeated = touch(memoryId)
            if (repeated) return { kind: "rejected", rejection: repeated }
        }
        operations.push({ op: "merge", memoryId: into.id, version: into.version, text: item.text, category: null, absorb, reason: item.reason })
    }
    return { kind: "operations", operations }
}
