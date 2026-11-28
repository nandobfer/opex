import { publishAppEvent } from "@/lib/pusher/channels"
import { PROJECT_BOOTSTRAP_UPDATED_EVENT } from "../constants"

/** Estado do bootstrap mudou (payload mínimo: só o id; nunca o `.env`, o contexto ou o resumo). */
export async function publishProjectBootstrap(id: string): Promise<void> {
    await publishAppEvent(PROJECT_BOOTSTRAP_UPDATED_EVENT, { id }).catch(() => undefined)
}
