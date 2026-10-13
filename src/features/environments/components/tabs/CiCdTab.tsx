"use client"

import { useState } from "react"
import { ExternalLink, GitBranch, Workflow } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { EmptyState } from "@/components/feedback/EmptyState"
import { useCiCd, type AmbientesApi } from "../../hooks"

const ALL = "__all__"

function statusVariant(status: string, conclusion: string | null): "default" | "success" | "warning" | "destructive" | "secondary" {
    if (status !== "completed") return "default"
    if (conclusion === "success") return "success"
    if (conclusion === "failure" || conclusion === "cancelled") return "destructive"
    return "secondary"
}

/** Aba CI/CD: runs de todos os workflows do repositório, com filtro por workflow e branch. */
export function CiCdTab({ context, projectId, branch }: { context: AmbientesApi; projectId: string; branch: string }) {
    const [workflow, setWorkflow] = useState<string>(ALL)
    const [branchFilter, setBranchFilter] = useState<string>(branch)
    const query = useCiCd(context, projectId, { workflow: workflow === ALL ? undefined : workflow, branch: branchFilter.trim() || undefined }, true)

    if (query.isLoading) return <Skeleton className="h-40 w-full" />
    if (query.isError) return <ErrorState title="Não foi possível carregar o CI/CD" description="Confira o token do GitHub." onRetry={() => void query.refetch()} />

    const { runs, workflows } = query.data ?? { runs: [], workflows: [] }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
                <Select value={workflow} onValueChange={setWorkflow}>
                    <SelectTrigger className="w-full sm:w-64" aria-label="Workflow">
                        <SelectValue placeholder="Todos os workflows" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>Todos os workflows</SelectItem>
                        {workflows.map((item) => (
                            <SelectItem key={item.id} value={item.path}>
                                {item.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <input
                    aria-label="Branch"
                    value={branchFilter}
                    onChange={(event) => setBranchFilter(event.target.value)}
                    placeholder="Branch"
                    className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                />
            </div>

            {runs.length === 0 ? (
                <EmptyState icon={Workflow} title="Nenhuma execução" description="Ajuste os filtros ou rode um pipeline no repositório." />
            ) : (
                <ul className="space-y-2">
                    {runs.map((run) => (
                        <li key={run.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                    #{run.runNumber} · {run.name}
                                </p>
                                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <GitBranch className="h-3 w-3" aria-hidden />
                                    {run.branch ?? "—"} · {run.event}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <Badge variant={statusVariant(run.status, run.conclusion)}>{run.status === "completed" ? run.conclusion ?? "concluído" : run.status}</Badge>
                                <a href={run.htmlUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Abrir execução">
                                    <ExternalLink className="h-4 w-4" aria-hidden />
                                </a>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
