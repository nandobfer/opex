import { Skeleton } from "@/components/ui/skeleton"
import { TaskRowSkeleton } from "../TaskRow"

/**
 * Carregamento da coluna Tarefas no celular (`< lg`, OPE-166), no formato do `TasksMobileHeader`: título com
 * os três botões de 40 px, a busca e as linhas da lista. Escondido a partir de `lg`.
 */
export function TasksPaneMobileSkeleton() {
    return (
        <div className="lg:hidden" data-testid="tasks-pane-mobile-skeleton">
            <div className="space-y-2 border-b px-3 pb-2.5 pt-1">
                <div className="flex items-center gap-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="ml-auto h-10 w-10" />
                    <Skeleton className="h-10 w-10" />
                    <Skeleton className="h-10 w-10" />
                </div>
                <Skeleton className="h-10 w-full" />
            </div>
            <div className="px-1.5 py-0.5">
                {Array.from({ length: 5 }, (_, index) => (
                    <TaskRowSkeleton key={index} compact />
                ))}
            </div>
        </div>
    )
}
