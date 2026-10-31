"use client"

import type { ReactNode } from "react"
import { KeyRound, PlugZap } from "lucide-react"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { needsReconnect } from "../../hooks/useEngramind"

interface QueryBoundaryProps {
    isLoading: boolean
    error: unknown
    onRetry: () => void
    skeleton: ReactNode
    /** Para onde levar quando a conexão precisa ser (re)configurada. */
    onConfigure?: () => void
    children: ReactNode
}

/** Carregando (skeleton), erro com "Tentar novamente" ou "Reconfigure o token", e o conteúdo. */
export function QueryBoundary({ isLoading, error, onRetry, skeleton, onConfigure, children }: QueryBoundaryProps) {
    if (isLoading) return <>{skeleton}</>
    if (error) {
        const reconnect = needsReconnect(error)
        if (reconnect === "configure") return <EmptyState icon={PlugZap} title="Configure a conexão" description="Informe a URL base e o token admin do Engramind na aba Conexão." actionLabel={onConfigure ? "Ir para Conexão" : undefined} onAction={onConfigure} />
        if (reconnect === "token") return <EmptyState icon={KeyRound} title="Reconfigure o token" description={apiErrorMessage(error)} actionLabel={onConfigure ? "Ir para Conexão" : undefined} onAction={onConfigure} />
        return <ErrorState description={apiErrorMessage(error, "Não foi possível falar com o Engramind.")} onRetry={onRetry} />
    }
    return <>{children}</>
}
