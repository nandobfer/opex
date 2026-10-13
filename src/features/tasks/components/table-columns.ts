import type { TaskFilters, TaskTableColumn } from "../filters"

/**
 * Metadados das colunas da tabela de tarefas, compartilhados pela tabela desktop (`TaskTable`) e
 * pelo menu de ordenação dos cards compactos do celular (`TaskCompactList`).
 */

export const TABLE_COLUMN_LABELS: Record<TaskTableColumn, string> = {
    code: "Código",
    issue: "Issue",
    title: "Título",
    column: "Coluna",
    priority: "Prioridade",
    type: "Tipo",
    project: "Repositório",
    updatedAt: "Atualizada",
}

/** Ordem das colunas na tabela e no menu de ordenação. */
export const TABLE_COLUMN_ORDER: readonly TaskTableColumn[] = ["code", "issue", "title", "column", "priority", "type", "project", "updatedAt"]

/** Larguras fixas de cada coluna (só a tabela desktop usa). */
export const TABLE_COLUMN_WIDTHS: Partial<Record<TaskTableColumn, string>> = {
    code: "w-[96px] md:w-[110px]",
    issue: "w-[84px]",
    column: "w-[150px] md:w-[200px] xl:w-[240px]",
    priority: "w-[125px]",
    type: "w-[100px]",
    project: "w-[200px]",
    updatedAt: "w-[120px]",
}

/** Próxima ordenação ao clicar/ativar uma coluna: alterna a direção na mesma coluna; `updatedAt` começa decrescente. */
export function nextTableSort(current: TaskFilters["tableSort"], column: TaskTableColumn): TaskFilters["tableSort"] {
    if (current.column === column) return { column, direction: current.direction === "asc" ? "desc" : "asc" }
    return { column, direction: column === "updatedAt" ? "desc" : "asc" }
}
