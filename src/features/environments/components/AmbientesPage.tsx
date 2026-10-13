"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Boxes } from "lucide-react"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { Skeleton } from "@/components/ui/skeleton"
import { lastRepoStorageKey } from "../constants"
import { useAmbientesRealtime, useEnvironmentList, useEnvironmentProjects, type AmbientesApi } from "../hooks"
import { EnvironmentListPanel } from "./EnvironmentListPanel"
import { EnvironmentDetailPanel } from "./EnvironmentDetailPanel"

/**
 * Workspace de Ambientes: duas colunas (lista | ambiente selecionado). No celular, um painel por vez.
 * Compartilhado pelo dono e pelo portal (muda só o `context` e o `basePath`).
 */
export function AmbientesPage({
    context,
    basePath,
    projectId,
    envId,
    storageScope,
}: {
    context: AmbientesApi
    basePath: string
    projectId: string | null
    envId: string | null
    storageScope: "owner" | "client"
}) {
    const router = useRouter()
    const projects = useEnvironmentProjects(context)
    const [selectedEnvId, setSelectedEnvId] = useState<string | null>(envId)
    const list = useEnvironmentList(context, projectId ?? "")
    useAmbientesRealtime(context)

    // Sem repositório na URL: usa o último do navegador ou o primeiro acessível.
    useEffect(() => {
        if (projectId || !projects.data) return
        if (projects.data.length === 0) return
        const stored = typeof window !== "undefined" ? window.localStorage.getItem(lastRepoStorageKey(storageScope)) : null
        const target = projects.data.find((project) => project.id === stored) ?? projects.data[0]
        router.replace(`${basePath}/${target.id}`)
    }, [basePath, projectId, projects.data, router, storageScope])

    useEffect(() => {
        if (projectId && typeof window !== "undefined") window.localStorage.setItem(lastRepoStorageKey(storageScope), projectId)
    }, [projectId, storageScope])

    if (projects.isLoading) {
        return (
            <div className="grid gap-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-40 w-full" />
            </div>
        )
    }
    if (projects.isError) return <ErrorState title="Não foi possível carregar os repositórios" onRetry={() => void projects.refetch()} />
    if ((projects.data ?? []).length === 0) {
        return <EmptyState icon={Boxes} title="Nenhum repositório disponível" description="Vincule um repositório no GitHub em Integrações › GitHub para gerenciar ambientes." />
    }
    if (!projectId) return <Skeleton className="h-40 w-full" />

    const selectedEnv = (list.data ?? []).find((env) => env.id === selectedEnvId) ?? null

    return (
        <div className="grid min-h-0 gap-6 lg:grid-cols-[320px_1fr]">
            <div className={selectedEnvId ? "hidden min-h-0 lg:flex lg:flex-col" : "flex min-h-0 flex-col"}>
                <EnvironmentListPanel context={context} basePath={basePath} projectId={projectId} selectedEnvId={selectedEnvId} onSelect={setSelectedEnvId} />
            </div>
            <div className={selectedEnvId ? "flex min-w-0 flex-col" : "hidden lg:flex lg:flex-col"}>
                {selectedEnvId ? (
                    <>
                        <button type="button" onClick={() => setSelectedEnvId(null)} className="mb-3 self-start text-sm text-primary underline-offset-4 hover:underline lg:hidden">
                            Voltar para ambientes
                        </button>
                        <EnvironmentDetailPanel context={context} basePath={basePath} projectId={projectId} envId={selectedEnvId} initialEnv={selectedEnv} />
                    </>
                ) : (
                    <EmptyState icon={Boxes} title="Selecione um ambiente" description="Escolha um ambiente na lista para ver o compose, os logs, publicar e restaurar." />
                )}
            </div>
        </div>
    )
}
