import { publishAppEvent } from "@/lib/pusher/channels"
import { ARCHITECT_UPDATED_EVENT } from "../constants"

/** Versões da mesa mudaram (nova, progresso, pronta, falha): payload mínimo no canal `private-app`. */
export async function publishDiagrams(workbenchId: string, diagramId: string): Promise<void> {
    await publishAppEvent(ARCHITECT_UPDATED_EVENT, { workbenchId, diagramId }).catch(() => undefined)
}
