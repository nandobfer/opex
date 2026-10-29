"use client"

import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Play, RotateCcw, Rocket } from "lucide-react"
import type { PortalEnvironmentAction } from "../constants"
import type { PortalEnvironmentDto } from "../types"
import { versionLabel } from "../view"
import { EnvironmentActionButton, EnvironmentStatusBadges } from "../components/EnvironmentStatus"

const LAST_DEPLOY_LABEL = { success: "ok", failed: "com falha", running: "em andamento" } as const

/** Linha de um ambiente no portal: estado, versão, serviços e (admin) implantar/levantar/reiniciar. */
export function PortalEnvironmentRow({ env, isAdmin, pending, onAction }: { env: PortalEnvironmentDto; isAdmin: boolean; pending: boolean; onAction: (action: PortalEnvironmentAction) => void }) {
    const running = env.services.filter((service) => service.state === "running").length
    const busy = pending || env.deploying
    const neverDeployed = env.health === "never"
    return (
        <div className="flex flex-col gap-2 py-3 md:flex-row md:items-center">
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{env.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{env.slug}</span>
                    <EnvironmentStatusBadges health={env.health} deploying={env.deploying} version={versionLabel(env)} />
                </div>
                <p className="text-xs text-muted-foreground">
                    {env.ref ? `Ref ${env.ref}` : "Ref padrão"}
                    {env.services.length ? ` · ${running}/${env.services.length} serviço(s) no ar` : ""}
                    {env.lastDeploy ? ` · último deploy ${LAST_DEPLOY_LABEL[env.lastDeploy.status]} ${formatDistanceToNow(new Date(env.lastDeploy.startedAt), { addSuffix: true, locale: ptBR })}` : ""}
                </p>
            </div>
            {isAdmin && (
                <div className="flex flex-wrap items-center gap-1">
                    <EnvironmentActionButton label="Implantar" title={env.ref ? `Implantar a ref ${env.ref}` : "Implantar"} icon={Rocket} disabled={busy} onClick={() => onAction("deploy")} />
                    <EnvironmentActionButton label="Levantar" icon={Play} disabled={busy || neverDeployed} onClick={() => onAction("up")} />
                    <EnvironmentActionButton label="Reiniciar" icon={RotateCcw} disabled={busy || neverDeployed} onClick={() => onAction("restart")} />
                </div>
            )}
        </div>
    )
}
