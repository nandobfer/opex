import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { NETWORK_CANVAS_CLASS, NETWORK_STATS_CLASS } from "./layout-classes"

/**
 * Skeleton com as dimensões da rede: área do canvas (mesmo fundo), a linha de agentes em cima, a de
 * canais embaixo e o card de estatísticas (a barra fica fora da carga).
 */
export function NetworkSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn(NETWORK_CANVAS_CLASS, className)} aria-busy="true" data-testid="network-skeleton">
            <div className="absolute inset-y-0 left-0 right-72 flex flex-col justify-center gap-40 px-10" data-testid="network-skeleton-rows">
                <div className="flex justify-center gap-6">
                    {[0, 1, 2, 3].map((index) => (
                        <Skeleton key={index} className="h-11 w-40 rounded-full" />
                    ))}
                </div>
                <div className="flex justify-center gap-6">
                    {[0, 1, 2, 3, 4].map((index) => (
                        <Skeleton key={index} className="h-16 w-60 rounded-xl" />
                    ))}
                </div>
            </div>
            <div className={NETWORK_STATS_CLASS}>
                <Skeleton className="mb-3 h-4 w-24" />
                {[0, 1, 2, 3, 4].map((index) => (
                    <Skeleton key={index} className="mb-2 h-3 w-full" />
                ))}
            </div>
        </div>
    )
}
