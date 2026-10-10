"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ListTodo, Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { buildBoardColumns } from "@/features/tasks/board"
import { applyTaskFilters, DEFAULT_TASK_FILTERS, type TaskFilters } from "@/features/tasks/filters"
import { TaskViewSwitch } from "@/features/tasks/components/TaskViewSwitch"
import { clienteNovaPath } from "../constants"
import { useClienteOptions, useClienteTasks } from "./hooks"
import { ClientePortalProvider, useClientePortal } from "./ClientePortalContext"
import { ClienteFiltersBar } from "./components/ClienteFiltersBar"
import { ClienteTaskBoard } from "./components/ClienteTaskBoard"
import { ClienteTaskTable } from "./components/ClienteTaskTable"

/** Portal do cliente: lista somente leitura das tarefas dos repositórios permitidos. */
export function ClienteTasksPage({ token }: { token: string }) {
    return (
        <ClientePortalProvider token={token}>
            <ClienteTasksView />
        </ClientePortalProvider>
    )
}

function ClienteTasksView() {
    const { token } = useClientePortal()
    const router = useRouter()
    const options = useClienteOptions()
    const [filters, setFilters] = useState<TaskFilters>(DEFAULT_TASK_FILTERS)
    const tasks = useClienteTasks(filters.showArchived)

    const columns = useMemo(() => buildBoardColumns(options.data?.board), [options.data])
    const allTasks = useMemo(() => tasks.data?.tasks ?? [], [tasks.data])
    const visible = useMemo(() => applyTaskFilters(allTasks, filters, { ignoreColumn: filters.view === "kanban" }), [allTasks, filters])
    const shown = useMemo(() => {
        if (filters.view !== "kanban") return visible
        const keys = new Set(columns.map((column) => column.key))
        return visible.filter((task) => keys.has(task.columnId))
    }, [visible, columns, filters.view])

    const loading = options.isLoading || tasks.isLoading
    const error = options.error ?? tasks.error
    const refresh = () => {
        void tasks.refetch()
        void options.refetch()
    }

    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-5">
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-lg font-semibold md:text-2xl">{options.data?.clientName ?? "Portal"}</h1>
                    <p className="text-sm text-muted-foreground">Acompanhamento das tarefas (somente leitura).</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <TaskViewSwitch value={filters.view} onChange={(view) => setFilters((prev) => ({ ...prev, view }))} />
                    <Button type="button" size="sm" className="h-9 gap-2" onClick={() => router.push(clienteNovaPath(token))}>
                        <Plus className="h-4 w-4" aria-hidden /> Nova tarefa
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={refresh} disabled={tasks.isFetching}>
                        <RefreshCw className="h-4 w-4" aria-hidden /> Atualizar
                    </Button>
                </div>
            </header>

            {loading ? (
                <Skeleton className="h-[420px] w-full" aria-label="Carregando tarefas" />
            ) : error ? (
                <ErrorState title="Não foi possível carregar as tarefas" description={apiErrorMessage(error, "Tente novamente.")} onRetry={refresh} />
            ) : (
                <>
                    <ClienteFiltersBar filters={filters} setFilters={setFilters} total={shown.length} tasks={allTasks} projects={options.data?.projects ?? []} columns={columns} />
                    {shown.length === 0 ? (
                        <EmptyState icon={ListTodo} title="Nenhuma tarefa" description="As tarefas dos seus repositórios aparecerão aqui." actionLabel="Nova tarefa" onAction={() => router.push(clienteNovaPath(token))} />
                    ) : filters.view === "kanban" ? (
                        <ClienteTaskBoard tasks={visible} columns={columns} />
                    ) : (
                        <ClienteTaskTable tasks={visible} columns={columns} />
                    )}
                </>
            )}
        </motion.section>
    )
}
