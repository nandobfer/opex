import { DomainError } from "@/lib/api/route"
import { createAgentMemory, resolveCategory, updateAgentMemory, type AgentMemoryWriteOptions } from "@/features/ai/server/agent-memory-service"
import { MENTOR_MEMORY_SOURCE, type MentorTarget } from "../../mentor/constants"
import type { ResolvedOperation } from "../../mentor/operations"
import type { IMentorCaseOperation } from "./models"
import { centralOf, log } from "./steps"

/**
 * Aplicação das operações do aprendizado (OPE-165), como o agente `opex/mentor` (token próprio): origem
 * `Mentor · <tarefa>` e auditoria `MemoriaAgente` com `ator: agente:mentor`, a execução, a mesa, a tarefa,
 * o destino e a operação. Criar, atualizar (com a versão lida), fundir (a que recebe é atualizada e as
 * absorvidas são arquivadas) e arquivar — nunca excluir. Uma falha fica na própria operação; as demais
 * seguem.
 */

export interface ApplyContext {
    runId: string
    workbenchId: string
    taskCode: string
    centralId: string
    actorId: string
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

function optionsFor(ctx: ApplyContext, target: MentorTarget, operation: ResolvedOperation, extra: Record<string, unknown> = {}): AgentMemoryWriteOptions {
    return {
        agent: { consumer: MENTOR_MEMORY_SOURCE, label: `Mentor · ${ctx.taskCode}` },
        auditContext: { origem: "Agente Mentor", execucao: ctx.runId, mesa: ctx.workbenchId, tarefa: ctx.taskCode, destino: target, operacao: operation.op, ...extra },
        centralId: centralOf(target, ctx.centralId),
    }
}

/** Categoria sugerida pelo redator, quando é válida no Engramind (senão, a padrão). */
const categoryOf = (category: string | null) => (category ? resolveCategory(category).catch(() => undefined) : Promise.resolve(undefined))

export async function applyOperation(ctx: ApplyContext, target: MentorTarget, operation: ResolvedOperation): Promise<IMentorCaseOperation> {
    const record: IMentorCaseOperation = {
        op: operation.op,
        target,
        centralId: centralOf(target, ctx.centralId),
        memoryId: operation.memoryId,
        absorbed: operation.absorb.map((item) => item.memoryId),
        text: operation.text,
        reason: operation.reason,
        status: "applied",
        error: null,
    }
    try {
        if (operation.op === "create") {
            const categoria = await categoryOf(operation.category)
            const created = await createAgentMemory(target, operation.text!, ctx.actorId, { ...optionsFor(ctx, target, operation), ...(categoria ? { categoria } : {}) })
            return { ...record, memoryId: created.memoria.id }
        }
        if (!operation.memoryId) throw new DomainError(400, "Operação sem memória", "MENTOR_OPERATION_INVALID")
        if (operation.op === "update") {
            await updateAgentMemory(target, operation.memoryId, { texto: operation.text!, versao: operation.version ?? undefined }, ctx.actorId, optionsFor(ctx, target, operation))
            return record
        }
        if (operation.op === "archive") {
            await updateAgentMemory(target, operation.memoryId, { ativa: false, versao: operation.version ?? undefined }, ctx.actorId, optionsFor(ctx, target, operation, { motivo: operation.reason }))
            return record
        }
        // Fusão: a que recebe é atualizada primeiro; as absorvidas são arquivadas (nunca excluídas).
        await updateAgentMemory(target, operation.memoryId, { texto: operation.text!, versao: operation.version ?? undefined }, ctx.actorId, optionsFor(ctx, target, operation, { absorvidas: record.absorbed }))
        const failed: string[] = []
        for (const absorbed of operation.absorb) {
            try {
                await updateAgentMemory(target, absorbed.memoryId, { ativa: false, versao: absorbed.version }, ctx.actorId, optionsFor(ctx, target, operation, { memoria: absorbed.memoryId, absorvidaPor: operation.memoryId }))
            } catch (error) {
                failed.push(`${absorbed.memoryId}: ${errorText(error)}`)
            }
        }
        return failed.length ? { ...record, status: "failed", error: `A fusão foi gravada, mas não foi possível arquivar: ${failed.join("; ")}` } : record
    } catch (error) {
        log.warn({ err: error, runId: ctx.runId, op: operation.op, memoryId: operation.memoryId }, "[adversarial-agent] Agente Mentor: operação não aplicada")
        return { ...record, status: "failed", error: errorText(error) }
    }
}
