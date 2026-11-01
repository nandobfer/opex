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
import { EngramindNetwork } from "../network/EngramindNetwork"
import { NetworkSkeleton } from "../network/NetworkSkeleton"
import { AboutCard } from "./AboutCard"

/** Esqueleto da página: card "O que é", barra da rede, trilha e a área da rede. */
function PageSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy="true">
            <Skeleton className="h-28 w-full rounded-xl" />
            <div className="flex flex-col gap-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-40" />
                <NetworkSkeleton />
            </div>
        </div>
    )
}

/** `/engramind`: a rede de agentes, canais e memórias (OPE-109), com a gestão dentro dela. */
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
                    <AboutCard />
                    <Suspense fallback={<NetworkSkeleton />}>
                        <EngramindNetwork onConfigure={configure} />
                    </Suspense>
                </motion.div>
            )}
        </div>
    )
}
