"use client"

import { Skeleton } from "@/components/ui/skeleton"
import type { EngramindAgent, EngramindApp, EngramindSubscription, EngramindToken } from "../../../types"
import { useEngramindList } from "../../../hooks/useEngramind"
import { useEngramindConnection } from "../../../hooks/useEngramindConnection"
import { BOOTSTRAP_APP_SLUG, OPEX_APP_SLUG } from "../../../constants"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { AgentsCard } from "./AgentsCard"
import { AppsCard } from "./AppsCard"
import { TokensCard } from "./TokensCard"

/** Aba Identidades: apps, agentes e tokens do Engramind. */
export function IdentitiesTab({ onConfigure }: { onDirtyChange: (dirty: boolean) => void; onConfigure: () => void }) {
    const apps = useEngramindList<EngramindApp>("apps", "apps", undefined, { all: true })
    const agents = useEngramindList<EngramindAgent>("agents", "agents", undefined, { all: true })
    const tokens = useEngramindList<EngramindToken>("tokens", "tokens", undefined, { all: true })
    const subscriptions = useEngramindList<EngramindSubscription>("subscriptions", "subscriptions", undefined, { all: true })
    const connection = useEngramindConnection()
    const whoami = connection.data?.whoami ?? null
    const ownApp = whoami ? (whoami.app.slug === BOOTSTRAP_APP_SLUG ? OPEX_APP_SLUG : whoami.app.slug) : null
    const error = apps.error ?? agents.error ?? tokens.error
    return (
        <QueryBoundary isLoading={apps.isLoading || agents.isLoading || tokens.isLoading} error={error} onRetry={() => void Promise.all([apps.refetch(), agents.refetch(), tokens.refetch()])} skeleton={<IdentitiesSkeleton />} onConfigure={onConfigure}>
            <div className="flex flex-col gap-6">
                <AppsCard apps={apps.items} ownAppSlug={ownApp} />
                <AgentsCard agents={agents.items} apps={apps.items} subscriptions={subscriptions.items} />
                <TokensCard tokens={tokens.items} apps={apps.items} agents={agents.items} ownTokenId={whoami?.token_id ?? null} />
            </div>
        </QueryBoundary>
    )
}

function IdentitiesSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy="true">
            {Array.from({ length: 3 }, (_, section) => (
                <div key={section} className="space-y-3 rounded-xl border p-6">
                    <Skeleton className="h-5 w-24" />
                    {Array.from({ length: 3 }, (_, row) => (
                        <Skeleton key={row} className="h-14 w-full" />
                    ))}
                </div>
            ))}
        </div>
    )
}
