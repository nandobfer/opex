"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { z } from "zod"
import { Container, MousePointerClick } from "lucide-react"
import { usePersistentState } from "@/hooks/usePersistentState"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell"
import {
    useEnvironmentApi,
    useEnvironmentList,
    useEnvironmentRepoConfig,
    useEnvironmentRepos,
} from "../hooks/useEnvironments"
import { EnvironmentListPane } from "./EnvironmentListPane"
import { EnvironmentPanel } from "./EnvironmentPanel"

const recentRepoSchema = z.string().regex(/^[a-f0-9]{24}$|^$/)

/**
 * Workspace de Ambientes: repositório e ambiente na URL (a casca agrupa `/ambientes`), então trocar
 * de ambiente anima só o painel da direita. O repositório escolhido fica salvo no navegador.
 */
export function EnvironmentWorkspace({ repoId }: { repoId: string }) {
    const api = useEnvironmentApi()
    const repos = useEnvironmentRepos()
    const list = useEnvironmentList(repoId)
    const config = useEnvironmentRepoConfig(repoId)
    const router = useRouter()
    const params = useSearchParams()
    const selected = params.get("ambiente") || list.data?.[0]?.id || ""
    const detailOpen = params.has("ambiente")
    const storageKey = `opex-environments-repo-v1:${api.clientId || "local"}`
    const { value: recentRepo, setValue: setRecentRepo, ready } = usePersistentState(storageKey, recentRepoSchema, "")
    useEffect(() => {
        if (!ready || !repos.data?.length) return
        if (repoId && repos.data.some((p) => p.id === repoId)) {
            if (recentRepo !== repoId) setRecentRepo(repoId)
            return
        }
        const next = repos.data.find((p) => p.id === recentRepo) ?? repos.data[0]
        router.replace(`${api.href}/${next.id}`)
    }, [repos.data, repoId, router, api.href, ready, recentRepo, setRecentRepo])

    if (repos.isLoading) return <Skeleton className="h-96 w-full" />
    if (repos.isError)
        return <ErrorState title="Não foi possível listar os repositórios" onRetry={() => void repos.refetch()} />
    if (!repos.data?.length)
        return (
            <EmptyState
                icon={Container}
                title="Nenhum repositório acessível"
                description={api.portal ? "Solicite o vínculo ao dono." : "Vincule um repositório na integração GitHub."}
            >
                {!api.portal && (
                    <Button asChild size="sm" variant="outline">
                        <Link href="/integracoes/github">Configurar GitHub</Link>
                    </Button>
                )}
            </EmptyState>
        )

    return (
        <WorkspaceShell
            ariaLabel="Ambientes"
            detailOpen={detailOpen}
            viewKey={selected || "empty"}
            mainTestId="environment-panel-pane"
            backHref={detailOpen ? `${api.href}/${repoId}` : undefined}
            backLabel={detailOpen ? "Voltar para ambientes" : undefined}
            aside={
                <EnvironmentListPane
                    repoId={repoId}
                    repos={repos.data}
                    environments={list.data ?? []}
                    isLoading={list.isLoading}
                    isError={list.isError}
                    onRetry={() => void list.refetch()}
                    canEdit={Boolean(config.data?.canEdit)}
                    selected={selected}
                    detailOpen={detailOpen}
                />
            }
        >
            {selected ? (
                <EnvironmentPanel repoId={repoId} envId={selected} />
            ) : (
                <div className="flex flex-1 items-center justify-center">
                    <EmptyState
                        icon={MousePointerClick}
                        title="Selecione um ambiente"
                        description="Escolha um ambiente na lista ao lado para ver o Compose, os logs, publicar e restaurar."
                    />
                </div>
            )}
        </WorkspaceShell>
    )
}
