"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Skeleton } from "@/components/ui/skeleton"
import type { EngramindAgent, EngramindApp, EngramindSubscription, EngramindToken } from "../../../types"
import { useEngramindList } from "../../../hooks/useEngramind"
import { useEngramindConnection } from "../../../hooks/useEngramindConnection"
import { BOOTSTRAP_APP_SLUG, OPEX_APP_SLUG } from "../../../constants"
import { adminTokens } from "../../../identities"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { AgentDetail } from "./AgentDetail"
import { AppDetail } from "./AppDetail"
import { AppsCard } from "./AppsCard"
import { TokensCard } from "./TokensCard"

type View = { kind: "list" } | { kind: "app"; slug: string } | { kind: "agent"; id: string }

const slide = { initial: { opacity: 0, x: 12 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -12 }, transition: { duration: 0.18 } } as const

/**
 * Aba Identidades (OPE-117), em dois níveis: lista de apps (com contagens, alertas, busca e filtros) e os
 * tokens administrativos; o detalhe do app (token em uso, agentes, tokens, webhook) e o do agente
 * (configuração, tokens, assinaturas, memórias). Os dois tokens do Opex (admin e de app) ficam "Este Opex".
 */
export function IdentitiesTab({ onConfigure }: { onDirtyChange: (dirty: boolean) => void; onConfigure: () => void }) {
    const apps = useEngramindList<EngramindApp>("apps", "apps", undefined, { all: true })
    const agents = useEngramindList<EngramindAgent>("agents", "agents", undefined, { all: true })
    const tokens = useEngramindList<EngramindToken>("tokens", "tokens", undefined, { all: true })
    const subscriptions = useEngramindList<EngramindSubscription>("subscriptions", "subscriptions", undefined, { all: true })
    const connection = useEngramindConnection()
    const [view, setView] = useState<View>({ kind: "list" })
    const whoami = connection.data?.whoami ?? null
    const ownApp = whoami ? (whoami.app.slug === BOOTSTRAP_APP_SLUG ? OPEX_APP_SLUG : whoami.app.slug) : null
    const ownTokenIds = [whoami?.token_id ?? null, connection.data?.appTokenId ?? null]
    const error = apps.error ?? agents.error ?? tokens.error
    const app = view.kind === "app" ? apps.items.find((item) => item.slug === view.slug) : undefined
    const agent = view.kind === "agent" ? agents.items.find((item) => item.id === view.id) : undefined
    return (
        <QueryBoundary isLoading={apps.isLoading || agents.isLoading || tokens.isLoading} error={error} onRetry={() => void Promise.all([apps.refetch(), agents.refetch(), tokens.refetch()])} skeleton={<IdentitiesSkeleton />} onConfigure={onConfigure}>
            <AnimatePresence mode="wait" initial={false}>
                {agent ? (
                    <motion.div key={`agent-${agent.id}`} {...slide}>
                        <AgentDetail agent={agent} apps={apps.items} agents={agents.items} tokens={tokens.items} subscriptions={subscriptions.items} ownTokenIds={ownTokenIds} onBack={() => setView({ kind: "app", slug: agent.app.slug })} />
                    </motion.div>
                ) : app ? (
                    <motion.div key={`app-${app.slug}`} {...slide}>
                        <AppDetail app={app} apps={apps.items} agents={agents.items} tokens={tokens.items} subscriptions={subscriptions.items} ownTokenIds={ownTokenIds} own={app.slug === ownApp} onBack={() => setView({ kind: "list" })} onOpenAgent={(item) => setView({ kind: "agent", id: item.id })} />
                    </motion.div>
                ) : (
                    <motion.div key="list" {...slide} className="flex flex-col gap-6">
                        <AppsCard apps={apps.items} ownAppSlug={ownApp} agents={agents.items} tokens={tokens.items} onOpen={(slug) => setView({ kind: "app", slug })} />
                        <TokensCard
                            title="Tokens administrativos"
                            info="Tokens kind admin (gerem a rede inteira). Os tokens de app e de agente ficam no detalhe do app ou do agente."
                            tokens={adminTokens(tokens.items)}
                            apps={apps.items}
                            agents={agents.items}
                            ownTokenIds={ownTokenIds}
                            emptyDescription="Nenhum token administrativo."
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </QueryBoundary>
    )
}

function IdentitiesSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy="true" data-testid="identities-skeleton">
            {Array.from({ length: 2 }, (_, section) => (
                <div key={section} className="space-y-3 rounded-xl border p-6">
                    <Skeleton className="h-5 w-24" />
                    {section === 0 && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Skeleton className="h-9 w-full sm:flex-1" />
                            <Skeleton className="h-9 w-full sm:w-56" />
                        </div>
                    )}
                    {Array.from({ length: 3 }, (_, row) => (
                        <Skeleton key={row} className="h-[4.5rem] w-full" />
                    ))}
                </div>
            ))}
        </div>
    )
}
