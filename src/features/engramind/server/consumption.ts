import { publishAppEvent } from "@/lib/pusher/channels"
import { ENGRAMIND_CONSUMPTION_EVENT } from "../constants"
import type { ConsumptionEvent } from "../network/types"
import { recordMemoryUsage } from "./memory-usage"
import { engramindLog } from "./shared"

/**
 * Consumo de memórias por um agente do Opex (OPE-109): grava o último uso por memória e publica
 * `engramind-consumption` em `private-app` (só o dono vê, inclusive o consumo dos agentes do portal).
 * Payload só com o agente (`app/agente`), o tipo, slugs e ids — nunca textos, títulos ou valores.
 * **Nunca lança**: falha vira log de aviso, e o turno ou a ferramenta seguem.
 */
export async function publishConsumption(event: ConsumptionEvent): Promise<void> {
    const payload: ConsumptionEvent = {
        agent: event.agent,
        kind: event.kind,
        channels: [...new Set(event.channels)],
        delivered: [...new Set(event.delivered)],
        memoryIds: [...new Set(event.memoryIds)],
    }
    if (!payload.memoryIds.length) {
        engramindLog.info({ agent: payload.agent, kind: payload.kind }, "[engramind] consumo sem memórias entregues: nada a publicar")
        return
    }
    try {
        await recordMemoryUsage(payload.memoryIds)
    } catch (error) {
        engramindLog.warn({ err: error instanceof Error ? error.message : String(error), agent: payload.agent }, "[engramind] não foi possível gravar o uso das memórias")
    }
    try {
        await publishAppEvent(ENGRAMIND_CONSUMPTION_EVENT, { ...payload })
    } catch (error) {
        engramindLog.warn({ err: error instanceof Error ? error.message : String(error), agent: payload.agent }, "[engramind] não foi possível publicar o consumo das memórias")
    }
}
