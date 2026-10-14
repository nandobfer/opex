"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Boxes, Plus, Settings } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { cn } from "@/lib/utils"
import type { AmbientesApi } from "../hooks"
import { useEnvironmentList } from "../hooks"
import type { EnvironmentDto, EnvironmentProjectDto } from "../types"
import { EnvironmentRepoPicker } from "./EnvironmentRepoPicker"

/** Estado do ambiente como etiqueta: operação em andamento, no ar, parcial, parado ou host fora. */
export function EnvironmentStatusBadge({ env }: { env: EnvironmentDto }) {
    const operation = env.lastOperation
    if (operation?.status === "running" || operation?.status === "queued") return <Badge variant="default">Operando</Badge>
    if (!env.status.reachable) return <Badge variant="warning">Host indisponível</Badge>
    if (env.status.running && env.status.partial) return <Badge variant="warning">Parcial</Badge>
    if (env.status.running) return <Badge variant="success">No ar</Badge>
    return <Badge variant="secondary">Parado</Badge>
}

/**
 * Coluna esquerda do workspace: título com a contagem, seletor de repositório (com busca, no padrão
 * da coluna Tarefas), configuração do repositório, "Novo ambiente" e a lista dos ambientes.
 */
export function EnvironmentListPanel({
    context,
    basePath,
    projectId,
    projects,
    projectsLoading,
    selectedEnvId,
    onSelect,
    onSelectProject,
    className,
}: {
    context: AmbientesApi
    basePath: string
    projectId: string
    projects: readonly EnvironmentProjectDto[]
    projectsLoading: boolean
    selectedEnvId: string | null
    onSelect: (envId: string) => void
    onSelectProject: (projectId: string) => void
    className?: string
}) {
    const list = useEnvironmentList(context, projectId)
    const environments = list.data ?? []
    const active = projects.find((project) => project.id === projectId) ?? null

    return (
        <Card role="region" aria-label="Lista de ambientes" data-testid="ambientes-list-pane" className={cn("flex min-h-[420px] w-full flex-col overflow-hidden lg:min-h-0 lg:w-[340px] lg:shrink-0", className)}>
            <div className="space-y-2 border-b p-3">
                <h2 className="text-sm font-semibold">
                    Ambientes <span className="font-mono text-xs font-normal text-muted-foreground">{environments.length}</span>
                </h2>
                <div role="separator" aria-hidden className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
                <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <EnvironmentRepoPicker projects={projects} active={active} onSelect={onSelectProject} loading={projectsLoading} />
                    </div>
                    <Button asChild variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Configurações do repositório">
                        <Link href={`${basePath}/${projectId}/config`}>
                            <Settings className="h-4 w-4" aria-hidden />
                        </Link>
                    </Button>
                </div>
                <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href={`${basePath}/${projectId}/ambiente/novo`}>
                        <Plus className="mr-2 h-4 w-4" aria-hidden />
                        Novo ambiente
                    </Link>
                </Button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1.5">
                {list.isLoading ? (
                    <div className="space-y-2 p-1.5" aria-label="Carregando ambientes">
                        {Array.from({ length: 5 }, (_, index) => (
                            <Skeleton key={index} className="h-14 w-full" />
                        ))}
                    </div>
                ) : list.isError ? (
                    <ErrorState title="Não foi possível carregar os ambientes" onRetry={() => void list.refetch()} />
                ) : environments.length === 0 ? (
                    <EmptyState icon={Boxes} title="Nenhum ambiente" description="Crie um ambiente para gerenciar os containers deste repositório." />
                ) : (
                    environments.map((env) => (
                        <motion.button
                            key={env.id}
                            type="button"
                            layout
                            whileHover={{ x: 2 }}
                            onClick={() => onSelect(env.id)}
                            aria-current={selectedEnvId === env.id ? "true" : undefined}
                            className={cn(
                                "flex flex-col gap-1 rounded-md px-2.5 py-1.5 text-left transition-colors",
                                selectedEnvId === env.id ? "bg-primary/15" : "hover:bg-muted/50",
                            )}
                        >
                            <span className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate text-sm font-medium">{env.name}</span>
                                <EnvironmentStatusBadge env={env} />
                            </span>
                            <span className="truncate font-mono text-[11px] text-muted-foreground">{env.branch}</span>
                        </motion.button>
                    ))
                )}
            </div>
        </Card>
    )
}
