"use client"

import { useUrlFilters, urlFilterCodecs } from "@/hooks/useUrlFilters"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { ViewTabs, type ViewTabDef } from "@/components/ui/view-tabs"
import { apiErrorMessage } from "@/lib/api"
import { useEnvironmentApi, useEnvironmentDetail, useEnvironmentOperation } from "../hooks/useEnvironments"
import { CiCdTab } from "./CiCdTab"
import { ComposeTab } from "./ComposeTab"
import { EnvironmentHeader } from "./EnvironmentHeader"
import { EnvironmentLogsTab } from "./EnvironmentLogsTab"
import { PublishTab } from "./PublishTab"
import { RestoreTab } from "./RestoreTab"

const TABS = [
    { id: "compose", label: "Compose" },
    { id: "logs", label: "Logs" },
    { id: "publish", label: "Publicar" },
    { id: "restore", label: "Restaurar" },
    { id: "ci", label: "CI/CD" },
] as const
type Tab = (typeof TABS)[number]["id"]

const defaultFilters = { abaAmbiente: "compose" as Tab }
const filterSchema = { abaAmbiente: urlFilterCodecs.string<Tab>(TABS.map((tab) => tab.id)) }

/** Painel do ambiente: cabeçalho com os atalhos e as abas (Compose · Logs · Publicar · Restaurar · CI/CD). */
export function EnvironmentPanel({ repoId, envId }: { repoId: string; envId: string }) {
    const api = useEnvironmentApi()
    const query = useEnvironmentDetail(repoId, envId)
    const inspect = useEnvironmentOperation(repoId, envId)
    const [filters, setFilters] = useUrlFilters(defaultFilters, filterSchema)
    const tab = filters.abaAmbiente
    const setTab = (value: Tab) => setFilters((previous) => ({ ...previous, abaAmbiente: value }))

    if (query.isLoading)
        return (
            <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div className="space-y-3 p-4" aria-label="Carregando ambiente">
                    <Skeleton className="h-10 w-2/3" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </Card>
        )
    if (!query.data || query.isError)
        return (
            <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <ErrorState
                    title="Não foi possível carregar o ambiente"
                    description={apiErrorMessage(query.error, "Tente novamente.")}
                    onRetry={() => void query.refetch()}
                />
            </Card>
        )

    const data = query.data
    const tabs: ViewTabDef<Tab>[] = TABS.map((item) => ({ id: item.id, label: item.label }))
    return (
        <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <EnvironmentHeader
                environment={data.environment}
                operationStage={data.operations[0]?.stage ?? null}
                configHref={data.canEdit ? `${api.href}/${repoId}/ambiente/${envId}` : null}
                onSelectTab={setTab}
            />
            <ViewTabs tabs={tabs} active={tab} onChange={setTab} label="Seções do ambiente">
                {tab === "compose" && (
                    <ComposeTab
                        environment={data.environment}
                        inspecting={inspect.isPending}
                        onInspect={() =>
                            inspect.mutate({
                                kind: "inspect",
                                method: "host",
                                confirmation: true,
                                riskConfirmed: false,
                                expectedRevision: data.environment.revision,
                                requestId: crypto.randomUUID(),
                            })
                        }
                    />
                )}
                {tab === "logs" && (
                    <EnvironmentLogsTab
                        repoId={repoId}
                        envId={envId}
                        services={data.environment.compose.map((service) => service.service)}
                    />
                )}
                {tab === "publish" && <PublishTab repoId={repoId} data={data} />}
                {tab === "restore" && <RestoreTab repoId={repoId} data={data} />}
                {tab === "ci" && <CiCdTab repoId={repoId} />}
            </ViewTabs>
        </Card>
    )
}
