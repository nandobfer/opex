import { previewClientFromCookies, resolvePortalContext, sessionFromCookies } from "@/features/auth/server/context"
import { resolveTaskRoute, type TaskRouteResolution } from "@/features/tasks/server/resolve-route"
import { clienteTarefaPath } from "../constants"

/**
 * Resolve o segmento de `/cliente/tarefa/[código]` (OPE-146) no escopo do cliente da sessão: o id
 * redireciona para o código e tarefa de outro cliente segue como "não encontrada" (sem revelar o
 * código). Sem contexto do portal, segue com o valor recebido (o layout já manda para `/cliente`).
 */
export async function resolveClienteTaskRoute(ref: string): Promise<TaskRouteResolution> {
    const session = await sessionFromCookies()
    const previewClient = session?.kind === "admin" ? await previewClientFromCookies() : null
    const context = session ? await resolvePortalContext(session, previewClient) : null
    if (!context) return { kind: "render", id: ref }
    return resolveTaskRoute(ref, { pathFor: (code) => clienteTarefaPath({ code }), clientId: String(context.client._id) })
}
