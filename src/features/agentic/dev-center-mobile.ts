/**
 * Coluna Tarefas da Central de desenvolvimento no celular (`< lg`, OPE-166). Módulo puro: a busca fica
 * sempre à vista no celular, então o chip da busca sai da linha de chips e da contagem do botão Filtros.
 */

/** Posição da tarefa na lista filtrada (`-1` quando ela não está na lista ou não há tarefa). */
export function activeTaskIndex(tasks: readonly { id: string }[], id: string | null): number {
    if (!id) return -1
    return tasks.findIndex((task) => task.id === id)
}

/** Chips da linha do celular: todos os filtros fora do padrão, menos a busca (que tem campo próprio). */
export function mobileFilterChips<T extends { key: string }>(chips: readonly T[]): T[] {
    return chips.filter((chip) => chip.key !== "search")
}

/** Rótulo do botão que fecha a folha de filtros. */
export function seeTasksLabel(count: number): string {
    if (count === 0) return "Nenhuma tarefa"
    return count === 1 ? "Ver 1 tarefa" : `Ver ${count} tarefas`
}
