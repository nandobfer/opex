"use client"

import { useParams } from "next/navigation"
import { AmbientesFormRoute } from "@/features/environments/components/routes"
import { ownerAmbientesApi } from "@/features/environments/hooks"

/** Novo/editar ambiente (dono). */
export default function AmbientesFormPage() {
    const params = useParams<{ repoId: string; envId: string }>()
    return <AmbientesFormRoute context={ownerAmbientesApi} basePath="/ambientes" projectId={params.repoId} envId={params.envId} />
}
