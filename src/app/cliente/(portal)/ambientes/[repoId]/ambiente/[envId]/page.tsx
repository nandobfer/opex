"use client"

import { useParams } from "next/navigation"
import { useClientePortal } from "@/features/orcamentos/portal/ClientePortalContext"
import { AmbientesFormRoute } from "@/features/environments/components/routes"
import { CLIENTE_AMBIENTES_PATH } from "@/features/environments/constants"

/** Novo/editar ambiente (portal). */
export default function ClienteAmbienteFormPage() {
    const params = useParams<{ repoId: string; envId: string }>()
    const { api, clientId } = useClientePortal()
    return <AmbientesFormRoute context={{ basePath: "/cliente/ambientes", client: api, clientId }} basePath={CLIENTE_AMBIENTES_PATH} projectId={params.repoId} envId={params.envId} />
}
