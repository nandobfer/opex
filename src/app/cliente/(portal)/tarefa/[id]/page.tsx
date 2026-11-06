import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ClienteTaskDetailPage } from "@/features/orcamentos/portal/ClienteTaskDetailPage"
import { resolveClienteTaskRoute } from "@/features/orcamentos/server/task-route"
import { withSearchParams } from "@/features/tasks/route-ref"

export const metadata: Metadata = { title: "Tarefa · Portal", robots: { index: false, follow: false } }

type SearchParams = Record<string, string | string[] | undefined>

/** Tarefa no portal pelo código (`/cliente/tarefa/ope-145`); o id redireciona para o código. */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<SearchParams> }) {
    const { id } = await params
    const route = await resolveClienteTaskRoute(id)
    if (route.kind === "redirect") redirect(withSearchParams(route.path, await searchParams))
    return <ClienteTaskDetailPage id={route.id} />
}
