"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { MemoriesNotices } from "@/features/ai/components/memories/MemoriesNotices"
import { useMemoriesMeta } from "@/features/ai/hooks/useMemories"
import { useMemoryMigration } from "../../../hooks/useMemoryMigration"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { BackupStep } from "./BackupStep"
import { CuratorStep } from "./CuratorStep"
import { ImportStep } from "./ImportStep"
import { ReviewStep } from "./ReviewStep"

/**
 * Aba "Migração de memórias" (OPE-104): backup → curador → revisão do dono → importação. As etapas rodam
 * no servidor (continuam com a tela fechada) e o progresso chega em tempo real (`migration.updated`).
 */
export function MigrationTab({ onConfigure }: { onDirtyChange: (dirty: boolean) => void; onConfigure: () => void }) {
    const migration = useMemoryMigration()
    const meta = useMemoriesMeta()
    return (
        <QueryBoundary isLoading={migration.isLoading} error={migration.error} onRetry={() => void migration.refetch()} skeleton={<MigrationSkeleton />} onConfigure={onConfigure}>
            {migration.data && (
                <div className="flex flex-col gap-6">
                    <MemoriesNotices meta={meta.data} />
                    <BackupStep state={migration.data} />
                    <CuratorStep state={migration.data} />
                    <ReviewStep state={migration.data} />
                    <ImportStep state={migration.data} />
                </div>
            )}
        </QueryBoundary>
    )
}

export function MigrationSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy="true" data-testid="migration-skeleton">
            {[0, 1, 2, 3].map((index) => (
                <div key={index} className="space-y-3 rounded-xl border p-6">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-16 w-full" />
                </div>
            ))}
        </div>
    )
}
