import { Skeleton } from "@/components/ui/skeleton"

/** Carregamento da página do bootstrap: cabeçalho, stepper de 5 etapas, a chave do ambiente e o painel da etapa. */
export function ProjectBootstrapPageSkeleton() {
    return (
        <div className="flex min-w-0 flex-col gap-6" aria-busy="true" aria-label="Carregando o bootstrap">
            <div className="space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-7 w-72" />
                <Skeleton className="h-4 w-56" />
            </div>
            <div className="flex justify-between rounded-md border bg-card px-4 py-4">
                {Array.from({ length: 5 }, (_, index) => (
                    <div key={index} className="flex flex-1 flex-col items-center gap-1.5">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-1 w-16" />
                    </div>
                ))}
            </div>
            <Skeleton className="h-16 w-full rounded-xl" data-testid="bootstrap-environment-toggle-skeleton" />
            <Skeleton className="h-[60vh] min-h-[24rem] w-full rounded-md" />
        </div>
    )
}
