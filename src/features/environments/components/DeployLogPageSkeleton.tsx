"use client"

import { useRef } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { useFillViewportHeight } from "@nandobfer/integracoes/react"
import { DEPLOY_LOG_CARD_CLASS, DEPLOY_PAGE_CLASS } from "./deploy-page-layout"

/** Carregamento da página do deploy: o cabeçalho e o cartão do log com as mesmas dimensões (OPE-208). */
export function DeployLogPageSkeleton() {
    const cardRef = useRef<HTMLDivElement>(null)
    const height = useFillViewportHeight(cardRef)
    return (
        <div className={DEPLOY_PAGE_CLASS} aria-busy="true" aria-label="Carregando o deploy" data-testid="deploy-page-skeleton">
            <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
                <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-6 w-56 max-w-full md:h-8" />
                    <Skeleton className="h-4 w-80 max-w-full" />
                </div>
            </div>
            <div ref={cardRef} className={DEPLOY_LOG_CARD_CLASS} style={height ? { height } : undefined}>
                <Skeleton className="mb-3 h-5 w-40" />
                <Skeleton className="min-h-0 w-full flex-1" />
            </div>
        </div>
    )
}
