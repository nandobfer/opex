import { Skeleton } from "@/components/ui/skeleton"
import { HOST_HEADER_CLASS, HOST_PANEL_CLASS, HOST_ROWS_CLASS } from "./host-metrics-layout"

/** Carregando o bloco Servidor: cabeçalho e as quatro linhas (rótulo + barra), nas mesmas dimensões. */
export function HostMetricsSkeleton() {
    return (
        <div className={HOST_PANEL_CLASS} aria-label="Carregando recursos do servidor" data-testid="host-metrics-skeleton">
            <div className={HOST_HEADER_CLASS}>
                <Skeleton className="h-3.5 w-3.5 rounded-sm" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="ml-auto h-6 w-6 rounded-sm" />
            </div>
            <div className={HOST_ROWS_CLASS}>
                {Array.from({ length: 4 }, (_, index) => (
                    <div key={index} className="space-y-1" data-testid="host-metrics-skeleton-row">
                        <div className="flex h-[16.5px] items-center justify-between gap-2">
                            <Skeleton className="h-2.5 w-10" />
                            <Skeleton className="h-2.5 w-20" />
                        </div>
                        <Skeleton className="h-1.5 w-full rounded-full" />
                    </div>
                ))}
            </div>
        </div>
    )
}
