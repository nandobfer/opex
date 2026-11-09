import { Skeleton } from "@/components/ui/skeleton"

/** Linhas de carregamento da `ResourceListCard` (mesma altura das linhas reais). */
export function ResourceListSkeleton({ rows = 3 }: { rows?: number }) {
    return (
        <div className="space-y-2" aria-label="Carregando">
            {Array.from({ length: rows }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
            ))}
        </div>
    )
}
