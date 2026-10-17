"use client"

import { useUrlFilters, urlFilterCodecs } from "@/hooks/useUrlFilters"
import { useQuery } from "@tanstack/react-query"
import { differenceInSeconds, format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { useEnvironmentApi } from "../hooks/useEnvironments"
import type { Workflow, WorkflowRun } from "../server/github"
const defaults = { workflowAmbiente: "", branchAmbiente: "", paginaRuns: "1" }
const schema = {
    workflowAmbiente: urlFilterCodecs.string(),
    branchAmbiente: urlFilterCodecs.string(),
    paginaRuns: urlFilterCodecs.string(),
}

export function CiCdTab({ repoId }: { repoId: string }) {
    const api = useEnvironmentApi()
    const [filters, setFilters] = useUrlFilters(defaults, schema)
    const workflow = filters.workflowAmbiente
    const branch = filters.branchAmbiente
    const page = Math.max(1, Number.parseInt(filters.paginaRuns) || 1)
    const setWorkflow = (value: string) =>
        setFilters((previous) => ({ ...previous, workflowAmbiente: value, paginaRuns: "1" }))
    const setBranch = (value: string) =>
        setFilters((previous) => ({ ...previous, branchAmbiente: value, paginaRuns: "1" }))
    const query = useQuery({
        queryKey: [...api.key, repoId, "ci", workflow, branch, page],
        queryFn: () =>
            api.get<{ workflows: Workflow[]; runs: WorkflowRun[]; hasNext: boolean }>(
                `/${repoId}/ci-cd?${new URLSearchParams({ workflow, branch, page: String(page) })}`,
            ),
        refetchInterval: 15000,
    })
    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
                <Select value={workflow || "all"} onValueChange={(value) => setWorkflow(value === "all" ? "" : value)}>
                    <SelectTrigger className="w-full" aria-label="Workflow">
                        <SelectValue placeholder="Todos os workflows" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os workflows</SelectItem>
                        {query.data?.workflows.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                                {item.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input
                    aria-label="Branch"
                    placeholder="Filtrar por branch"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                />
            </div>
            {query.isLoading ? (
                <Skeleton className="h-48 w-full" />
            ) : query.isError ? (
                <ErrorState title="Falha ao carregar GitHub Actions" onRetry={() => void query.refetch()} />
            ) : !query.data?.runs.length ? (
                <p className="rounded-md border border-dashed p-6 text-sm">Nenhuma execução encontrada.</p>
            ) : (
                query.data.runs.map((run) => (
                    <article
                        key={run.id}
                        className={`rounded-md border p-4 text-sm ${run.status !== "completed" ? "border-primary bg-primary/10" : ""}`}
                    >
                        <a
                            href={run.html_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-primary underline"
                        >
                            {run.name}
                        </a>
                        <p>
                            {run.head_branch} · {run.conclusion ?? run.status} ·{" "}
                            {Math.max(
                                0,
                                differenceInSeconds(
                                    new Date(run.updated_at),
                                    new Date(run.run_started_at ?? run.created_at),
                                ),
                            )}{" "}
                            s
                        </p>
                        <p className="text-muted-foreground">
                            {format(new Date(run.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </p>
                    </article>
                ))
            )}
            <footer className="flex items-center justify-end gap-3">
                <Button
                    variant="outline"
                    disabled={page <= 1 || query.isFetching}
                    onClick={() => setFilters((previous) => ({ ...previous, paginaRuns: String(page - 1) }))}
                >
                    Anterior
                </Button>
                <span className="text-sm">Página {page}</span>
                <Button
                    variant="outline"
                    disabled={!query.data?.hasNext || query.isFetching}
                    onClick={() => setFilters((previous) => ({ ...previous, paginaRuns: String(page + 1) }))}
                >
                    Próxima
                </Button>
            </footer>
        </div>
    )
}
