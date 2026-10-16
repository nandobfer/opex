import { z } from "zod"
import type { TaskDto } from "@/features/tasks/types"
import type { RunState, WorkbenchStage } from "./constants"
import { workbenchUserWaitReason } from "./logic"

/** Filtros da lista de tarefas da Central de desenvolvimento (persistidos no navegador). */

export const DEV_CENTER_FILTERS_KEY = "opex:dev-center-filters:v1"

export const DEV_CENTER_STATES = ["needs_interaction", "failed", "running", "no_workbench", "central_queue", "planning", "plan_review", "implementing", "preview", "opening_pr", "pr_open", "github_actions"] as const
export type DevCenterState = (typeof DEV_CENTER_STATES)[number]
export const DEV_CENTER_STATE_LABELS: Record<DevCenterState, string> = {
    needs_interaction: "Requer interação", failed: "Falhou / interrompida", running: "Agente trabalhando",
    no_workbench: "Sem mesa", central_queue: "Na fila da central", planning: "Planejando", plan_review: "Plano pronto (revisar)",
    implementing: "Implementando", preview: "Prévia pronta (aprovar)", opening_pr: "Abrindo o PR", pr_open: "PR aberto", github_actions: "Ações do GitHub",
}
const STATE_STAGES: Partial<Record<DevCenterState, readonly WorkbenchStage[]>> = {
    planning: ["planning"], plan_review: ["plan_review"], implementing: ["implementing", "build_queued", "building"],
    preview: ["preview"], opening_pr: ["opening_pr"], pr_open: ["pr_open"],
    github_actions: ["changes_requested", "resolving_conflicts", "merging_pr", "deleting_pr_branch", "finishing"],
}
export interface TaskWorkbenchState {
    workbench?: { stage: WorkbenchStage; runState: RunState; pendingPermissions: number; pendingForms: number; slotQueue?: unknown }
    queued?: boolean
}
export function matchesDevCenterState(state: DevCenterState, { workbench, queued = false }: TaskWorkbenchState): boolean {
    if (state === "no_workbench") return !workbench && !queued
    if (state === "central_queue") return Boolean(workbench?.slotQueue) || (!workbench && queued)
    if (!workbench) return false
    if (state === "needs_interaction") return !workbench.slotQueue && (workbenchUserWaitReason(workbench) !== null || workbench.pendingForms > 0 || workbench.pendingPermissions > 0)
    if (state === "failed") return workbench.runState === "failed" || workbench.runState === "interrupted"
    if (state === "running") return workbench.runState === "running" && !workbench.slotQueue && workbench.pendingForms === 0 && workbench.pendingPermissions === 0
    return STATE_STAGES[state]?.includes(workbench.stage) ?? false
}

export const devCenterFiltersSchema = z.object({
    search: z.string().max(200),
    columns: z.array(z.string().max(60)).max(100),
    allColumns: z.boolean().optional(),
    states: z.array(z.enum(DEV_CENTER_STATES)).max(DEV_CENTER_STATES.length).default([]),
})
export type DevCenterFilters = z.infer<typeof devCenterFiltersSchema>

/** Padrão: tudo (nenhuma coluna escolhida). */
export const DEFAULT_DEV_CENTER_FILTERS: DevCenterFilters = {
    search: "",
    columns: [],
    states: [],
}

const normalize = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()

/** Tarefas do projeto que passam nos filtros, na ordem do quadro. */
export function filterCentralTasks(tasks: readonly TaskDto[], projectId: string | readonly string[], filters: DevCenterFilters, stateOf: (task: TaskDto) => TaskWorkbenchState = () => ({})): TaskDto[] {
    const terms = normalize(filters.search).split(/\s+/).filter(Boolean)
    const columns = new Set(filters.columns)
    const projects = new Set(typeof projectId === "string" ? [projectId] : projectId)
    return tasks
        .filter((task) => !task.archived && Boolean(task.project && projects.has(task.project.id)))
        .filter((task) => (filters.allColumns ?? columns.size === 0) || columns.has(task.columnId))
        .filter((task) => !filters.states.length || filters.states.some((state) => matchesDevCenterState(state, stateOf(task))))
        .filter((task) => {
            if (!terms.length) return true
            const haystack = normalize(`${task.code} ${task.title} ${task.summary ?? ""}`)
            return terms.every((term) => haystack.includes(term))
        })
        .sort((a, b) => a.order - b.order)
}
