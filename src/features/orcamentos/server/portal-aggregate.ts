import { bucketKeyFor, bucketKeys } from "@/features/dashboard/logic"
import type { ClienteDashboardFinanceDto, ClienteFinanceDto, ClienteTagSlice } from "../types"

/**
 * Agregações **puras** do dashboard do portal do cliente (testáveis sem banco): contagem por **tag**
 * e o resumo financeiro (custo/horas por repositório + evolução mensal). Reusa o mesmo bucketing do
 * dashboard do dono (`features/dashboard/logic`), inclusive o fuso IANA.
 */

/** Tarefas sem nenhuma tag entram nesta barra. */
export const NO_TAG_LABEL = "Sem tags"

const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/**
 * Contagem de tarefas por tag. Cada tag conta **uma vez por tarefa** (tarefas com várias tags entram
 * em várias barras); tarefas sem tag caem em "Sem tags" e uma tag fora da taxonomia usa o próprio id
 * como rótulo. Ordena por contagem (desc) e, no empate, pelo rótulo.
 */
export function aggregateClienteTags(
    tasks: readonly { tags?: readonly string[] }[],
    labels: ReadonlyMap<string, string>,
): ClienteTagSlice[] {
    const counts = new Map<string | null, number>()
    for (const task of tasks) {
        const ids = task.tags ?? []
        if (ids.length === 0) {
            counts.set(null, (counts.get(null) ?? 0) + 1)
            continue
        }
        for (const id of new Set(ids)) counts.set(id, (counts.get(id) ?? 0) + 1)
    }

    return [...counts.entries()]
        .map(([tag, count]) => ({ tag, label: tag === null ? NO_TAG_LABEL : (labels.get(tag) ?? tag), count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"))
}

/**
 * Resumo financeiro do dashboard a partir dos grupos do Financeiro do cliente (já agrupados por
 * repositório): totais, custo/horas por repositório e a evolução **mensal** do custo no período —
 * a mesma janela mensal usada no dashboard do dono.
 */
export function summarizeClienteFinance(
    finance: ClienteFinanceDto,
    fromMs: number,
    toMs: number,
    timeZone: string,
): ClienteDashboardFinanceDto {
    const byProject = finance.groups.map((group) => ({
        projectId: group.projectId,
        repo: group.repo,
        costBrl: rounded(group.totalCostBrl),
        clientHours: rounded(group.totalClientHours),
        taskCount: group.taskCount,
        serviceCount: group.serviceCount,
    }))

    const points = new Map<string, number>()
    for (const bucket of bucketKeys("month", fromMs, toMs, timeZone)) points.set(bucket, 0)
    for (const group of finance.groups) {
        for (const task of group.tasks) {
            const key = bucketKeyFor(new Date(task.completedAt).getTime(), "month", timeZone)
            if (points.has(key)) points.set(key, rounded((points.get(key) ?? 0) + task.costBrl))
        }
    }

    return {
        totals: {
            totalCostBrl: rounded(finance.totals.totalCostBrl),
            totalClientHours: rounded(finance.totals.totalClientHours),
            taskCount: finance.totals.taskCount,
            serviceCount: finance.totals.serviceCount,
        },
        byProject,
        timeline: [...points.entries()].map(([bucket, costBrl]) => ({ bucket, costBrl })),
    }
}
