"use client"

import type { ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { ChannelNamespace } from "../../channel-namespace"
import { useChannelNamespace } from "../../hooks/useChannelNamespace"

/** Skeleton do card de universo enquanto o espaço de nomes carrega (mesma estrutura do `AgentUniverseCard`). */
export function UniverseCardSkeleton() {
    return (
        <Card aria-busy="true" data-testid="universe-card-skeleton">
            <CardHeader className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-2/3" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-80 w-full" />
            </CardContent>
        </Card>
    )
}

/**
 * Espera o espaço de nomes dos canais da instância (OPE-206) antes de montar quem calcula canais reais. Carregando,
 * o `fallback` (padrão: o skeleton do universo); com erro, o aviso com "Tentar novamente".
 */
export function ChannelNamespaceGate({ children, fallback }: { children: (ns: ChannelNamespace) => ReactNode; fallback?: ReactNode }) {
    const namespace = useChannelNamespace()
    if (namespace.data) return <>{children(namespace.data)}</>
    if (namespace.isError) {
        return (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border p-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden /> Não foi possível carregar os canais de memória desta instância.
                </span>
                <Button size="sm" variant="outline" onClick={() => void namespace.refetch()}>
                    Tentar novamente
                </Button>
            </div>
        )
    }
    return <>{fallback ?? <UniverseCardSkeleton />}</>
}
