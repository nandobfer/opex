import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { DEV_CENTER_PANE_BLEED_CLASS } from "../pane-classes"
import { TaskRowSkeleton } from "../TaskRow"
import { TASKS_MOBILE_HEADER_CLASS, TASKS_MOBILE_ICON_BUTTON_CLASS, TASKS_MOBILE_SEARCH_CLASS, TASKS_MOBILE_TITLE_ROW_CLASS } from "./header-classes"

/**
 * Carregamento da coluna Tarefas no celular (`< lg`, OPE-166), no formato do `TasksMobileHeader` (mesmas
 * classes e a mesma sangria até a borda da tela do `TasksPane`): título com os três botões de 40 px, a busca e
 * as linhas da lista. Escondido a partir de `lg`.
 */
export function TasksPaneMobileSkeleton() {
    return (
        <div className={cn("lg:hidden", DEV_CENTER_PANE_BLEED_CLASS)} data-testid="tasks-pane-mobile-skeleton">
            <div className={TASKS_MOBILE_HEADER_CLASS}>
                <div className={TASKS_MOBILE_TITLE_ROW_CLASS}>
                    <span className="flex-1">
                        <Skeleton className="h-4 w-20" />
                    </span>
                    <Skeleton className={TASKS_MOBILE_ICON_BUTTON_CLASS} />
                    <Skeleton className={TASKS_MOBILE_ICON_BUTTON_CLASS} />
                    <Skeleton className={TASKS_MOBILE_ICON_BUTTON_CLASS} />
                </div>
                <Skeleton className={cn(TASKS_MOBILE_SEARCH_CLASS, "w-full")} />
            </div>
            <div className="px-1.5 py-0.5">
                {Array.from({ length: 5 }, (_, index) => (
                    <TaskRowSkeleton key={index} compact />
                ))}
            </div>
        </div>
    )
}
