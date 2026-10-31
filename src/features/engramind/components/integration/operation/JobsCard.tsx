"use client"

import { useState } from "react"
import { ListChecks, RotateCw } from "lucide-react"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { EmptyState } from "@/components/feedback/EmptyState"
import { VirtualizedRows } from "@/components/list/VirtualizedRows"
import { JOB_KINDS, JOB_STATES } from "../../../constants"
import { JOB_KIND_HELP, JOB_OUTCOME_HELP, JOB_STATE_HELP } from "../../../help/operation"
import type { EngramindJob } from "../../../types"
import { engramindSend, route, useEngramindList, useEngramindMutation } from "../../../hooks/useEngramind"
import { HelpBadge, toneOf } from "../../shared/Badges"
import { FilterSelect } from "../../shared/FilterSelect"
import { formatDateTime } from "../../shared/format"
import { LoadMore } from "../../shared/LoadMore"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { ListSkeleton } from "../../shared/ListSkeleton"
import { Section } from "../../shared/Section"

/** Jobs da fila (redact, embed, webhook) com filtro por tipo e estado e "Retentar" nos falhos. */
export function JobsCard() {
    const [kind, setKind] = useState<string | undefined>(undefined)
    const [state, setState] = useState<string | undefined>(undefined)
    const jobs = useEngramindList<EngramindJob>("jobs", "jobs", { kind, state })
    const retry = useEngramindMutation((id: string) => engramindSend("post", route("jobs", id, "retry"), {}), { invalidate: ["jobs", "status"], success: "Job recolocado na fila" })
    return (
        <Section title="Jobs" info="Trabalho assíncrono do Engramind, numa fila em tabela (sem broker).">
            <div className="grid gap-2 sm:grid-cols-2">
                <FilterSelect id="jobs-kind" label="Tipo" value={kind} options={JOB_KINDS} onChange={setKind} help={JOB_KIND_HELP} />
                <FilterSelect id="jobs-state" label="Estado" value={state} options={JOB_STATES} onChange={setState} help={JOB_STATE_HELP} />
            </div>
            <QueryBoundary isLoading={jobs.isLoading} error={jobs.error} onRetry={() => void jobs.refetch()} skeleton={<ListSkeleton rows={4} />}>
                {jobs.items.length === 0 ? (
                    <EmptyState icon={ListChecks} title="Nenhum job" description="Nada na fila com esses filtros." />
                ) : (
                    <div className="max-h-[28rem] overflow-auto rounded-lg border">
                        <VirtualizedRows
                            rows={jobs.items}
                            rowKey={(job) => String(job.id)}
                            estimateSize={56}
                            rowClassName="border-b last:border-b-0"
                            renderRow={(job) => (
                                <div className="flex flex-wrap items-center gap-2 p-2.5 text-xs">
                                    <span className="font-mono">#{job.id}</span>
                                    <HelpBadge value={job.kind} help={JOB_KIND_HELP[job.kind]} />
                                    <HelpBadge value={job.state} tone={toneOf(job.state)} help={JOB_STATE_HELP[job.state]} />
                                    {job.outcome && <HelpBadge value={job.outcome} help={JOB_OUTCOME_HELP[job.outcome]} />}
                                    <span className="text-muted-foreground">{job.attempts} tentativa(s) · {formatDateTime(job.created_at)}</span>
                                    {job.last_error && <span className="w-full text-destructive">{job.last_error}</span>}
                                    {job.state === "failed" && (
                                        <TooltipIconButton label="Retentar job" tooltip="Recoloca na fila com as tentativas zeradas" onClick={() => retry.mutate(String(job.id))} className="ml-auto">
                                            <RotateCw aria-hidden />
                                        </TooltipIconButton>
                                    )}
                                </div>
                            )}
                        />
                    </div>
                )}
            </QueryBoundary>
            <LoadMore hasNextPage={Boolean(jobs.hasNextPage)} isFetchingNextPage={jobs.isFetchingNextPage} fetchNextPage={jobs.fetchNextPage} />
        </Section>
    )
}
