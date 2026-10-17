"use client"

import { useParams } from "next/navigation"
import { useClientePortal } from "@/features/orcamentos/portal/ClientePortalContext"
import { EnvironmentProvider } from "../hooks/useEnvironments"
import { EnvironmentWorkspace } from "./EnvironmentWorkspace"
import { EnvironmentEditor } from "./EnvironmentEditor"
import { RepoConfigEditor } from "./RepoConfigEditor"

type View = "workspace" | "config" | "editor"
export function EnvironmentEntry({
    view = "workspace",
    portal = false,
    clientId = "",
}: {
    view?: View
    portal?: boolean
    clientId?: string
}) {
    const params = useParams<{ repoId?: string; envId?: string }>()
    return (
        <EnvironmentProvider portal={portal} clientId={clientId}>
            {view === "config" ? (
                <RepoConfigEditor repoId={params.repoId ?? ""} />
            ) : view === "editor" ? (
                <EnvironmentEditor repoId={params.repoId ?? ""} envId={params.envId ?? "novo"} />
            ) : (
                <EnvironmentWorkspace repoId={params.repoId ?? ""} />
            )}
        </EnvironmentProvider>
    )
}
export function PortalEnvironmentEntry({ view = "workspace" }: { view?: View }) {
    const session = useClientePortal()
    return <EnvironmentEntry view={view} portal clientId={session.clientId} />
}
