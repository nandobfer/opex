import { DomainError } from "@/lib/api/route"
import { isRoutineForbiddenToolGroup } from "../constants"
import { decryptSecret, isEncryptedSecret } from "@/lib/crypto/secretBox"
import { RoutineRun } from "@/lib/db/models/RoutineAgent"
import { canCancelRun, isFinalRunStatus } from "../status"
import { stopActivation } from "./hub"
import { closeParkedRun, loadRunDoc, requeueParkedRun } from "./runs"
import { AcaoAuditoria, auditRun, messageOf, routineLog, type RoutineRunDoc } from "./shared"

/**
 * Ações do dono sobre uma execução (OPE-130): **Cancelar** (todo status não final) e **Confirmar /
 * Recusar** a ação pendente. A resposta é atômica: a segunda (página e Agente Opex ao mesmo tempo)
 * recebe 409 `ROUTINE_ACTION_ALREADY_RESOLVED`. Confirmar uma ferramenta interceptada (motor Opex) a
 * executa agora e retoma a execução com o resultado; confirmar um pedido (`request_confirmation`)
 * retoma com a ação liberada; recusar retoma com a recusa.
 */

const ALREADY = () => new DomainError(409, "Esta confirmação já foi respondida", "ROUTINE_ACTION_ALREADY_RESOLVED")

export async function cancelRoutineRun(runId: string, actorId: string): Promise<{ status: string }> {
    const run = await loadRunDoc(runId)
    if (!canCancelRun(run.status)) throw new DomainError(409, "A execução já terminou", "ROUTINE_RUN_FINISHED")
    // A auditoria "cancelar" sai no fecho (`afterSettle`), com o status final.
    if ((run.status === "running" || run.status === "waiting") && stopActivation(runId, "canceled")) return { status: "canceled" }
    const closed = await closeParkedRun(run, "canceled", { actorId, from: ["queued", "hibernating", "awaiting_confirmation", "running", "waiting"] })
    if (!closed) {
        const fresh = await loadRunDoc(runId)
        if (isFinalRunStatus(fresh.status)) throw new DomainError(409, "A execução já terminou", "ROUTINE_RUN_FINISHED")
    }
    return { status: "canceled" }
}

async function executeConfirmedTool(run: RoutineRunDoc): Promise<string> {
    const action = run.pendingAction!
    const raw = action.input && isEncryptedSecret(action.input) ? (JSON.parse(decryptSecret(action.input)) as unknown) : {}
    const { OWNER_SCOPE } = await import("@/features/opex-agent/server/scope")
    const { findOpexTool } = await import("@/features/opex-agent/server/tools/registry")
    const { compactToolOutput } = await import("@/features/opex-agent/server/tool-display")
    let tool = findOpexTool(action.toolName ?? "")
    let close: (() => Promise<void>) | null = null
    if (!tool && action.toolName) {
        const { resolveMcpTool } = await import("@/features/opex-agent/server/mcp/tools")
        const resolved = await resolveMcpTool(action.toolName, OWNER_SCOPE)
        if (resolved) {
            tool = resolved.tool
            close = resolved.close
        }
    }
    if (!tool) return `A ferramenta "${action.toolLabel ?? action.toolName}" não existe mais: a ação não foi executada.`
    if (isRoutineForbiddenToolGroup(tool.group)) return `A ferramenta "${tool.label}" não pode ser usada por agentes rotineiros: a ação não foi executada.`
    try {
        const output = await tool.execute(tool.input.parse(raw), { sessionId: "", actorId: "local", scope: OWNER_SCOPE })
        return `Resultado de "${tool.label}" (executada pelo Opex após a confirmação): ${JSON.stringify(compactToolOutput(output)).slice(0, 8_000)}`
    } catch (error) {
        return `A ação confirmada falhou: ${messageOf(error)}`
    } finally {
        await close?.().catch(() => undefined)
    }
}

export async function resolveRoutineAction(runId: string, decision: "confirmed" | "rejected", actorId: string, note?: string): Promise<{ status: string }> {
    const run = await loadRunDoc(runId)
    if (run.status !== "awaiting_confirmation" || !run.pendingAction || run.pendingAction.resolvedAt) throw ALREADY()
    const now = new Date()
    const claimed = await RoutineRun.findOneAndUpdate(
        { _id: run._id, status: "awaiting_confirmation", "pendingAction.id": run.pendingAction.id, "pendingAction.resolvedAt": null },
        { $set: { "pendingAction.resolvedAt": now, "pendingAction.resolution": decision, "pendingAction.note": note?.trim() || null } },
        { new: true },
    ).lean<RoutineRunDoc | null>()
    if (!claimed) throw ALREADY()
    await auditRun(actorId, runId, decision === "confirmed" ? AcaoAuditoria.APROVAR : AcaoAuditoria.DEVOLVER, { evento: decision === "confirmed" ? "confirmar" : "recusar", acao: run.pendingAction.summary })
    const summary = run.pendingAction.summary
    const extra = note?.trim() ? `\nObservação do dono: ${note.trim()}` : ""
    let resumeNote: string
    if (decision === "rejected") resumeNote = `Recusado pelo dono: "${summary}". NÃO execute essa ação; siga sem ela ou conclua.${extra}`
    else if (run.pendingAction.kind === "tool") resumeNote = `Confirmado pelo dono: "${summary}".${extra}\n${await executeConfirmedTool(claimed)}`
    else resumeNote = `Confirmado pelo dono: "${summary}". A ação está liberada: execute-a agora.${extra}`
    const requeued = await requeueParkedRun(claimed, "awaiting_confirmation", { resumeNote })
    if (!requeued) routineLog.warn({ runId }, "[routine-agents] execução não voltou para a fila depois da confirmação (cancelada ou expirada no meio)")
    return { status: requeued ? "queued" : (await loadRunDoc(runId)).status }
}
