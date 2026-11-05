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

/** Teto técnico da ferramenta executada depois da confirmação do dono. */
export const CONFIRMED_TOOL_TIMEOUT_MS = 5 * 60_000

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
        // Uma Chamada HTTP confirmada usa os segredos do agente, lidos agora.
        const { loadRoutineSecretVault } = await import("./secrets")
        const secrets = await loadRoutineSecretVault(run.agentId)
        // Teto técnico: uma ferramenta (ex.: MCP externo) que nunca responde não pode prender a retomada.
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                controller.abort()
                reject(new Error(`tempo esgotado (${Math.round(CONFIRMED_TOOL_TIMEOUT_MS / 60_000)} min sem resposta da ferramenta)`))
            }, CONFIRMED_TOOL_TIMEOUT_MS)
        })
        const output = await Promise.race([tool.execute(tool.input.parse(raw), { sessionId: "", actorId: "local", scope: OWNER_SCOPE, secrets, signal: controller.signal }), timeout]).finally(() => clearTimeout(timer))
        return `Resultado de "${tool.label}" (executada pelo Opex após a confirmação): ${JSON.stringify(compactToolOutput(output)).slice(0, 8_000)}`
    } catch (error) {
        return `A ação confirmada falhou: ${messageOf(error)}`
    } finally {
        await close?.().catch(() => undefined)
    }
}

/** Respostas em andamento neste processo (o tick não retoma uma confirmação que ainda executa a ação). */
const resolving = new Set<string>()
export const isRoutineActionResolving = (runId: string): boolean => resolving.has(runId)

/** Aviso entregue quando a retomada sai pelo tick (o servidor reiniciou entre a resposta e a fila). */
export const RESOLUTION_INTERRUPTED_NOTE =
    "(O servidor reiniciou logo depois da resposta do dono: se a ação confirmada já tiver rodado, o resultado não chegou. Confira o estado antes de repetir a ação.)"

/** Texto da retomada a partir da resposta do dono (sem o resultado da ferramenta). */
export function resolutionNote(action: { summary: string; kind: string }, decision: "confirmed" | "rejected", note?: string | null): string {
    const extra = note?.trim() ? `\nObservação do dono: ${note.trim()}` : ""
    if (decision === "rejected") return `Recusado pelo dono: "${action.summary}". NÃO execute essa ação; siga sem ela ou conclua.${extra}`
    if (action.kind === "tool") return `Confirmado pelo dono: "${action.summary}".${extra}`
    return `Confirmado pelo dono: "${action.summary}". A ação está liberada: execute-a agora.${extra}`
}

/**
 * A resposta grava, já no claim, o texto da retomada (com o aviso de interrupção, trocado pelo
 * resultado quando a ação roda): se o processo cair antes da fila, o tick retoma a execução com ele.
 */
export async function resolveRoutineAction(runId: string, decision: "confirmed" | "rejected", actorId: string, note?: string): Promise<{ status: string }> {
    const run = await loadRunDoc(runId)
    if (run.status !== "awaiting_confirmation" || !run.pendingAction || run.pendingAction.resolvedAt) throw ALREADY()
    const now = new Date()
    const base = resolutionNote(run.pendingAction, decision, note)
    resolving.add(runId)
    try {
        const claimed = await RoutineRun.findOneAndUpdate(
            { _id: run._id, status: "awaiting_confirmation", "pendingAction.id": run.pendingAction.id, "pendingAction.resolvedAt": null },
            { $set: { "pendingAction.resolvedAt": now, "pendingAction.resolution": decision, "pendingAction.note": note?.trim() || null, resumeNote: `${base}\n${RESOLUTION_INTERRUPTED_NOTE}` } },
            { new: true },
        ).lean<RoutineRunDoc | null>()
        if (!claimed) throw ALREADY()
        await auditRun(actorId, runId, decision === "confirmed" ? AcaoAuditoria.APROVAR : AcaoAuditoria.DEVOLVER, { evento: decision === "confirmed" ? "confirmar" : "recusar", acao: run.pendingAction.summary }).catch((error: unknown) =>
            routineLog.warn({ runId, err: messageOf(error) }, "[routine-agents] auditoria da resposta à confirmação não gravada"),
        )
        const resumeNote = decision === "confirmed" && run.pendingAction.kind === "tool" ? `${base}\n${await executeConfirmedTool(claimed)}` : base
        const requeued = await requeueParkedRun(claimed, "awaiting_confirmation", { resumeNote })
        if (!requeued) routineLog.warn({ runId }, "[routine-agents] execução não voltou para a fila depois da confirmação (cancelada ou expirada no meio)")
        return { status: requeued ? "queued" : (await loadRunDoc(runId)).status }
    } finally {
        resolving.delete(runId)
    }
}
