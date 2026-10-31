import { loggerFor } from "@/lib/logger"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { publishAppEvent } from "@/lib/pusher/channels"
import { ENGRAMIND_AUDIT_ENTITY, ENGRAMIND_UPDATED_EVENT } from "../constants"

export const engramindLog = loggerFor({ feature: "engramind" })

type Acao = (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria]

/** Auditoria do Opex de uma operação no Engramind (nunca com segredos). */
export async function auditEngramind(actorId: string, entidadeId: string, acao: Acao, depois?: Record<string, unknown>, antes?: Record<string, unknown>): Promise<void> {
    await dbConnect()
    await recordAudit({ userId: actorId, entidade: ENGRAMIND_AUDIT_ENTITY, entidadeId, acao, antes, depois })
}

/** Repasse às telas (`private-app`): payload mínimo, sem textos nem valores. */
export async function publishEngramind(payload: { type: string; channel?: string | null; keys?: string[] }): Promise<void> {
    const clean: Record<string, unknown> = { type: payload.type }
    if (payload.channel) clean.channel = payload.channel
    if (payload.keys?.length) clean.keys = payload.keys
    await publishAppEvent(ENGRAMIND_UPDATED_EVENT, clean)
}

export { AcaoAuditoria }
