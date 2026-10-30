"use client"

import { ShieldQuestion } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { ADVERSARIAL_HISTORY_LIMIT } from "../../constants"
import { useAdversarialRealtime, useAdversarialReviews } from "../../hooks/useAdversarial"
import { AdversarialReviewList } from "../AdversarialReviewList"

/** Histórico das rodadas (as mais recentes): serve para calibrar a criticidade. */
export function ReviewsSection() {
    const query = useAdversarialReviews()
    useAdversarialRealtime()
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Revisões</CardTitle>
                <CardDescription>As {ADVERSARIAL_HISTORY_LIMIT} rodadas mais recentes do adversário nas mesas, com o veredito, os achados por severidade e o que a mesa fez em seguida.</CardDescription>
            </CardHeader>
            <CardContent>
                {query.isLoading ? (
                    <Skeleton className="h-48 w-full" />
                ) : query.isError ? (
                    <ErrorState title="Não foi possível carregar as revisões" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : !query.data?.length ? (
                    <EmptyState icon={ShieldQuestion} title="Nenhuma revisão ainda" description="As rodadas aparecem aqui quando uma mesa termina a implementação com o adversário ativo." />
                ) : (
                    <AdversarialReviewList items={query.data} />
                )}
            </CardContent>
        </Card>
    )
}
