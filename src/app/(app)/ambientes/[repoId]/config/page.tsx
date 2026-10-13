"use client"

import { useParams } from "next/navigation"
import { AmbientesConfigRoute } from "@/features/environments/components/routes"
import { ownerAmbientesApi } from "@/features/environments/hooks"

/** Configuração de execução do repositório (dono). */
export default function AmbientesConfigPage() {
    const params = useParams<{ repoId: string }>()
    return <AmbientesConfigRoute context={ownerAmbientesApi} basePath="/ambientes" projectId={params.repoId} isOwner />
}
