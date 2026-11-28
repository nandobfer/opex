"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowRightLeft, CheckCircle2, FileCode, FileText, History, Loader2, Pencil, Play, RefreshCw, RotateCcw, Square, Trash2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ItemNameLink } from "@/components/list/ItemNameLink"
import { deployPath, environmentEditPath } from "../constants"
import { useEnvironmentAction } from "../hooks/useEnvironments"
import type { EnvironmentDto } from "../types"
import { healthOf, pendingDeployItems, placementLabel, runningText, versionLabel } from "../view"
import { ContainerList } from "./card/ContainerList"
import { EnvironmentActionsMenu, type EnvironmentMenuAction } from "./card/EnvironmentActionsMenu"
import { EnvironmentCardFrame } from "./card/EnvironmentCardFrame"
import { EnvironmentStateDot } from "./card/EnvironmentStateDot"
import { PendingDeployNotice } from "./card/PendingDeployNotice"
import { DeployMenu } from "./DeployMenu"
import { EnvironmentVersionBadge } from "./EnvironmentStatus"
import { LogsDialog } from "./LogsDialog"

export type CardIntent = { kind: "delete" | "move" | "history" | "compose" } | { kind: "deploy-started"; deployId: string }

const SOURCE_LABEL = (env: EnvironmentDto) => (env.source.kind === "central" ? "Central" : env.source.kind === "managed" ? `Gerenciado v${env.source.composeVersion}` : env.source.git ? "Adotado" : "Adotado (sem git)")

const LAST_DEPLOY = {
    success: { icon: CheckCircle2, text: "ok", className: "text-success" },
    failed: { icon: XCircle, text: "com falha", className: "text-destructive" },
    running: { icon: Loader2, text: "em andamento", className: "animate-spin text-primary" },
} as const

function LastDeploy({ env }: { env: EnvironmentDto }) {
    const last = env.lastDeploy
    if (!last) return <span>Nenhum deploy ainda</span>
    const status = LAST_DEPLOY[last.status]
    const Icon = status.icon
    return (
        <Link href={deployPath(last.id)} className="inline-flex min-w-0 items-center gap-1.5 rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Icon className={`h-3.5 w-3.5 shrink-0 ${status.className}`} aria-hidden />
            <span className="truncate">
                Último deploy {status.text} {formatDistanceToNow(new Date(last.startedAt), { addSuffix: true, locale: ptBR })}
                {last.ref ? ` · ${last.ref}` : ""}
                {last.commit ? ` @ ${last.commit.slice(0, 8)}` : ""}
            </span>
        </Link>
    )
}

/** Card de um ambiente na lista do dono: estado, containers com as portas, último deploy e as ações (OPE-211). */
export function EnvironmentCard({ env, pcAvailable, linkHost, onIntent }: { env: EnvironmentDto; pcAvailable: boolean; linkHost: string; onIntent: (intent: CardIntent) => void }) {
    const router = useRouter()
    const action = useEnvironmentAction(env.id)
    const [logs, setLogs] = useState<string | null>(null)
    const health = healthOf(env)
    const runOn = env.deployedOn?.runOn ?? env.runOn
    const onPc = runOn === "pc" || env.buildOn === "pc"
    const blocked = onPc && !pcAvailable ? "PC indisponível (túnel do Builder Machine fechado)" : null
    const deploying = env.lastDeploy?.status === "running"
    const busy = action.isPending || deploying
    const notDeployed = !env.deployedOn ? "O ambiente ainda não foi implantado" : null
    const pending = pendingDeployItems(env)
    const run = (input: Parameters<typeof action.mutate>[0]) =>
        action.mutate(input, {
            onSuccess: (result) => {
                if (result.deployId) onIntent({ kind: "deploy-started", deployId: result.deployId })
                if (result.output !== null) setLogs(result.output)
            },
        })
    const hostReason = blocked ?? notDeployed
    const hostAction = (key: string, label: string, icon: EnvironmentMenuAction["icon"], input: Parameters<typeof action.mutate>[0], group?: boolean): EnvironmentMenuAction => ({ key, label, icon, group, onSelect: () => run(input), disabled: busy || Boolean(hostReason), reason: busy ? "Há uma ação em andamento" : hostReason })
    const movePcAdopted = env.source.kind === "adopted" && env.source.machine === "pc"
    const actions: EnvironmentMenuAction[] = [
        hostAction("up", "Levantar", Play, { action: "up" }),
        hostAction("down", "Derrubar", Square, { action: "down" }),
        hostAction("restart", "Reiniciar", RotateCcw, { action: "restart" }),
        ...(env.source.kind === "managed" ? [{ key: "compose", label: "Compose", icon: FileCode, group: true, onSelect: () => onIntent({ kind: "compose" }) }] : []),
        { key: "history", label: "Histórico de deploys", icon: History, group: env.source.kind !== "managed", onSelect: () => onIntent({ kind: "history" }) },
        { key: "edit", label: "Editar", icon: Pencil, onSelect: () => router.push(environmentEditPath(env.id)), disabled: deploying, reason: deploying ? "Há um deploy em andamento" : null },
        { key: "move", label: "Mover", icon: ArrowRightLeft, onSelect: () => onIntent({ kind: "move" }), disabled: busy || movePcAdopted, reason: movePcAdopted ? "Projeto adotado do PC: os arquivos estão no PC" : busy ? "Há uma ação em andamento" : null },
        { key: "delete", label: "Apagar", icon: Trash2, destructive: true, onSelect: () => onIntent({ kind: "delete" }), disabled: busy, reason: busy ? "Há uma ação em andamento" : null },
    ]
    const version = versionLabel(env)
    const running = runningText(env.services)

    return (
        <>
            <EnvironmentCardFrame
                title={
                    <div className="min-w-0 space-y-1.5">
                        <EnvironmentStateDot health={health} deploying={deploying} />
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                            <ItemNameLink href={environmentEditPath(env.id)} className="text-base font-semibold">
                                {env.name}
                            </ItemNameLink>
                            <span className="font-mono text-xs text-muted-foreground">{env.slug}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary">{SOURCE_LABEL(env)}</Badge>
                            <Badge variant="outline">{placementLabel(env.deployedOn?.buildOn ?? env.buildOn, runOn)}</Badge>
                            <EnvironmentVersionBadge version={version} />
                        </div>
                    </div>
                }
                actions={
                    <>
                        {action.isPending && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Executando" />}
                        <DeployMenu env={env} disabled={busy || Boolean(blocked)} reason={blocked} onDeploy={(ref) => run({ action: "deploy", ref })} />
                        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy || Boolean(hostReason)} title={hostReason ?? "Últimas linhas dos logs"} onClick={() => run({ action: "logs" })}>
                            <FileText className="h-4 w-4" aria-hidden /> Logs
                        </Button>
                        <EnvironmentActionsMenu name={env.name} actions={actions} />
                    </>
                }
                notice={pending.length ? <PendingDeployNotice items={pending} disabled={busy || Boolean(blocked)} reason={blocked} onDeploy={() => run({ action: "deploy", ref: "" })} /> : null}
                containers={<ContainerList items={env.services} host={linkHost} variant="owner" emptyText={env.deployedOn ? "Nenhum container encontrado: faça Levantar ou um novo deploy." : "Nunca implantado: faça o deploy para subir os containers."} />}
                footer={
                    <>
                        <LastDeploy env={env} />
                        <span className="flex flex-wrap gap-x-3">
                            {runOn === "pc" && env.ports.length ? <span title="Repassadas do PC para o servidor">Portas liberadas: {env.ports.join(", ")}</span> : null}
                            {running ? <span>{running}</span> : null}
                        </span>
                    </>
                }
            />
            <LogsDialog title={env.name} output={logs} onClose={() => setLogs(null)} />
        </>
    )
}
