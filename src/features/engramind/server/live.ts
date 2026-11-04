import { createConsumptionGrouper, createEventBus, createSseHandler, toLiveEvent, type ConsumptionEvent, type EventBus, type LiveEvent, type WebhookEvent } from "@engramind/client/server"
import { publishAppEvent } from "@/lib/pusher/channels"
import { ENGRAMIND_CONSUMPTION_EVENT } from "../constants"
import { engramindLog } from "./shared"

/**
 * Tempo real da rede do Engramind (OPE-116): o barramento da lib `@engramind/client` no processo do
 * Opex. O webhook e as mutações do gestor publicam aqui, e `GET /api/engramind/events` (SSE, só o dono)
 * entrega à rede `/engramind` e aos universos de `/integracoes/ia`. Um processo só (o Opex roda num
 * container); as abas de gestor de `/integracoes/engramind` continuam no Pusher (`engramind-updated`).
 */

type LiveGlobal = typeof globalThis & { __opexEngramindBus?: EventBus; __opexEngramindConsumption?: ReturnType<typeof createConsumptionGrouper> }
const live = globalThis as LiveGlobal

export function engramindBus(): EventBus {
    live.__opexEngramindBus ??= createEventBus({ onError: (error) => engramindLog.warn({ err: error instanceof Error ? error.message : String(error) }, "[engramind] ouvinte do SSE falhou") })
    return live.__opexEngramindBus
}

/** SSE da rede (a rota confere a sessão do dono antes). */
export const engramindSse = (request: Request) => createSseHandler({ bus: engramindBus() })(request)

/** Publica no SSE; nunca lança. */
export async function publishLive(event: LiveEvent): Promise<void> {
    try {
        await engramindBus().publish(event)
    } catch (error) {
        engramindLog.warn({ err: error instanceof Error ? error.message : String(error), type: event.type }, "[engramind] evento ao vivo não publicado")
    }
}

/** Payload de `engramind-consumption` (Pusher, `private-app`): o consumo agrupado, só ids e slugs. */
export function consumptionPayload(event: ConsumptionEvent): Record<string, unknown> {
    return {
        agent: event.agent,
        kind: event.kind,
        channels: event.channels,
        delivered: event.delivered,
        memoryIds: event.memoryIds,
        ...(event.titleIds?.length ? { titleIds: event.titleIds } : {}),
        ...(event.version ? { version: event.version } : {}),
    }
}

/**
 * `memory.consumed` (um por canal) agrupado pelo `consumption`: um `engramind-consumption` no Pusher por
 * leitura, para a atividade dos agentes fora da rede (cards de `/integracoes/ia`, adoção). Leitura sem
 * agente (token admin ou de app) não publica.
 */
function consumptionGrouper() {
    live.__opexEngramindConsumption ??= createConsumptionGrouper({
        onGroup: (event) => void publishAppEvent(ENGRAMIND_CONSUMPTION_EVENT, consumptionPayload(event)).catch((error: unknown) => engramindLog.warn({ err: error instanceof Error ? error.message : String(error), agent: event.agent }, "[engramind] consumo não publicado no Pusher")),
    })
    return live.__opexEngramindConsumption
}

/** Webhook validado e inédito → SSE (todos os tipos) e, no consumo, o Pusher da atividade dos agentes. */
export async function forwardWebhookLive(event: WebhookEvent): Promise<void> {
    const liveEvent = toLiveEvent(event)
    await publishLive(liveEvent)
    if (event.type === "memory.consumed") consumptionGrouper().push(liveEvent)
}
