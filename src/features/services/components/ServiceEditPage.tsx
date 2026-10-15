"use client"

import Link from "next/link"
import { FileSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { SERVICES_PATH } from "../constants"
import { useService } from "../hooks"
import { ServiceForm } from "./ServiceForm"

/** Edição de um serviço (`/financeiro/servicos/[id]/editar`): carrega o serviço e reusa o formulário. */
export function ServiceEditPage({ id }: { id: string }) {
    const query = useService(id)
    const view = query.isLoading ? "loading" : query.isError ? (apiErrorCode(query.error) === "SERVICE_NOT_FOUND" ? "missing" : "error") : "ready"

    if (view === "loading") {
        return (
            <div className="space-y-4" aria-label="Carregando serviço">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-96 w-full" />
            </div>
        )
    }
    if (view === "missing") {
        return (
            <EmptyState icon={FileSearch} title="Serviço não encontrado" description="Ele pode ter sido removido ou o endereço está incorreto.">
                <Button asChild size="sm" variant="outline">
                    <Link href={SERVICES_PATH}>Voltar para o Financeiro</Link>
                </Button>
            </EmptyState>
        )
    }
    if (view === "error" || !query.data) {
        return <ErrorState title="Não foi possível carregar o serviço" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    }
    return <ServiceForm service={query.data} />
}
