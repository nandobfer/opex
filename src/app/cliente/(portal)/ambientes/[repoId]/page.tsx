"use client"

import { useParams, useSearchParams } from "next/navigation"
import { useClientePortal } from "@/features/orcamentos/portal/ClientePortalContext"
import { AmbientesWorkspaceRoute } from "@/features/environments/components/routes"
import { CLIENTE_AMBIENTES_PATH } from "@/features/environments/constants"

/** Ambientes de um repositório (portal). */
export default function ClienteAmbientesRepoPage() {
    const params = useParams<{ repoId: string }>()
    const searchParams = useSearchParams()
    const { api, clientId } = useClientePortal()
    return (
        <AmbientesWorkspaceRoute
            context={{ basePath: "/cliente/ambientes", client: api, clientId }}
            basePath={CLIENTE_AMBIENTES_PATH}
            projectId={params.repoId}
            envId={searchParams.get("env")}
            storageScope="client"
        />
    )
}
