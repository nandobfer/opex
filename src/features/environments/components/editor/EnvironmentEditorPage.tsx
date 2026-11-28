"use client"

import Link from "next/link"
import { FileSearch } from "lucide-react"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { Button } from "@/components/ui/button"
import { apiErrorMessage } from "@/lib/api"
import { ENVIRONMENTS_PATH } from "../../constants"
import { useEnvironments, useEnvironmentsRealtime } from "../../hooks/useEnvironments"
import { NO_HOSTS } from "../../view"
import { EnvironmentEditorForm } from "./EnvironmentEditorForm"
import { EnvironmentEditorSkeleton } from "./EnvironmentEditorSkeleton"

/**
 * Páginas `/ambientes/novo` e `/ambientes/[id]/editar` (OPE-211: substituíram o modal). O ambiente, as
 * máquinas e a capacidade vêm da lista (mesma consulta e tempo real da tela de Ambientes).
 */
export function EnvironmentEditorPage({ id }: { id?: string }) {
    useEnvironmentsRealtime()
    const query = useEnvironments()
    if (query.isLoading) return <EnvironmentEditorSkeleton />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar o ambiente" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    const data = query.data
    const env = id ? (data.items.find((item) => item.id === id) ?? null) : null
    if (id && !env) {
        return (
            <EmptyState icon={FileSearch} title="Ambiente não encontrado" description="Ele pode ter sido apagado ou o endereço está incorreto.">
                <Button asChild size="sm" variant="outline">
                    <Link href={ENVIRONMENTS_PATH}>Voltar para Ambientes</Link>
                </Button>
            </EmptyState>
        )
    }
    return <EnvironmentEditorForm key={env?.id ?? "novo"} env={env} pcAvailable={data.pcAvailable} pcReason={data.pcReason} hosts={data.hosts ?? NO_HOSTS} />
}
