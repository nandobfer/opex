"use client"

import { useParams } from "next/navigation"
import { useClientePortal } from "@/features/orcamentos/portal/ClientePortalContext"
import { AmbientesConfigRoute } from "@/features/environments/components/routes"
import { CLIENTE_AMBIENTES_PATH } from "@/features/environments/constants"

/** Configuração de execução do repositório (portal; sem credenciais). */
export default function ClienteAmbientesConfigPage() {
    const params = useParams<{ repoId: string }>()
    const { api, clientId } = useClientePortal()
    return <AmbientesConfigRoute context={{ basePath: "/cliente/ambientes", client: api, clientId }} basePath={CLIENTE_AMBIENTES_PATH} projectId={params.repoId} isOwner={false} />
}
