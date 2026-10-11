"use client"

import { Skeleton } from "@/components/ui/skeleton"

/** Esqueleto da tela Dashboards (KPIs + blocos de gráficos) durante o carregamento. */
export function DashboardSkeleton() {
    return (
        <div className="space-y-6" aria-label="Carregando dashboards">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {Array.from({ length: 9 }, (_, index) => (
                    <Skeleton key={index} className="h-24 w-full" />
                ))}
            </div>
            {[0, 1].map((section) => (
                <div key={section} className="space-y-3">
                    <Skeleton className="h-4 w-40" />
                    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                        {Array.from({ length: 4 }, (_, index) => (
                            <Skeleton key={index} className="h-[320px] w-full" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}
