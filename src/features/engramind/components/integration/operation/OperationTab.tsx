"use client"

import { Skeleton } from "@/components/ui/skeleton"
import type { EngramindStatus } from "../../../types"
import { useEngramindQuery } from "../../../hooks/useEngramind"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { AuditCard } from "./AuditCard"
import { JobsCard } from "./JobsCard"
import { LlmCallsCard } from "./LlmCallsCard"
import { StatusCard } from "./StatusCard"
import { UsageCard } from "./UsageCard"

/** Aba Operação: status, jobs (com retentar), chamadas ao LLM, consumo e auditoria. */
export function OperationTab({ onConfigure }: { onDirtyChange: (dirty: boolean) => void; onConfigure: () => void }) {
    const status = useEngramindQuery<EngramindStatus>("status", undefined, { refetchInterval: 10_000 })
    return (
        <QueryBoundary isLoading={status.isLoading} error={status.error} onRetry={() => void status.refetch()} skeleton={<OperationSkeleton />} onConfigure={onConfigure}>
            <div className="flex flex-col gap-6">
                {status.data && <StatusCard status={status.data} />}
                <JobsCard />
                <LlmCallsCard />
                <UsageCard />
                <AuditCard />
            </div>
        </QueryBoundary>
    )
}

function OperationSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy="true">
            <div className="grid gap-3 rounded-xl border p-6 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 9 }, (_, index) => (
                    <Skeleton key={index} className="h-16 w-full rounded-lg" />
                ))}
            </div>
            {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-56 w-full rounded-xl" />
            ))}
        </div>
    )
}
