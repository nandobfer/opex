"use client"

import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Play, Rocket, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { PortalEnvironmentAction } from "../constants"
import type { PortalEnvironmentDto } from "../types"
import { runningText, versionLabel } from "../view"
import { ContainerList } from "../components/card/ContainerList"
import { EnvironmentActionsMenu } from "../components/card/EnvironmentActionsMenu"
import { EnvironmentCardFrame } from "../components/card/EnvironmentCardFrame"
import { EnvironmentStateDot } from "../components/card/EnvironmentStateDot"
import { EnvironmentVersionBadge } from "../components/EnvironmentStatus"

const LAST_DEPLOY_LABEL = { success: "ok", failed: "com falha", running: "em andamento" } as const

/** Card de um ambiente no portal: estado, containers com as portas e (admin) implantar, levantar e reiniciar (OPE-211). */
export function PortalEnvironmentCard({ env, isAdmin, pending, linkHost, onAction }: { env: PortalEnvironmentDto; isAdmin: boolean; pending: boolean; linkHost: string; onAction: (action: PortalEnvironmentAction) => void }) {
    const busy = pending || env.deploying
    const neverDeployed = env.health === "never"
    const reason = busy ? "Há uma ação em andamento" : neverDeployed ? "O ambiente ainda não foi implantado" : null
    const running = runningText(env.services)
    return (
        <EnvironmentCardFrame
            title={
                <div className="min-w-0 space-y-1.5">
                    <EnvironmentStateDot health={env.health} deploying={env.deploying} />
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="truncate text-base font-semibold">{env.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{env.slug}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="font-mono">
                            {env.ref ? `ref ${env.ref}` : "ref padrão"}
                        </Badge>
                        <EnvironmentVersionBadge version={versionLabel(env)} />
                    </div>
                </div>
            }
            actions={
                isAdmin ? (
                    <>
                        <Button type="button" size="sm" className="gap-1.5" disabled={busy} title={env.ref ? `Implantar a ref ${env.ref}` : "Implantar"} onClick={() => onAction("deploy")}>
                            <Rocket className="h-4 w-4" aria-hidden /> Implantar
                        </Button>
                        <EnvironmentActionsMenu
                            name={env.name}
                            actions={[
                                { key: "up", label: "Levantar", icon: Play, onSelect: () => onAction("up"), disabled: Boolean(reason), reason },
                                { key: "restart", label: "Reiniciar", icon: RotateCcw, onSelect: () => onAction("restart"), disabled: Boolean(reason), reason },
                            ]}
                        />
                    </>
                ) : null
            }
            containers={<ContainerList items={env.services} host={linkHost} variant="portal" emptyText={neverDeployed ? "Nunca implantado." : "Nenhum container encontrado."} />}
            footer={
                <>
                    <span>{env.lastDeploy ? `Último deploy ${LAST_DEPLOY_LABEL[env.lastDeploy.status]} ${formatDistanceToNow(new Date(env.lastDeploy.startedAt), { addSuffix: true, locale: ptBR })}` : "Nenhum deploy ainda"}</span>
                    {running ? <span>{running}</span> : null}
                </>
            }
        />
    )
}
