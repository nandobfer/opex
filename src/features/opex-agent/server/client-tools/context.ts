import { z } from "zod"
import { TASK_PRIORITIES, TASK_TYPES } from "@/features/tasks/constants"
import { getClientOptions } from "@/features/orcamentos/server/portal"
import { defineTool } from "../tools/define"
import { nowContext } from "../tools/context"
import { requireClientActor } from "./helpers"

/** Contexto do portal: quem está falando, com qual papel, e os repositórios/colunas permitidos. */
export const clientContextTools = [
    defineTool({
        name: "get_portal_overview",
        group: "context",
        label: "Visão geral",
        risk: "read",
        description:
            "Retrato do portal agora: data/hora, cliente, usuário e papel, repositórios permitidos (com id e repo), colunas do quadro e opções de tipo/prioridade. Bom primeiro passo quando o pedido for amplo.",
        input: z.object({}),
        execute: async (_input, context) => {
            const actor = requireClientActor(context)
            const options = await getClientOptions(actor.client)
            return {
                now: nowContext(),
                client: { id: String(actor.client._id), name: actor.client.name },
                user: { name: actor.displayName, role: actor.isAdmin ? "administrador" : "usuário" },
                projects: options.projects,
                columns: options.board.columns.map((column) => ({ key: column.key, name: column.name, description: column.description })),
                boardOrder: options.board.layout,
                taskTypes: TASK_TYPES,
                priorities: TASK_PRIORITIES,
            }
        },
    }),
]
