"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Settings } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { NEW_ENVIRONMENT_ID } from "../constants"
import { useCreateEnvironment, useEnvironmentDetail, useUpdateEnvironment, type AmbientesApi } from "../hooks"
import type { EnvironmentInput } from "../types"
import { AmbientesPage } from "./AmbientesPage"
import { EnvironmentRepoConfigForm } from "./EnvironmentRepoConfigForm"
import { EnvironmentForm } from "./EnvironmentForm"

/**
 * Páginas do módulo Ambientes, parametrizadas pelo `context` (dono/portal) e pelo `basePath` das
 * rotas. As páginas do App Router são cascas finas que montam o contexto.
 */

export function AmbientesWorkspaceRoute({
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
    return <AmbientesPage context={context} basePath={basePath} projectId={projectId} envId={envId} storageScope={storageScope} />
}

export function AmbientesConfigRoute({ context, basePath, projectId, isOwner }: { context: AmbientesApi; basePath: string; projectId: string; isOwner: boolean }) {
    return (
        <div className="flex flex-col gap-6">
            <header className="space-y-1">
                <Link href={`${basePath}/${projectId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    Voltar para os ambientes
                </Link>
                <h1 className="flex items-center gap-2 text-lg font-semibold md:text-2xl">
                    <Settings className="h-5 w-5 text-primary" aria-hidden />
                    Configuração do repositório
                </h1>
                <p className="text-sm text-muted-foreground">Como o Opex acessa e faz o deploy neste repositório.</p>
            </header>
            <EnvironmentRepoConfigForm context={context} projectId={projectId} isOwner={isOwner} />
        </div>
    )
}

export function AmbientesFormRoute({
    context,
    basePath,
    projectId,
    envId,
    isOwner,
}: {
    context: AmbientesApi
    basePath: string
    projectId: string
    envId: string
    isOwner: boolean
}) {
    const router = useRouter()
    const isNew = envId === NEW_ENVIRONMENT_ID
    const detail = useEnvironmentDetail(context, isNew ? "" : envId)
    const create = useCreateEnvironment(context, projectId)
    const update = useUpdateEnvironment(context, envId, projectId)

    const goBack = () => router.push(`${basePath}/${projectId}`)
    const onSubmit = (input: EnvironmentInput) => {
        if (isNew) create.mutate(input, { onSuccess: () => goBack() })
        else update.mutate(input, { onSuccess: () => goBack() })
    }

    if (!isNew && detail.isLoading) return <Skeleton className="h-64 w-full" />
    const env = isNew ? null : detail.data ?? null

    return (
        <div className="flex flex-col gap-6">
            <header className="space-y-1">
                <Link href={`${basePath}/${projectId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    Voltar para os ambientes
                </Link>
                <h1 className="text-lg font-semibold md:text-2xl">{isNew ? "Novo ambiente" : `Editar ${env?.name ?? "ambiente"}`}</h1>
                <p className="text-sm text-muted-foreground">Branch, compose, limites, variáveis e healthcheck do ambiente.</p>
            </header>
            <EnvironmentForm env={env} isOwner={isOwner} submitting={create.isPending || update.isPending} onSubmit={onSubmit} />
        </div>
    )
}
