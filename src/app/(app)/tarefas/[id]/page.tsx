import { redirect } from "next/navigation"
import { TaskDetailPage } from "@/features/tasks/components/detail/TaskDetailPage"
import { taskPath } from "@/features/tasks/constants"
import { withSearchParams } from "@/features/tasks/route-ref"
import { resolveTaskRoute } from "@/features/tasks/server/resolve-route"

type SearchParams = Record<string, string | string[] | undefined>

/** Página da tarefa pelo código (`/tarefas/ope-145`); o id do MongoDB redireciona para o código. */
export default async function TarefaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<SearchParams> }) {
    const { id } = await params
    const route = await resolveTaskRoute(id, { pathFor: (code) => taskPath({ code }) })
    if (route.kind === "redirect") redirect(withSearchParams(route.path, await searchParams))
    return <TaskDetailPage id={route.id} />
}
