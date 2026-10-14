"use client"

import { useEffect, useRef, type CSSProperties } from "react"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowLeft, Boxes } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useScrollViewportHeight } from "@/features/integrations/hooks/useScrollViewportHeight"
import { lastRepoStorageKey } from "../constants"
import { useAmbientesRealtime, useEnvironmentList, useEnvironmentProjects, type AmbientesApi } from "../hooks"
import { EnvironmentListPanel } from "./EnvironmentListPanel"
import { EnvironmentDetailPanel } from "./EnvironmentDetailPanel"

/**
 * Workspace de Ambientes: **duas colunas** no mesmo desenho da Central de desenvolvimento
 * (`/desenvolvimento`): lista à esquerda (largura fixa a partir de `lg`, altura da área visível) e o
 * ambiente selecionado à direita. No celular, um painel por vez. Compartilhado pelo dono e pelo
 * portal (muda só o `context` e o `basePath`).
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
    const list = useEnvironmentList(context, projectId ?? "")
    useAmbientesRealtime(context)
    const sectionRef = useRef<HTMLElement>(null)
    const height = useScrollViewportHeight(sectionRef, (projects.data ?? []).length > 0)
    const reduceMotion = useReducedMotion()

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

    const selectEnvironment = (nextEnvId: string | null) => {
        if (!projectId) return
        router.replace(nextEnvId ? `${basePath}/${projectId}?env=${nextEnvId}` : `${basePath}/${projectId}`)
    }

    if (projects.isLoading) {
        return (
            <div className="grid gap-4 lg:grid-cols-[340px_1fr]" aria-label="Carregando os ambientes">
                <Skeleton className="h-96" />
                <Skeleton className="h-96" />
            </div>
        )
    }
    if (projects.isError) return <ErrorState title="Não foi possível carregar os repositórios" description={apiErrorMessage(projects.error, "Tente novamente.")} onRetry={() => void projects.refetch()} />
    if ((projects.data ?? []).length === 0) {
        return <EmptyState icon={Boxes} title="Nenhum repositório disponível" description="Vincule um repositório no GitHub em Integrações › GitHub para gerenciar ambientes." />
    }
    if (!projectId) return <Skeleton className="h-96 w-full" />

    const selectedEnv = (list.data ?? []).find((env) => env.id === envId) ?? null

    return (
        <motion.section
            ref={sectionRef}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            style={height ? ({ "--ambientes-height": `${height}px` } as CSSProperties) : undefined}
            className="flex h-[var(--ambientes-height,calc(100dvh_-_3rem))] min-h-0 flex-col gap-4 lg:flex-row"
        >
            <EnvironmentListPanel
                context={context}
                basePath={basePath}
                projectId={projectId}
                projects={projects.data ?? []}
                projectsLoading={projects.isLoading}
                selectedEnvId={envId}
                onSelect={selectEnvironment}
                onSelectProject={(nextProjectId) => router.replace(`${basePath}/${nextProjectId}`)}
                className={cn(envId ? "max-lg:hidden" : "max-lg:flex-1 max-lg:min-h-0")}
            />
            <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", !envId && "max-lg:hidden")} data-testid="ambientes-detail-pane">
                {envId ? (
                    <>
                        <Button type="button" variant="ghost" size="sm" className="mb-2 w-fit shrink-0 gap-1.5 lg:hidden" onClick={() => selectEnvironment(null)}>
                            <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar para ambientes
                        </Button>
                        <EnvironmentDetailPanel context={context} basePath={basePath} projectId={projectId} envId={envId} initialEnv={selectedEnv} />
                    </>
                ) : (
                    <EmptyState icon={Boxes} title="Selecione um ambiente" description="Escolha um ambiente na lista para ver o compose, os logs, publicar e restaurar." />
                )}
            </div>
        </motion.section>
    )
}
