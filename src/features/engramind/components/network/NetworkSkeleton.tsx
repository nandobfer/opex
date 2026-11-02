import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { NETWORK_CANVAS_CLASS, NETWORK_SKELETON_AREA_CLASS, NETWORK_STATS_CLASS, NETWORK_STATS_TOGGLE_CLASS } from "./layout-classes"

/** Agentes em volta do centro e os canais de cada um em órbita ("Canais junto dos agentes", o padrão). */
const SKELETON_AGENTS = [0, 1, 2].map((index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 3
    return { x: Math.cos(angle) * 150, y: Math.sin(angle) * 120, angle }
})

/**
 * Skeleton com as dimensões da rede: área do canvas (mesmo fundo), a visão inicial na distribuição
 * padrão (agentes em volta do centro, cada um com os seus canais em órbita, OPE-113) e o card de
 * estatísticas (a barra fica fora da carga). No celular, o card aparece recolhido (o botão do canto),
 * como na rede.
 */
export function NetworkSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn(NETWORK_CANVAS_CLASS, className)} aria-busy="true" data-testid="network-skeleton">
            <div className={NETWORK_SKELETON_AREA_CLASS} data-testid="network-skeleton-area">
                <div className="relative h-0 w-0">
                    {SKELETON_AGENTS.map((agent, index) => (
                        <div key={index}>
                            <Skeleton className="absolute h-11 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: agent.x, top: agent.y }} data-testid="network-skeleton-agent" />
                            {[-0.7, 0.7].map((turn) => (
                                <Skeleton
                                    key={turn}
                                    className="absolute h-12 w-44 -translate-x-1/2 -translate-y-1/2 rounded-xl"
                                    style={{ left: agent.x + Math.cos(agent.angle + turn) * 150, top: agent.y + Math.sin(agent.angle + turn) * 110 }}
                                    data-testid="network-skeleton-channel"
                                />
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
