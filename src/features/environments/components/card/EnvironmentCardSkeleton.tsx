import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { CONTAINER_GRID, CONTAINER_ROW_CLASS, CONTAINER_USAGE_CLASS, ENV_CARD_ACTIONS_CLASS, ENV_CARD_CLASS, ENV_CARD_FOOTER_CLASS, ENV_CARD_HEADER_CLASS, ENV_CARD_LIST_CLASS, ENV_CARD_SECTION_CLASS, ENV_CARD_TITLE_CLASS, ENV_USAGE_GRID_CLASS, ENV_USAGE_SUMMARY_CLASS } from "./environment-card-layout"

/** Uma linha de barra de uso (rótulo + barra), nas dimensões da `UsageBar`. */
const BarSkeleton = () => (
    <div className="space-y-1" data-skeleton-usage-bar>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-1.5 w-full" />
    </div>
)
const METRICS = 4

/** Skeleton da lista de ambientes em cards (mesmas classes do card real). */
export function EnvironmentCardSkeleton({ variant = "owner", cards = 3, containers = 2 }: { variant?: keyof typeof CONTAINER_GRID; cards?: number; containers?: number }) {
    return (
        <div className={ENV_CARD_LIST_CLASS} aria-busy="true" aria-label="Carregando ambientes" data-testid="environment-card-skeleton">
            {Array.from({ length: cards }, (_, card) => (
                <Card key={card} className={ENV_CARD_CLASS}>
                    <div className={ENV_CARD_HEADER_CLASS}>
                        <div className={ENV_CARD_TITLE_CLASS}>
                            <div className="min-w-0 flex-1 space-y-2">
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-5 w-48" />
                                <div className="flex gap-2">
                                    <Skeleton className="h-5 w-16" />
                                    <Skeleton className="h-5 w-20" />
                                </div>
                            </div>
                        </div>
                        <div className={ENV_CARD_ACTIONS_CLASS}>
                            <Skeleton className="h-8 w-24" />
                            {variant === "owner" && <Skeleton className="h-8 w-20" />}
                            <Skeleton className="h-8 w-8" />
                        </div>
                    </div>
                    <div className={ENV_CARD_SECTION_CLASS}>
                        {variant === "owner" && (
                            <div className={ENV_USAGE_SUMMARY_CLASS} data-skeleton-usage-summary>
                                <Skeleton className="mb-1.5 h-3 w-24" />
                                <div className={ENV_USAGE_GRID_CLASS}>
                                    {Array.from({ length: METRICS }, (_, bar) => (
                                        <BarSkeleton key={bar} />
                                    ))}
                                </div>
                            </div>
                        )}
                        {Array.from({ length: containers }, (_, row) => (
                            <div key={row} className={cn(CONTAINER_ROW_CLASS, CONTAINER_GRID[variant])}>
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-3 w-20" />
                                <Skeleton className="h-6 w-36" />
                                {variant === "owner" && (
                                    <div className={CONTAINER_USAGE_CLASS}>
                                        {Array.from({ length: METRICS }, (_, bar) => (
                                            <BarSkeleton key={bar} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className={ENV_CARD_FOOTER_CLASS}>
                        <Skeleton className="h-3 w-56" />
                        <Skeleton className="h-3 w-16" />
                    </div>
                </Card>
            ))}
        </div>
    )
}
