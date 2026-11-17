import { Skeleton } from "@/components/ui/skeleton"
import { GO_CHART_HEIGHT, GO_HEADER_ROW, GO_WINDOWS_GRID } from "./layout"

/** Carregamento com a mesma estrutura do resultado: % grande e status, três janelas, gráfico com a faixa de datas e o rodapé. */
export function GoUsageSkeleton() {
    return (
        <div className="space-y-5" role="status" aria-label="Carregando consumo da assinatura">
            <div className={GO_HEADER_ROW}>
                <div className="space-y-2">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-4 w-80" />
                </div>
                <Skeleton className="mt-1 h-3 w-36" />
            </div>
            <div className={GO_WINDOWS_GRID}>
                {[0, 1, 2].map((index) => (
                    <div key={index} className="space-y-1">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-1.5 w-full" />
                    </div>
                ))}
            </div>
            <div className="space-y-3">
                <Skeleton className="w-full" style={{ height: GO_CHART_HEIGHT }} />
                <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-56" />
                </div>
            </div>
        </div>
    )
}
