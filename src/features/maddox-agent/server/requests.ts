import { clientActorFor } from "@/features/auth/server/context"
import { MADDOX_AUDIT_ENTITY } from "@/features/opex-agent/constants"
import { liveMessageOf, publishLine } from "@/features/opex-agent/server/hub"
import { OWNER_SCOPE, sessionFilterOf, withAgent, type OpexServerScope } from "@/features/opex-agent/server/scope"
import { publishSessionUpdated } from "@/features/opex-agent/server/sessions"
import type { OpexConfirmationDto, OpexFormStatus } from "@/features/opex-agent/types"
import { getOpencodeClient } from "@/lib/ai/opencode-client"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { OpexSession, type IMaddoxPendingRequest, type IOpexSession } from "@/lib/db/models/Opex"
import type { ReplyMaddoxFormInput } from "../schemas"
import { assertClientMaddoxEnabled } from "./client-config"

/**
 * Pedidos do OpenCode no meio de um turno do Agente Maddox (SOMENTE servidor): **permissões** (o chat
 * mostra Confirmar/Cancelar no card da ferramenta) e **perguntas** (formulário no chat). A resposta vai
 * direto ao OpenCode e o turno continua sozinho; fechar o popover não cancela o pedido.
 */

/** Grava (ou retira) o pedido em aberto na sessão e ajusta a situação ("aguardando" com pedido aberto). */
export async function setPendingRequest(sessionId: string, request: IMaddoxPendingRequest | null, removeId?: string): Promise<void> {
    if (request) await OpexSession.updateOne({ _id: sessionId }, { $push: { pendingRequests: request }, $set: { status: "awaiting_confirmation" } })
    if (removeId) {
        const doc = await OpexSession.findOneAndUpdate({ _id: sessionId }, { $pull: { pendingRequests: { id: removeId } } }, { new: true }).lean<IOpexSession>()
        if (doc && !(doc.pendingRequests ?? []).length && doc.status === "awaiting_confirmation") await OpexSession.updateOne({ _id: sessionId, status: "awaiting_confirmation" }, { $set: { status: "running" } })
    }
    await publishSessionUpdated(sessionId)
}

type SessionWithRequest = IOpexSession & { _id: { toString(): string } }

/** Sessão do escopo com o pedido em aberto (outra sessão, outro usuário ou já respondido → erro). */
async function sessionWithRequest(requestId: string, kind: IMaddoxPendingRequest["kind"], scope: OpexServerScope): Promise<{ session: SessionWithRequest; request: IMaddoxPendingRequest }> {
    await dbConnect()
    const scoped = withAgent(scope, "maddox")
    if (scoped.kind === "client") await assertClientMaddoxEnabled(await clientActorFor(scoped.actor.userId, String(scoped.actor.client._id)))
    const session = await OpexSession.findOne({ ...sessionFilterOf(scoped), "pendingRequests.id": requestId }).lean<SessionWithRequest>()
    const request = session?.pendingRequests?.find((item) => item.id === requestId && item.kind === kind)
    if (!session || !request || !session.opencodeSessionId) throw new DomainError(409, kind === "permission" ? "Este pedido já foi respondido ou expirou" : "Esta pergunta já foi respondida ou expirou", "OPEX_ACTION_DECIDED")
    return { session, request }
}

/** Confirmar (`once`) ou cancelar (`reject`) a permissão pedida pelo OpenCode. */
export async function decideMaddoxPermission(requestId: string, decision: "confirm" | "cancel", actorId: string, scope: OpexServerScope = OWNER_SCOPE): Promise<OpexConfirmationDto> {
    const { session, request } = await sessionWithRequest(requestId, "permission", scope)
    const sessionId = session._id.toString()
    const client = await getOpencodeClient()
    try {
        await client.permission.reply({ sessionID: session.opencodeSessionId!, requestID: requestId, decision: decision === "confirm" ? "once" : "reject" })
    } catch (error) {
        throw new DomainError(502, `O OpenCode não aceitou a resposta: ${error instanceof Error ? error.message : String(error)}`, "MADDOX_UNAVAILABLE")
    }
    const part = liveMessageOf(sessionId)?.parts.find((item) => item.type === "tool" && item.id === request.partId)
    const base: OpexConfirmationDto = part?.type === "tool" && part.confirmation ? part.confirmation : { actionId: requestId, summary: "Permissão do OpenCode", status: "pending", error: null }
    const confirmation: OpexConfirmationDto = { ...base, status: decision === "confirm" ? "confirmed" : "cancelled" }
    publishLine(sessionId, { type: "tool-confirmation", id: request.partId, confirmation })
    await setPendingRequest(sessionId, null, requestId)
    await recordAudit({
        userId: actorId,
        entidade: MADDOX_AUDIT_ENTITY,
        entidadeId: sessionId,
        acao: decision === "confirm" ? AcaoAuditoria.EXECUTAR : AcaoAuditoria.ABORTAR,
        depois: { acao: confirmation.summary, situacao: confirmation.status },
    })
    return confirmation
}

/** Responder ou dispensar a pergunta (formulário) do OpenCode. */
export async function replyMaddoxForm(formId: string, input: ReplyMaddoxFormInput, actorId: string, scope: OpexServerScope = OWNER_SCOPE): Promise<{ id: string; status: OpexFormStatus }> {
    const { session } = await sessionWithRequest(formId, "form", scope)
    const sessionId = session._id.toString()
    const client = await getOpencodeClient()
    try {
        if (input.cancel) await client.session.form.cancel({ sessionID: session.opencodeSessionId!, formID: formId })
        else await client.session.form.reply({ sessionID: session.opencodeSessionId!, formID: formId, answer: input.answer ?? {} })
    } catch (error) {
        throw new DomainError(502, `O OpenCode não aceitou a resposta: ${error instanceof Error ? error.message : String(error)}`, "MADDOX_UNAVAILABLE")
    }
    const status: OpexFormStatus = input.cancel ? "cancelled" : "answered"
    publishLine(sessionId, { type: "form-status", id: formId, status })
    await setPendingRequest(sessionId, null, formId)
    await recordAudit({ userId: actorId, entidade: MADDOX_AUDIT_ENTITY, entidadeId: sessionId, acao: input.cancel ? AcaoAuditoria.ABORTAR : AcaoAuditoria.ATUALIZAR, depois: { pergunta: formId, situacao: status } })
    return { id: formId, status }
}
