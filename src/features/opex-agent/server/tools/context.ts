import { z } from "zod"
import { listCentrals } from "@/features/agentic/server/centrals"
import { listWorkbenchesInProgress } from "@/features/agentic/server/in-progress"
import { getBoard } from "@/features/tasks/server/columns"
import { getTaskOptions, listTasks } from "@/features/tasks/server/service"
import { listActiveTimers } from "@/features/time/server/service"
import { getLocalUser } from "@/lib/local-user"
import { toolErrorMessage, defineTool } from "./define"

const TIME_ZONE = "America/Sao_Paulo"

async function settle<T>(run: () => Promise<T>): Promise<T | { error: string }> {
    try {
        return await run()
    } catch (error) {
        return { error: toolErrorMessage(error) }
    }
}

export function nowContext(now = new Date()) {
    return {
        iso: now.toISOString(),
        local: new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short", timeZone: TIME_ZONE }).format(now),
        timeZone: TIME_ZONE,
    }
}

export const contextTools = [
    defineTool({
        name: "get_app_overview",
        group: "context",
        label: "Visão geral",
        risk: "read",
        description:
            "Retrato do app agora: data/hora, dono, repositórios (projetos), contagem de tarefas por coluna, períodos agênticos ativos, centrais e mesas em andamento. Bom primeiro passo quando o pedido for amplo.",
        input: z.object({}),
        execute: async () => {
            const [options, tasks, board, timers, centrals, workbenches] = await Promise.all([
                settle(getTaskOptions),
                settle(() => listTasks(false)),
                settle(getBoard),
                settle(listActiveTimers),
                settle(listCentrals),
                settle(listWorkbenchesInProgress),
            ])
            const tasksByColumn =
                "tasks" in tasks && "columns" in board
                    ? board.columns.map((column) => ({ key: column.key, name: column.name, count: tasks.tasks.filter((task) => task.columnId === column.key).length }))
                    : "error" in tasks
                      ? tasks
                      : board
            return {
                now: nowContext(),
                owner: getLocalUser().name,
                projects: "projects" in options ? options.projects : options,
                tasksByColumn,
                activePeriods: timers,
                centrals: Array.isArray(centrals)
                    ? centrals.map((central) => ({ id: central.id, projectName: central.projectName, enabled: central.config.enabled, activeWorkbenches: central.activeWorkbenches }))
                    : centrals,
                workbenchesInProgress: workbenches,
            }
        },
    }),
]
