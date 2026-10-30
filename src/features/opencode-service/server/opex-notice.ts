import { OPENCODE_SERVICE_ACTION_LABELS } from "../constants"
import type { OpencodeServiceOperationDto } from "../types"

/** Fim de uma operação do serviço pedida pelo Agente Opex: aviso (`notice`) na sessão que a pediu. */

export function serviceNoticeText(op: OpencodeServiceOperationDto): { text: string; display: string } {
    const label = OPENCODE_SERVICE_ACTION_LABELS[op.action]
    if (op.status === "succeeded")
        return { text: `[Aviso automático] ${label.done}${op.toVersion ? ` (versão ${op.toVersion})` : ""}. Informe o usuário em poucas palavras.`, display: label.done }
    return { text: `[Aviso automático] ${label.verb} o serviço do OpenCode falhou: ${(op.error ?? "erro desconhecido").slice(0, 500)}. Informe o usuário.`, display: `${label.verb} falhou` }
}

export async function notifyOpexServiceOperation(sessionId: string, op: OpencodeServiceOperationDto): Promise<void> {
    const { queueFollowUp } = await import("@/features/opex-agent/server/runner")
    const notice = serviceNoticeText(op)
    await queueFollowUp(sessionId, { kind: "notice", text: notice.text, display: notice.display })
}
