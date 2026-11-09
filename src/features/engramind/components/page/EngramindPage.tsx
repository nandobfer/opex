"use client"

import { Suspense } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { PlugZap } from "lucide-react"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorMessage } from "@/lib/api"
import { ENGRAMIND_INTEGRATION_HREF } from "../../constants"
import { useEngramindConnection } from "../../hooks/useEngramindConnection"
import { EngramindNetwork, NETWORK_FILL_ROOT_PROPS, NetworkSkeleton } from "@engramind/client/react"
import { OpexEngramindProvider } from "../OpexEngramindProvider"

/**
 * Esqueleto da página: trilha, barra da rede, a área da rede e o card "O que é" no fim (OPE-113). O bloco
 * trilha + barra + área é a âncora do `fill="viewport"`, como a raiz do `EngramindNetwork` (OPE-151).
 */
function PageSkeleton() {
    return (
        <div className="flex flex-col gap-3" aria-busy="true" data-testid="engramind-page-skeleton">
            <div {...NETWORK_FILL_ROOT_PROPS} className="flex flex-col gap-3" data-testid="network-fill-root-skeleton">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-9 w-full" />
                <NetworkSkeleton fill="viewport" />
            </div>
            <Skeleton className="h-28 w-full rounded-xl" data-testid="about-card-skeleton" />
        </div>
    )
}

/**
 * `/engramind`: a rede de agentes, canais e memórias (OPE-109), com a gestão dentro dela. A rede vem de
 * `@engramind/client` no modo gestor (OPE-116), pelo `OpexEngramindProvider`. Trilha, filtros e canvas ocupam
 * a altura visível da área que rola (`fill="viewport"`, OPE-151), como o skeleton; o card "O que é" fica abaixo.
 */
export function EngramindPage() {
    const router = useRouter()
    const connection = useEngramindConnection()
    const configure = () => router.push(`${ENGRAMIND_INTEGRATION_HREF}?aba=conexao`)
    return (
        <div className="flex flex-col gap-6">
            <CadastroHeader title="Engramind" description="Rede de memórias para agentes: agentes, canais e memórias" />
            {connection.isLoading ? (
                <PageSkeleton />
            ) : connection.isError ? (
                <ErrorState description={apiErrorMessage(connection.error)} onRetry={() => void connection.refetch()} />
            ) : !connection.data?.configured ? (
                <EmptyState icon={PlugZap} title="Engramind não configurado" description="Configure a conexão com o Engramind (URL base e token admin) para gerenciar canais e memórias." actionLabel="Configurar integração" onAction={configure} />
            ) : (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-6">
                    <Suspense fallback={<PageSkeleton />}>
                        <OpexEngramindProvider>
                            <EngramindNetwork onConfigure={configure} fill="viewport" />
                        </OpexEngramindProvider>
                    </Suspense>
                </motion.div>
            )}
        </div>
    )
}
