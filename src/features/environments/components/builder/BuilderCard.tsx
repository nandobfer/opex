"use client"

import { useState } from "react"
import { Hammer } from "lucide-react"
import { CadastroTableCard } from "@/components/list/CadastroTableCard"
import { ErrorState } from "@/components/feedback/ErrorState"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorMessage } from "@/lib/api"
import type { BuilderConfirmKind } from "../../builder-view"
import { useEnvironmentsBuilder, useEnvironmentsBuilderAction } from "../../hooks/useEnvironmentsBuilder"
import { BuilderConfirmDialog } from "./BuilderConfirmDialog"
import { BuilderFormDialog } from "./BuilderFormDialog"
import { BuilderRow } from "./BuilderRow"

/** Skeleton com a estrutura da linha: nome e selos, a linha de limites/uso, o link e os botões. */
function BuilderRowSkeleton() {
    return (
        <div className="flex flex-col gap-2 md:flex-row md:items-center" data-testid="builder-skeleton">
            <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-3 w-80 max-w-full" />
                <Skeleton className="h-3 w-48" />
            </div>
            <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-8 w-8" />
                ))}
            </div>
        </div>
    )
}

/** Card "Builder do servidor", acima dos grupos Servidor/PC da tela Ambientes. */
export function BuilderCard() {
    const query = useEnvironmentsBuilder()
    const action = useEnvironmentsBuilderAction()
    const [editing, setEditing] = useState(false)
    const [confirm, setConfirm] = useState<BuilderConfirmKind | null>(null)
    const builder = query.data
    return (
        <CadastroTableCard>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Hammer className="h-4 w-4" aria-hidden /> Builder do servidor
            </h2>
            {query.isLoading ? (
                <BuilderRowSkeleton />
            ) : query.isError || !builder ? (
                <ErrorState title="Não foi possível ler o builder do servidor" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : (
                <>
                    <BuilderRow builder={builder} pending={action.isPending} onAction={(input) => action.mutate(input)} onConfirm={setConfirm} onEdit={() => setEditing(true)} />
                    <BuilderFormDialog open={editing} builder={builder} onClose={() => setEditing(false)} />
                    <BuilderConfirmDialog kind={confirm} builder={builder} onClose={() => setConfirm(null)} onConfirm={(input) => action.mutate(input)} />
                </>
            )}
        </CadastroTableCard>
    )
}
