import { Skeleton } from "@/components/ui/skeleton"
import { FAVORITE_FORM_GRID, FAVORITE_SWATCH, FAVORITE_TILE, FAVORITES_GRID } from "./settings-layout"

/** Carregamento das cores favoritas: a mesma grade de cartões e o formulário de adicionar. */
export function FavoriteColorsSkeleton() {
    return (
        <div className="space-y-5" data-testid="favorite-colors-skeleton">
            <div className={FAVORITES_GRID}>
                {Array.from({ length: 8 }, (_, index) => (
                    <div key={index} className={FAVORITE_TILE}>
                        <Skeleton className={FAVORITE_SWATCH} />
                        <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-3.5 w-20" />
                            <Skeleton className="h-3 w-14" />
                        </div>
                        <Skeleton className="h-6 w-6 rounded-md" />
                        <Skeleton className="h-6 w-6 rounded-md" />
                    </div>
                ))}
            </div>
            <div className={FAVORITE_FORM_GRID}>
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-28" />
            </div>
        </div>
    )
}
