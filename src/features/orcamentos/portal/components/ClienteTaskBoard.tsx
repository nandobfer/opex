"use client"

import { AnimatePresence } from "framer-motion"
import { columnKeyOf, type BoardColumnView } from "@/features/tasks/board"
import { ColumnIconView } from "@/features/tasks/components/column-icons"
import type { GithubRepoLabelData } from "@/features/github/types"
import type { ClienteTaskDto } from "@/features/orcamentos/types"
import { cn } from "@/lib/utils"
import { ClienteTaskCard } from "./ClienteTaskCard"

/** Quadro kanban somente leitura do portal do cliente (sem arrastar); cada card abre a tarefa. */
export function ClienteTaskBoard({
    tasks,
    columns,
    repoIndex,
    hrefFor,
}: {
    tasks: readonly ClienteTaskDto[]
    columns: readonly BoardColumnView[]
    repoIndex?: ReadonlyMap<string, GithubRepoLabelData>
    hrefFor: (task: ClienteTaskDto) => string
}) {
    const grouped = new Map<string, ClienteTaskDto[]>()
    for (const column of columns) grouped.set(column.key, [])
    for (const task of tasks) grouped.get(columnKeyOf(task))?.push(task)

    return (
        <div className="flex gap-3 overflow-x-auto pb-2" role="list">
            {columns.map((column) => {
                const items = grouped.get(column.key) ?? []
                return (
                    <section key={column.key} role="listitem" className={cn("flex w-[290px] shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2", column.border, "border-t-2")}>
                        <header className="flex items-center justify-between gap-2 px-1 py-0.5">
                            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                                <ColumnIconView icon={column.column.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="truncate">{column.label}</span>
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">{items.length}</span>
                        </header>
                        <div className="flex flex-col gap-2">
                            <AnimatePresence initial={false}>
                                {items.map((task) => (
                                    <ClienteTaskCard key={task.id} task={task} repoIndex={repoIndex} href={hrefFor(task)} />
                                ))}
                            </AnimatePresence>
                            {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Nenhuma tarefa</p>}
                        </div>
                    </section>
                )
            })}
        </div>
    )
}
