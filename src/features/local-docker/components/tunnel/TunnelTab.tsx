"use client"

import { useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { BuilderMachineTab } from "../../constants"
import { useLocalDockerContainerAction, useLocalDockerContainers, useLocalDockerStatus } from "../../hooks/useLocalDocker"
import type { LocalDockerSettingsDto } from "../../types"
import { ContainersSection } from "./ContainersSection"
import { SetupChecklist } from "./SetupChecklist"
import { TunnelStatusCard } from "./TunnelStatusCard"

/** Aba "Túnel do Docker do PC": situação, passos pendentes e os containers do PC (prévias e ambiente). */
export function TunnelTab({ saved, unsaved, goTo }: { saved: LocalDockerSettingsDto; unsaved: boolean; goTo: (tab: BuilderMachineTab) => void }) {
    const status = useLocalDockerStatus()
    const [open, setOpen] = useState({ previews: true, environment: false })
    const containers = useLocalDockerContainers(open.previews || open.environment)
    const action = useLocalDockerContainerAction()
    const busy = action.isPending && action.variables ? { name: action.variables.name, action: action.variables.action } : null
    const run = (name: string, kind: Parameters<typeof action.mutate>[0]["action"], confirm?: boolean) => action.mutate({ name, action: kind, confirm })
    const unavailable = containers.isError ? apiErrorMessage(containers.error, "Não foi possível consultar o Docker do PC") : containers.data && !containers.data.available ? containers.data.reason : null

    return (
        <>
            {status.isLoading ? (
                <Skeleton className="h-36 w-full" />
            ) : status.isError || !status.data ? (
                <ErrorState title="Não foi possível conferir o PC" description={apiErrorMessage(status.error, "Tente novamente.")} onRetry={() => void status.refetch()} />
            ) : (
                <TunnelStatusCard
                    status={status.data}
                    fetching={status.isFetching}
                    onRefresh={() => void status.refetch()}
                    openBlockedReason={unsaved ? "Salve a configuração antes de abrir o túnel." : !saved.key.configured ? "Gere ou insira a chave do servidor (aba Preparo do PC) antes de abrir o túnel." : null}
                />
            )}
            <SetupChecklist saved={saved} status={status.data} unsaved={unsaved} goTo={goTo} />
            <ContainersSection
                id="builder-machine-previews"
                title="Containers de prévia"
                description="Prévias das mesas rodando no PC (a porta é repassada para o servidor)."
                open={open.previews}
                onToggle={() => setOpen((value) => ({ ...value, previews: !value.previews }))}
                items={containers.data?.previews ?? []}
                unavailable={unavailable}
                loading={containers.isLoading}
                empty={<p className="text-sm text-muted-foreground">Nenhuma prévia no PC. Com o túnel aberto, a próxima prévia de uma mesa sobe aqui.</p>}
                busy={busy}
                onAction={run}
            />
            <ContainersSection
                id="builder-machine-environment"
                title="Containers de ambiente (Preparo do PC)"
                description="Apelidos de rede e o builder dedicado criados pelo preparo."
                open={open.environment}
                onToggle={() => setOpen((value) => ({ ...value, environment: !value.environment }))}
                items={containers.data?.environment ?? []}
                unavailable={unavailable}
                loading={containers.isLoading}
                empty={<p className="text-sm text-muted-foreground">Nenhum container de ambiente: rode &quot;Preparar o Docker do PC&quot; na aba Preparo do PC.</p>}
                busy={busy}
                onAction={run}
            />
        </>
    )
}
