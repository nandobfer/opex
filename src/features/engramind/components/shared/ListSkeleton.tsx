import { Skeleton } from "@/components/ui/skeleton"

/** Skeleton das listas do Engramind (linhas com borda, na altura das linhas reais). */
export function ListSkeleton({ rows = 4, rowClassName = "h-14" }: { rows?: number; rowClassName?: string }) {
    return (
        <div className="space-y-2 rounded-lg border p-2" aria-busy="true" data-testid="list-skeleton">
            {Array.from({ length: rows }, (_, index) => (
                <Skeleton key={index} className={`${rowClassName} w-full`} />
            ))}
        </div>
    )
}
