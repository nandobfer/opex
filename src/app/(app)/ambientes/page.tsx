"use client"

import { AmbientesWorkspaceRoute } from "@/features/environments/components/routes"
import { ownerAmbientesApi } from "@/features/environments/hooks"

/** Ambientes (dono): workspace com a lista de ambientes e o ambiente selecionado. */
export default function AmbientesPage() {
    return <AmbientesWorkspaceRoute context={ownerAmbientesApi} basePath="/ambientes" projectId={null} envId={null} storageScope="owner" />
}
