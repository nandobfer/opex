import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { RUN_ASIDE, RUN_CARD, RUN_PAGE_CLASS, RUN_PAGE_GRID } from "./run-page-layout"

/** Carregamento da página da execução: cabeçalho e as duas colunas com as mesmas classes (OPE-208). */
export function RoutineRunPageSkeleton() {
    return (
        <div className={RUN_PAGE_CLASS} aria-busy="true" aria-label="Carregando a execução" data-testid="routine-run-page-skeleton">
            <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
                <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-6 w-48 max-w-full md:h-8" />
                    <Skeleton className="h-4 w-72 max-w-full" />
                </div>
            </div>
            <div className={RUN_PAGE_GRID}>
                <div className={cn(RUN_CARD, "space-y-5")}>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-4 w-20" />
                    {[0, 1, 2, 3, 4].map((index) => (
                        <Skeleton key={index} className="h-10 w-full" />
                    ))}
                </div>
                <div className={RUN_ASIDE}>
                    <div className={cn(RUN_CARD, "grid grid-cols-2 gap-3")}>
                        {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
                            <Skeleton key={index} className="h-9 w-full" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
