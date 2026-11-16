import { Skeleton } from "@/components/ui/skeleton"
import { GO_CHART_HEIGHT, GO_HEADER_ROW, GO_WINDOWS_GRID } from "./layout"

/** Carregamento do card da assinatura com a mesma estrutura do resultado: cabeçalho, três janelas e o gráfico. */
export function GoUsageSkeleton() {
    return (
        <div className="space-y-5" role="status" aria-label="Carregando consumo da assinatura">
            <div className={GO_HEADER_ROW}>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-4 w-72" />
                </div>
                <div className="flex flex-col items-end gap-1">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-3 w-20" />
                </div>
            </div>
            <div className={GO_WINDOWS_GRID}>
                {[0, 1, 2].map((index) => (
                    <div key={index} className="space-y-1">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-1.5 w-full" />
                    </div>
                ))}
            </div>
            <div className="space-y-2">
                <Skeleton className="w-full" style={{ height: GO_CHART_HEIGHT }} />
                <Skeleton className="h-4 w-64" />
            </div>
        </div>
    )
}
