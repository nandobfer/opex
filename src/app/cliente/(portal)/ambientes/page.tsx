"use client"

import { useClientePortal } from "@/features/orcamentos/portal/ClientePortalContext"
import { AmbientesWorkspaceRoute } from "@/features/environments/components/routes"
import { CLIENTE_AMBIENTES_PATH } from "@/features/environments/constants"

/** Ambientes (portal): repositórios vinculados ao cliente. */
export default function ClienteAmbientesPage() {
    const { api, clientId } = useClientePortal()
    return <AmbientesWorkspaceRoute context={{ basePath: "/cliente/ambientes", client: api, clientId }} basePath={CLIENTE_AMBIENTES_PATH} projectId={null} envId={null} storageScope="client" />
}
