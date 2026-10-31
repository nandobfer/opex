import { Skeleton } from "@/components/ui/skeleton"
import { TOKEN_ROW, TOKEN_ROW_ACTIONS, TOKEN_ROW_BODY } from "./api-token-row-layout"

/** Carregamento da lista de tokens: ícone, nome com prefixo, badges de escopo, metadados e ações. */
export function ApiTokenListSkeleton({ rows = 2 }: { rows?: number }) {
    return (
        <ul className="divide-y" data-testid="api-tokens-skeleton">
            {Array.from({ length: rows }, (_, index) => (
                <li key={index} className={TOKEN_ROW}>
                    <Skeleton className="mt-0.5 h-4 w-4 rounded-full" />
                    <div className={TOKEN_ROW_BODY}>
                        <Skeleton className="h-4 w-48" />
                        <div className="flex gap-1">
                            <Skeleton className="h-4 w-14 rounded-full" />
                            <Skeleton className="h-4 w-24 rounded-full" />
                        </div>
                        <Skeleton className="h-3 w-64" />
                    </div>
                    <div className={TOKEN_ROW_ACTIONS}>
                        <Skeleton className="h-8 w-28" />
                        <Skeleton className="h-8 w-20" />
                    </div>
                </li>
            ))}
        </ul>
    )
}
