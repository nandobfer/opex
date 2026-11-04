import type { CSSProperties } from "react"
import { normalizeColor } from "@/lib/colors"
import type { TaskDto } from "@/features/tasks/types"
import type { CentralDto } from "./types"

/** Classe neutra da linha do projeto quando a central não tem cor escolhida. */
export const NEUTRAL_PRODUCT_COLOR_CLASS = "text-muted-foreground"

type ProductCentral = Pick<CentralDto, "projectName" | "repo"> & { config?: { color?: string | null } }

/**
 * Texto da linha do projeto nos cards da Central de desenvolvimento: o repositório (`org/repo`) da
 * central ou da tarefa e, sem repositório, o nome do projeto. `null` = sem linha.
 */
export function taskProductLabel(task: Pick<TaskDto, "project">, central: ProductCentral | null | undefined): string | null {
    const candidates = [central?.repo, task.project?.repo, central?.projectName, task.project?.name]
    return candidates.map((value) => value?.trim()).find((value): value is string => Boolean(value)) ?? null
}

/**
 * Cor do texto do projeto pela cor cadastrada na central (hex, por `style`: é dado do usuário); sem
 * cor (ou inválida) = classe neutra do tema.
 */
export function productColorProps(color: string | null | undefined): { className?: string; style?: CSSProperties } {
    const hex = normalizeColor(color)
    return hex ? { style: { color: hex } } : { className: NEUTRAL_PRODUCT_COLOR_CLASS }
}

/** Central de cada projeto (`projectId → central`), para ligar a tarefa à cor e ao repositório. */
export function centralsByProject<T extends Pick<CentralDto, "projectId">>(centrals: readonly T[]): Map<string, T> {
    return new Map(centrals.map((central) => [central.projectId, central]))
}
