"use client"

import { GraduationCap } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { MENTOR_HISTORY_LIMIT } from "../../mentor/constants"
import { useMentorRealtime, useMentorRuns } from "../../hooks/useMentor"
import { MentorRunList } from "./MentorRunList"

/** Execuções do Mentor (as mais recentes): calibrar o rigor e decidir as sugestões. */
export function MentorRunsSection() {
    const query = useMentorRuns()
    useMentorRealtime()
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Execuções</CardTitle>
                <CardDescription>As {MENTOR_HISTORY_LIMIT} avaliações mais recentes do Mentor, com a nota do decisor, a decisão do redator e a memória gravada. No modo Sugerir, abra a execução para aprovar ou descartar.</CardDescription>
            </CardHeader>
            <CardContent>
                {query.isLoading ? (
                    <Skeleton className="h-48 w-full" />
                ) : query.isError ? (
                    <ErrorState title="Não foi possível carregar as execuções" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : !query.data?.length ? (
                    <EmptyState icon={GraduationCap} title="Nenhuma execução ainda" description="As avaliações aparecem aqui quando um turno da mesa dispara o Mentor (ex.: uma correção pedida por você)." />
                ) : (
                    <MentorRunList items={query.data} />
                )}
            </CardContent>
        </Card>
    )
}
