import { z } from "zod"
import { OPEX_WATCH_TARGET_KINDS, opexWatchInputSchema } from "../../watches"
import { cancelOpexWatch, createOpexWatch, listOpexWatches, type CreateWatchResult } from "../watches"
import { OWNER_SCOPE, type OpexServerScope } from "../scope"
import { defineTool, type OpexToolContext } from "./define"
import { summarizeWatch, watchEventInput, watchIdField, watchListInput, watchView } from "./watch-shared"

/**
 * Observação de eventos do dono (OPE-194): assinar, listar e cancelar. As entradas compartilhadas com o
 * portal ficam em `watch-shared.ts`; o serviço recebe o escopo, que decide os alvos e as observações visíveis.
 */

const ownerWatchInput = watchEventInput(
    OPEX_WATCH_TARGET_KINDS,
    "Alvo: task = código da tarefa (OPX-123), issue (repo#N) ou id (list_tasks); workbench = id da mesa ou código da tarefa (list_workbenches); routine_run = id da execução (list_routine_runs); job = id do job (list_jobs); environment = id ou slug do ambiente (list_environments). Nunca invente ids.",
)

/** Resultado da assinatura para o modelo. */
export function watchResultView(result: CreateWatchResult) {
    if (result.alreadySatisfied)
        return { ok: true, alreadySatisfied: true, target: result.target, condition: result.conditionText, current: result.current, hint: "A condição já está satisfeita: nada foi assinado. Siga com o que foi combinado agora." }
    return {
        ok: true,
        alreadySatisfied: false,
        reused: result.reused,
        ...watchView(result.watch),
        current: result.current,
        hint: "Pode encerrar o turno: o sistema acorda você uma vez quando acontecer (ou quando vencer). Não agende job para verificar.",
    }
}

export async function watchEventTool(input: z.infer<ReturnType<typeof watchEventInput>>, context: OpexToolContext, scope: OpexServerScope, actorId: string) {
    const parsed = opexWatchInputSchema.parse(input)
    return watchResultView(await createOpexWatch(parsed, { actorId, sessionId: context.sessionId }, scope))
}

export async function listWatchesTool(input: z.infer<typeof watchListInput>, context: OpexToolContext, scope: OpexServerScope) {
    const sessionId = (input.scope ?? "session") === "session" && context.sessionId ? context.sessionId : undefined
    const items = (await listOpexWatches({ filter: input.filter ?? "active", ...(sessionId ? { sessionId } : {}) }, scope)).map(watchView)
    return { items, total: items.length }
}

export const watchTools = [
    defineTool({
        name: "watch_event",
        group: "watches",
        label: "Observar evento",
        risk: "write",
        description:
            "Assina um evento e permite encerrar o turno sem agendar job: quando o evento acontecer (tarefa mudar de coluna ou ser concluída, mesa parar para o usuário ou falhar, execução de rotineiro, job ou deploy terminar), o sistema acorda você UMA vez nesta conversa com uma notificação de sistema e o que você combinou fazer (`note`). Se a condição já estiver satisfeita, nada é assinado (`alreadySatisfied`). Use em vez de job de verificação periódica.",
        input: ownerWatchInput,
        summarize: (input) => summarizeWatch(input),
        async execute(input, context) {
            return watchEventTool(input, context, OWNER_SCOPE, context.actorId)
        },
    }),
    defineTool({
        name: "list_watches",
        group: "watches",
        label: "Listar observações",
        risk: "read",
        description: "Observações de evento (ativas por padrão) desta conversa ou de todas: alvo, condição, status, o que foi combinado, o evento e o prazo. Inclui as do portal com scope=all.",
        input: watchListInput,
        async execute(input, context) {
            return listWatchesTool(input, context, OWNER_SCOPE)
        },
    }),
    defineTool({
        name: "cancel_watch",
        group: "watches",
        label: "Cancelar observação",
        risk: "write",
        description: "Cancela uma observação ainda ativa (fica no histórico como cancelada; para voltar a observar, assine de novo).",
        input: z.object({ watchId: watchIdField }),
        summarize: (input) => `Cancelar a observação ${input.watchId}`,
        async execute(input, context) {
            return { ok: true, ...watchView(await cancelOpexWatch(input.watchId, context.actorId, OWNER_SCOPE)) }
        },
    }),
]
