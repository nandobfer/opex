"use client"

import { useQuery } from "@tanstack/react-query"
import { differenceInSeconds, format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { Input } from "@/components/ui/input"
import { SearchPicker } from "@/components/ui/search-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { useUrlFilters, urlFilterCodecs } from "@/hooks/useUrlFilters"
import { useEnvironmentApi } from "../hooks/useEnvironments"
import type { Workflow, WorkflowRun } from "../server/github"
import { EnvironmentStatusBadge, type EnvironmentTone } from "./EnvironmentStatusBadge"

const defaults = { workflowAmbiente: "", branchAmbiente: "", paginaRuns: "1" }
const schema = {
    workflowAmbiente: urlFilterCodecs.string(),
    branchAmbiente: urlFilterCodecs.string(),
    paginaRuns: urlFilterCodecs.string(),
}

const ALL_WORKFLOWS = ""
type WorkflowOption = { id: string; name: string }

function runTone(run: WorkflowRun): { tone: EnvironmentTone; running: boolean } {
    if (run.status !== "completed") return { tone: "primary", running: true }
    if (run.conclusion === "success") return { tone: "emerald", running: false }
    if (run.conclusion === "cancelled" || run.conclusion === "skipped") return { tone: "muted", running: false }
    return { tone: "destructive", running: false }
}

/** Aba CI/CD: execuções do workflow do repositório, com filtros por workflow e branch. */
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
    const options: WorkflowOption[] = [
        { id: ALL_WORKFLOWS, name: "Todos os workflows" },
        ...(query.data?.workflows ?? []).map((item) => ({ id: String(item.id), name: item.name })),
    ]
    const activeWorkflow = options.find((item) => item.id === workflow) ?? options[0]!
    return (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">GitHub Actions</CardTitle>
                    <CardDescription>Execuções do workflow deste repositório, atualizadas a cada 15 segundos.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <SearchPicker<WorkflowOption>
                            trigger={<FieldTrigger id="ci-workflow" placeholder="Todos os workflows" value={activeWorkflow.name} />}
                            items={options}
                            getKey={(item) => item.id}
                            searchKeys={["name"]}
                            renderItem={(item) => <span className="truncate text-sm">{item.name}</span>}
                            onPick={(item) => setWorkflow(item.id)}
                            matchTriggerWidth
                            searchLabel="Buscar workflow"
                            listLabel="Workflows"
                            emptyText="Nenhum workflow"
                            emptySearchText="Nenhum workflow encontrado"
                        />
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
                            <Input
                                aria-label="Filtrar por branch"
                                placeholder="Filtrar por branch"
                                className="pl-8"
                                value={branch}
                                onChange={(event) => setBranch(event.target.value)}
                            />
                        </div>
                    </div>
                    {query.isLoading ? (
                        <Skeleton className="h-40 w-full" />
                    ) : query.isError ? (
                        <ErrorState title="Não foi possível carregar o GitHub Actions" onRetry={() => void query.refetch()} />
                    ) : !query.data?.runs.length ? (
                        <p className="text-sm text-muted-foreground">Nenhuma execução encontrada.</p>
                    ) : (
                        <ul className="divide-y">
                            {query.data.runs.map((run) => {
                                const status = runTone(run)
                                return (
                                    <li key={run.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <a
                                                href={run.html_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="min-w-0 flex-1 truncate font-medium hover:underline"
                                            >
                                                {run.name}
                                            </a>
                                            <EnvironmentStatusBadge
                                                label={run.conclusion ?? run.status}
                                                tone={status.tone}
                                                running={status.running}
                                            />
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            <span className="font-mono">{run.head_branch}</span> ·{" "}
                                            {format(new Date(run.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} ·{" "}
                                            {Math.max(
                                                0,
                                                differenceInSeconds(
                                                    new Date(run.updated_at),
                                                    new Date(run.run_started_at ?? run.created_at),
                                                ),
                                            )}
                                            s
                                        </p>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                    <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1 || query.isFetching}
                            onClick={() => setFilters((previous) => ({ ...previous, paginaRuns: String(page - 1) }))}
                        >
                            Anterior
                        </Button>
                        <span className="text-sm text-muted-foreground">Página {page}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!query.data?.hasNext || query.isFetching}
                            onClick={() => setFilters((previous) => ({ ...previous, paginaRuns: String(page + 1) }))}
                        >
                            Próxima
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
