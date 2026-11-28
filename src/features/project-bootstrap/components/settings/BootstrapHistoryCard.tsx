"use client"

import { AnimatePresence } from "framer-motion"
import { History } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useProjectBootstraps, useProjectBootstrapRealtime } from "../../hooks/useProjectBootstrap"
import { BootstrapRow } from "../BootstrapRow"

/** Histórico completo dos bootstraps (em andamento, concluídos e cancelados), cada um com o link da página. */
export function BootstrapHistoryCard() {
    useProjectBootstrapRealtime()
    const list = useProjectBootstraps()
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Histórico de bootstraps</CardTitle>
                <CardDescription>Todos os ambientes provisionados pelo Agente de Bootstrap, do mais recente ao mais antigo.</CardDescription>
            </CardHeader>
            <CardContent>
                {list.isLoading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 3 }, (_, index) => (
                            <Skeleton key={index} className="h-[58px] w-full rounded-md" />
                        ))}
                    </div>
                ) : list.isError ? (
                    <ErrorState title="Não foi possível carregar o histórico" description={apiErrorMessage(list.error, "Tente novamente.")} onRetry={() => void list.refetch()} />
                ) : !list.data?.length ? (
                    <EmptyState icon={History} title="Nenhum bootstrap ainda" description="Digite um nome novo em Nova central (Agente Desenvolvedor › Centrais) para criar o repositório e provisionar o ambiente." />
                ) : (
                    <ul className="space-y-2">
                        <AnimatePresence initial={false}>
                            {list.data.map((item) => (
                                <BootstrapRow key={item.id} bootstrap={item} />
                            ))}
                        </AnimatePresence>
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}
