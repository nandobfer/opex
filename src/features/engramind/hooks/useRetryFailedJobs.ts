"use client"

import { useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { EngramindJob } from "../types"
import { batchScope, collectFailedJobIds, retryErrorMessage, runRetryBatch, summarizeRetryBatch, type JobsPage } from "../job-retry-batch"
import { areaKey, engramindGet, engramindSend, route, useEngramindQuery } from "./useEngramind"

export type RetryBatchPhase = "idle" | "collecting" | "confirming" | "running"

const NO_FAILED = "Não há jobs falhos com esses filtros."

/**
 * Lote "Retentar todos" do card Jobs (OPE-150): coleta os `failed` do escopo dos filtros, pede
 * confirmação com a contagem exata e retenta pelo endpoint individual, com progresso e resumo.
 */
export function useRetryFailedJobs({ kind, state }: { kind?: string; state?: string }) {
    const queryClient = useQueryClient()
    const scope = batchScope(kind, state)
    const probe = useEngramindQuery<{ jobs?: EngramindJob[] }>(scope.ok ? "jobs" : null, { kind, state: "failed", limit: 1 })
    const [phase, setPhase] = useState<RetryBatchPhase>("idle")
    const [targets, setTargets] = useState<{ ids: string[]; truncated: boolean; kind?: string }>({ ids: [], truncated: false })
    const [progress, setProgress] = useState({ done: 0, total: 0 })
    const busy = useRef(false)

    const hasFailed = (probe.data?.jobs?.length ?? 0) > 0
    const blockedReason = !scope.ok ? scope.reason : probe.isLoading ? null : !hasFailed ? NO_FAILED : null
    const refresh = () => {
        for (const area of ["jobs", "status"]) void queryClient.invalidateQueries({ queryKey: areaKey(area) })
    }

    async function start() {
        if (busy.current || !scope.ok) return
        busy.current = true
        setPhase("collecting")
        try {
            const collected = await collectFailedJobIds((params) => engramindGet<JobsPage>("jobs", params), { kind: scope.kind })
            if (collected.ids.length === 0) {
                toast.info(NO_FAILED)
                refresh()
                setPhase("idle")
                return
            }
            setTargets({ ...collected, kind: scope.kind })
            setPhase("confirming")
        } catch (error) {
            toast.error("Não foi possível listar os jobs falhos.", { description: retryErrorMessage(error) })
            setPhase("idle")
        } finally {
            busy.current = false
        }
    }

    async function confirm() {
        if (busy.current || phase !== "confirming") return
        busy.current = true
        setPhase("running")
        setProgress({ done: 0, total: targets.ids.length })
        try {
            const result = await runRetryBatch(targets.ids, (id) => engramindSend("post", route("jobs", id, "retry"), {}), { onProgress: (done, total) => setProgress({ done, total }) })
            const summary = summarizeRetryBatch(result)
            toast[summary.tone](summary.title, summary.description ? { description: summary.description } : undefined)
        } finally {
            refresh()
            busy.current = false
            setPhase("idle")
        }
    }

    const cancel = () => {
        if (phase === "confirming") setPhase("idle")
    }

    return { blockedReason, phase, progress, targets, running: phase === "collecting" || phase === "running", start, confirm, cancel }
}

export type RetryFailedJobsState = ReturnType<typeof useRetryFailedJobs>
