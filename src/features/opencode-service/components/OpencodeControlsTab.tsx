"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useOpencodeResourcesRealtime } from "@/features/opencode-resources/hooks/useOpencodeResources"
import { useOpencodeServiceRealtime, useOpencodeServiceStatus } from "../hooks/useOpencodeService"
import { BackupsCard } from "./BackupsCard"
import { ServiceLogsCard } from "./ServiceLogsCard"
import { ServiceStatusCard } from "./ServiceStatusCard"
import { SshAccessCard } from "./SshAccessCard"

/** Aba Controles do OpenCode: status e ações do serviço, acesso SSH, logs e backups da configuração. */
export function OpencodeControlsTab({ dirty }: { dirty: boolean }) {
    const status = useOpencodeServiceStatus(!dirty)
    useOpencodeServiceRealtime()
    useOpencodeResourcesRealtime()
    if (dirty) return <p className="text-sm text-muted-foreground">Salve as alterações da configuração para usar os controles do serviço.</p>
    if (status.isLoading) return <Skeleton className="h-56 w-full" />
    if (status.isError || !status.data)
        return <ErrorState title="Não foi possível ler o status do OpenCode" description={apiErrorMessage(status.error, "Tente de novo.")} onRetry={() => void status.refetch()} />
    return (
        <>
            <ServiceStatusCard status={status.data} fetching={status.isFetching} onRefresh={() => void status.refetch()} />
            <SshAccessCard ssh={status.data.ssh} />
            <ServiceLogsCard />
            <BackupsCard />
        </>
    )
}
