import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EDITOR_SECTIONS as SECTIONS } from "../../editor-sections"
import { EDITOR_GRID, EDITOR_SECTIONS } from "../../environment-editor-layout"

/** Carregamento da página Novo/Editar ambiente: o mesmo leiaute (cabeçalho, índice e cards das seções). */
export function EnvironmentEditorSkeleton() {
    return (
        <div className="space-y-6" aria-label="Carregando o ambiente">
            <div className="space-y-3">
                <Skeleton className="h-8 w-28" />
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div className="space-y-2">
                        <Skeleton className="h-7 w-56" />
                        <Skeleton className="h-4 w-72" />
                    </div>
                    <div className="flex gap-2">
                        <Skeleton className="h-9 w-24" />
                        <Skeleton className="h-9 w-24" />
                    </div>
                </div>
            </div>
            <div className={EDITOR_GRID}>
                <div className="flex gap-1 lg:flex-col">
                    {SECTIONS.map((section) => (
                        <Skeleton key={section} className="h-9 w-32 lg:w-full" />
                    ))}
                </div>
                <div className={EDITOR_SECTIONS}>
                    {[0, 1, 2].map((card) => (
                        <Card key={card}>
                            <CardContent className="space-y-5 pt-6">
                                <div className="space-y-2">
                                    <Skeleton className="h-5 w-40" />
                                    <Skeleton className="h-4 w-80 max-w-full" />
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Skeleton className="h-16" />
                                    <Skeleton className="h-16" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    )
}
