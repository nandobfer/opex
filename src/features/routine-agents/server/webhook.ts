import { DomainError } from "@/lib/api/route"
import { Types } from "mongoose"
import { MAX_WEBHOOK_PAYLOAD_BYTES } from "../constants"
import type { RoutineWebhookBody } from "../schemas"
import { assertRunnable, triggerRoutineRun } from "./runs"
import { loadAgentDoc, notFoundAgent } from "./shared"

/**
 * Webhook externo (OPE-130): `POST /api/v1/routine-agents/{id}/runs` (token de sistema com o escopo
 * `api:v1:routine-agents`). O webhook só cria execuções novas — nunca reativa uma existente.
 * Ordem das recusas: 404 inexistente, 409 `ROUTINE_AGENT_PAUSED` (pausado/arquivado), 409
 * `ROUTINE_AGENT_WEBHOOK_DISABLED` (gatilho desligado) e 409 `ROUTINE_AGENT_NOT_PROVISIONED`.
 */

/** `payload` serializado acima de 64 KB → 400. */
export function assertWebhookPayloadSize(body: RoutineWebhookBody): void {
    if (body.payload === undefined) return
    const size = Buffer.byteLength(JSON.stringify(body.payload) ?? "", "utf8")
    if (size > MAX_WEBHOOK_PAYLOAD_BYTES) throw new DomainError(400, `O payload passa de 64 KB (${Math.ceil(size / 1024)} KB)`, "PAYLOAD_TOO_LARGE")
}

export async function triggerRoutineRunFromWebhook(agentId: string, body: RoutineWebhookBody, token: { id: string; nome: string }): Promise<{ runId: string; status: string }> {
    if (!Types.ObjectId.isValid(agentId)) throw notFoundAgent()
    assertWebhookPayloadSize(body)
    const agent = await loadAgentDoc(agentId)
    if (agent.status !== "active") throw new DomainError(409, "O agente rotineiro está pausado ou arquivado", "ROUTINE_AGENT_PAUSED")
    const webhook = (agent.triggers ?? []).find((state) => state.trigger.kind === "webhook")
    if (!webhook?.trigger.enabled) throw new DomainError(409, "O gatilho de webhook deste agente está desligado", "ROUTINE_AGENT_WEBHOOK_DISABLED")
    assertRunnable(agent)
    return triggerRoutineRun(agentId, { origin: "webhook", triggerId: webhook.trigger.id, request: body.request ?? null, payload: body.payload ?? null }, `api-token:${token.id}`)
}
