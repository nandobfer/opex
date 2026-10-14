"use client"

import { useParams, useSearchParams } from "next/navigation"
import { AmbientesWorkspaceRoute } from "@/features/environments/components/routes"
import { ownerAmbientesApi } from "@/features/environments/hooks"

/** Ambientes de um repositório (dono). */
export default function AmbientesRepoPage() {
    const params = useParams<{ repoId: string }>()
    const searchParams = useSearchParams()
    return <AmbientesWorkspaceRoute context={ownerAmbientesApi} basePath="/ambientes" projectId={params.repoId} envId={searchParams.get("env")} storageScope="owner" />
}
