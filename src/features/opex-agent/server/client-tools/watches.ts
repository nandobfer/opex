import { z } from "zod"
import { OPEX_CLIENT_WATCH_TARGET_KINDS } from "../../watches"
import { cancelOpexWatch } from "../watches"
import { clientOpexScope } from "../scope"
import { defineTool } from "../tools/define"
import { summarizeWatch, watchEventInput, watchIdField, watchListInput, watchView } from "../tools/watch-shared"
import { listWatchesTool, watchEventTool } from "../tools/watches"
import { requireClientActor } from "./helpers"

/**
 * Observação de eventos no portal (OPE-194): só tarefas do cliente, jobs do próprio usuário e deploys dos
 * ambientes do cliente, sempre no escopo do usuário. Grupo "desligado por padrão": só existe quando o dono o liga.
 */

const clientWatchInput = watchEventInput(
    OPEX_CLIENT_WATCH_TARGET_KINDS,
    "Alvo: task = código da tarefa (OPX-123) ou id (list_tasks); job = id do job (list_jobs); environment = id ou slug do ambiente (list_environments). Nunca invente ids.",
)

export const clientWatchTools = [
    defineTool({
        name: "watch_event",
        group: "watches",
        label: "Observar evento",
        risk: "write",
        description:
            "Assina um evento e permite encerrar o turno sem agendar job: quando o evento acontecer (tarefa do cliente mudar de coluna ou ser concluída, job do usuário ou deploy de ambiente terminar), o sistema acorda você UMA vez nesta conversa com uma notificação de sistema e o que você combinou fazer (`note`). Se a condição já estiver satisfeita, nada é assinado (`alreadySatisfied`).",
        input: clientWatchInput,
        summarize: (input) => summarizeWatch(input),
        async execute(input, context) {
            const actor = requireClientActor(context)
            return watchEventTool(input, context, clientOpexScope(actor), actor.userId)
        },
    }),
    defineTool({
        name: "list_watches",
        group: "watches",
        label: "Listar observações",
        risk: "read",
        description: "Observações de evento do usuário (ativas por padrão) desta conversa ou de todas: alvo, condição, status, o que foi combinado, o evento e o prazo.",
        input: watchListInput,
        async execute(input, context) {
            return listWatchesTool(input, context, clientOpexScope(requireClientActor(context)))
        },
    }),
    defineTool({
        name: "cancel_watch",
        group: "watches",
        label: "Cancelar observação",
        risk: "write",
        description: "Cancela uma observação ainda ativa do usuário (fica no histórico como cancelada).",
        input: z.object({ watchId: watchIdField }),
        summarize: (input) => `Cancelar a observação ${input.watchId}`,
        async execute(input, context) {
            const actor = requireClientActor(context)
            return { ok: true, ...watchView(await cancelOpexWatch(input.watchId, actor.userId, clientOpexScope(actor))) }
        },
    }),
]
