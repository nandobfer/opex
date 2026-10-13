"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Boxes, Plus, Settings } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { cn } from "@/lib/utils"
import type { AmbientesApi } from "../hooks"
import { useEnvironmentList, useEnvironmentProjects } from "../hooks"
import type { EnvironmentDto } from "../types"

function envStatusBadge(env: EnvironmentDto) {
    const operation = env.lastOperation
    if (operation?.status === "running" || operation?.status === "queued") return <Badge variant="default">Operando</Badge>
    if (env.status.running) return <Badge variant="success">No ar</Badge>
    return <Badge variant="secondary">Parado</Badge>
}

/** Coluna esquerda: seletor de repositório, configuração, "Novo ambiente" e a lista de ambientes. */
export function EnvironmentListPanel({
    context,
    basePath,
    projectId,
    selectedEnvId,
    onSelect,
}: {
    context: AmbientesApi
    basePath: string
    projectId: string
    selectedEnvId: string | null
    onSelect: (envId: string) => void
}) {
    const projects = useEnvironmentProjects(context)
    const list = useEnvironmentList(context, projectId)

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center gap-2">
                <Select value={projectId} onValueChange={(value) => { window.location.href = `${basePath}/${value}` }}>
                    <SelectTrigger className="h-9 flex-1" aria-label="Repositório">
                        <SelectValue placeholder="Selecione o repositório" />
                    </SelectTrigger>
                    <SelectContent>
                        {(projects.data ?? []).map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                                {project.repo}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button asChild variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Configurações do repositório">
                    <Link href={`${basePath}/${projectId}/config`}>
                        <Settings className="h-4 w-4" aria-hidden />
                    </Link>
                </Button>
            </div>

            <Button asChild variant="outline" size="sm">
                <Link href={`${basePath}/${projectId}/ambiente/novo`}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden />
                    Novo ambiente
                </Link>
            </Button>

            <div className="flex min-h-0 flex-1 flex-col gap-2">
                {list.isLoading ? (
                    <>
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                    </>
                ) : list.isError ? (
                    <ErrorState title="Não foi possível carregar os ambientes" onRetry={() => void list.refetch()} />
                ) : (list.data ?? []).length === 0 ? (
                    <EmptyState icon={Boxes} title="Nenhum ambiente" description="Crie um ambiente para gerenciar os containers deste repositório." />
                ) : (
                    (list.data ?? []).map((env) => (
                        <motion.button
                            key={env.id}
                            type="button"
                            layout
                            whileHover={{ x: 2 }}
                            onClick={() => onSelect(env.id)}
                            className={cn(
                                "flex flex-col gap-1 rounded-md border p-3 text-left transition-colors",
                                selectedEnvId === env.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50",
                            )}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium">{env.name}</span>
                                {envStatusBadge(env)}
                            </div>
                            <span className="truncate text-xs text-muted-foreground">{env.branch}</span>
                        </motion.button>
                    ))
                )}
            </div>
        </div>
    )
}
