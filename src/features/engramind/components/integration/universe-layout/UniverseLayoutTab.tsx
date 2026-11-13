"use client"

import { useState } from "react"
import { UNIVERSE_LAYOUT_PRESETS } from "@engramind/client"
import { Skeleton } from "@/components/ui/skeleton"
import { FORM_GRID } from "@/components/ui/form-grid"
import { useUniverseLayout } from "../../../hooks/useUniverseLayout"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { StaleFormNotice } from "../../shared/StaleFormNotice"
import { useFormSnapshot } from "../../shared/useFormSnapshot"
import { UniverseLayoutForm } from "./UniverseLayoutForm"
import { UNIVERSE_PRESETS_GRID } from "./UniverseLayoutPresets"
import { UniverseLayoutPreviewSkeleton } from "./UniverseLayoutPreview"

/** Aba Visualização (OPE-142): o layout único dos universos de memórias, com prévia, exportar e importar. */
export function UniverseLayoutTab({ onDirtyChange, onConfigure }: { onDirtyChange: (dirty: boolean) => void; onConfigure: () => void }) {
    const query = useUniverseLayout()
    const [dirty, setDirty] = useState(false)
    // Refazer a consulta (tempo real, reconexão) não descarta o rascunho: só remonta com conteúdo novo e sem alterações pendentes.
    const snapshot = useFormSnapshot(query.data, dirty)
    return (
        <QueryBoundary isLoading={query.isLoading} error={query.error} onRetry={() => void query.refetch()} skeleton={<UniverseLayoutSkeleton />} onConfigure={onConfigure}>
            <div className="flex flex-col gap-4">
                <StaleFormNotice stale={snapshot.stale} onReload={() => snapshot.adopt()} />
                {snapshot.data && (
                    <UniverseLayoutForm
                        key={snapshot.key}
                        saved={snapshot.data.config}
                        isDefault={snapshot.data.isDefault}
                        onDirtyChange={(next) => {
                            setDirty(next)
                            onDirtyChange(next)
                        }}
                        onSaved={async () => snapshot.adopt((await query.refetch()).data)}
                    />
                )}
            </div>
        </QueryBoundary>
    )
}

/** Mesma estrutura do resultado: cartão das predefinições, formulário em seções e a prévia ao lado. */
export function UniverseLayoutSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy="true" data-testid="universe-layout-skeleton">
            <div className="space-y-4 rounded-xl border p-6">
                <Skeleton className="h-5 w-48" />
                <div className={UNIVERSE_PRESETS_GRID}>
                    {UNIVERSE_LAYOUT_PRESETS.map((_, index) => (
                        <Skeleton key={index} className="h-16 w-full rounded-md" />
                    ))}
                </div>
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-6">
                    {[5, 5, 5, 2, 3].map((fields, section) => (
                        <div key={section} className="space-y-4 rounded-xl border p-6">
                            <Skeleton className="h-5 w-28" />
                            <div className={FORM_GRID}>
                                {Array.from({ length: fields }, (_, index) => (
                                    <Skeleton key={index} className="h-24 w-full rounded-lg" />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <UniverseLayoutPreviewSkeleton />
            </div>
        </div>
    )
}
