import { COLUMN_COLOR_STYLES, type ColumnColor } from "@/features/tasks/board"
import type { TaskDto } from "@/features/tasks/types"
import type { CentralDto } from "./types"

/** Classe neutra da linha do projeto quando a central não tem cor escolhida. */
export const NEUTRAL_PRODUCT_COLOR_CLASS = "text-muted-foreground"

type ProductCentral = Pick<CentralDto, "projectName" | "repo"> & { config?: { color?: ColumnColor | null } }

/**
 * Texto da linha do projeto nos cards da Central de desenvolvimento: o repositório (`org/repo`) da
 * central ou da tarefa e, sem repositório, o nome do projeto. `null` = sem linha.
 */
export function taskProductLabel(task: Pick<TaskDto, "project">, central: ProductCentral | null | undefined): string | null {
    const candidates = [central?.repo, task.project?.repo, central?.projectName, task.project?.name]
    return candidates.map((value) => value?.trim()).find((value): value is string => Boolean(value)) ?? null
}

/** Classe de texto da cor cadastrada na central; sem cor (ou desconhecida) = neutra. */
export function productColorClass(color: ColumnColor | null | undefined): string {
    return (color && COLUMN_COLOR_STYLES[color]?.text) || NEUTRAL_PRODUCT_COLOR_CLASS
}

/** Central de cada projeto (`projectId → central`), para ligar a tarefa à cor e ao repositório. */
export function centralsByProject<T extends Pick<CentralDto, "projectId">>(centrals: readonly T[]): Map<string, T> {
    return new Map(centrals.map((central) => [central.projectId, central]))
}
