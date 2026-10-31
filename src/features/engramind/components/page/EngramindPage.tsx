"use client"

import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Brain, Hash, PlugZap } from "lucide-react"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorMessage } from "@/lib/api"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { ENGRAMIND_INTEGRATION_HREF, ENGRAMIND_PAGE_TABS, type EngramindPageTab } from "../../constants"
import { useEngramindRealtime } from "../../hooks/useEngramind"
import { useEngramindConnection } from "../../hooks/useEngramindConnection"
import { AboutCard } from "./AboutCard"
import { ChannelsTab } from "./channels/ChannelsTab"
import { MemoriesTab } from "./memories/MemoriesTab"

const TABS: IntegrationTabDef<EngramindPageTab>[] = [
    { id: "canais", label: "Canais", icon: Hash },
    { id: "memorias", label: "Memórias", icon: Brain },
]

/** `/engramind`: canais (com assinantes e configurações por canal) e memórias (busca, histórico e importação). */
export function EngramindPage() {
    useEngramindRealtime()
    const router = useRouter()
    const connection = useEngramindConnection()
    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab<EngramindPageTab>(ENGRAMIND_PAGE_TABS, "canais", false, () => undefined)
    const configure = () => router.push(`${ENGRAMIND_INTEGRATION_HREF}?aba=conexao`)
    return (
        <div className="flex flex-col gap-6">
            <CadastroHeader title="Engramind" description="Rede de memórias para agentes: canais, assinaturas e memórias" />
            {connection.isLoading ? (
                <div className="flex flex-col gap-6" aria-busy="true">
                    <Skeleton className="h-28 w-full rounded-xl" />
                    <Skeleton className="h-10 w-64" />
                    <Skeleton className="h-80 w-full rounded-xl" />
                </div>
            ) : connection.isError ? (
                <ErrorState description={apiErrorMessage(connection.error)} onRetry={() => void connection.refetch()} />
            ) : !connection.data?.configured ? (
                <EmptyState icon={PlugZap} title="Engramind não configurado" description="Configure a conexão com o Engramind (URL base e token admin) para gerenciar canais e memórias." actionLabel="Configurar integração" onAction={configure} />
            ) : (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-6">
                    <AboutCard />
                    <IntegrationTabs tabs={TABS} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções do Engramind">
                        {tab === "canais" && <ChannelsTab onConfigure={configure} />}
                        {tab === "memorias" && <MemoriesTab onConfigure={configure} />}
                    </IntegrationTabs>
                </motion.div>
            )}
        </div>
    )
}
