import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { NETWORK_CANVAS_CLASS, NETWORK_SKELETON_ROW_CLASS, NETWORK_SKELETON_ROWS_CLASS, NETWORK_STATS_CLASS, NETWORK_STATS_TOGGLE_CLASS } from "./layout-classes"

/**
 * Skeleton com as dimensões da rede: área do canvas (mesmo fundo), a linha de agentes em cima e duas
 * linhas de canais embaixo, com a mesma largura (layout balanceado da visão inicial) e o card de estatísticas (a barra fica fora da carga). No celular, o card aparece
 * recolhido (o botão do canto), como na rede.
 */
export function NetworkSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn(NETWORK_CANVAS_CLASS, className)} aria-busy="true" data-testid="network-skeleton">
            <div className={NETWORK_SKELETON_ROWS_CLASS} data-testid="network-skeleton-rows">
                <div className={NETWORK_SKELETON_ROW_CLASS} data-testid="network-skeleton-agents">
                    {[0, 1, 2, 3].map((index) => (
                        <Skeleton key={index} className="h-11 w-40 rounded-full" />
                    ))}
                </div>
                <div className="flex flex-col gap-10" data-testid="network-skeleton-channels">
                    {[0, 1].map((row) => (
                        <div key={row} className={NETWORK_SKELETON_ROW_CLASS}>
                            {[0, 1, 2].map((index) => (
                                <Skeleton key={index} className="h-16 w-56 rounded-xl" />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            <div className={cn(NETWORK_STATS_TOGGLE_CLASS, "md:hidden")} data-testid="network-skeleton-stats-toggle">
                <Skeleton className="h-4 w-24" />
            </div>
            <div className={cn(NETWORK_STATS_CLASS, "max-md:hidden")}>
                <Skeleton className="mb-3 h-4 w-24" />
                {[0, 1, 2, 3, 4].map((index) => (
                    <Skeleton key={index} className="mb-2 h-3 w-full" />
                ))}
            </div>
        </div>
    )
}
