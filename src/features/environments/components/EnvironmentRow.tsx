"use client"

import { useState } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowRightLeft, FileCode, FileText, History, Pencil, Play, RefreshCw, RotateCcw, Square, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { deployPath } from "../constants"
import { useEnvironmentAction } from "../hooks/useEnvironments"
import { composeNotDeployed } from "../managed-compose"
import type { EnvironmentDto } from "../types"
import { limitsPendingDeploy } from "../limits-form"
import { appliedLimitsText, environmentLimitsText } from "../resource-limits"
import { composeOverridesPendingDeploy, composeOverridesShortText, composeOverridesText } from "../service-overrides"
import { healthOf, placementLabel, versionLabel } from "../view"
import { DeployMenu } from "./DeployMenu"
import { EnvironmentActionButton as RowButton, EnvironmentStatusBadges } from "./EnvironmentStatus"
import { LogsDialog } from "./LogsDialog"

export type RowIntent = { kind: "edit" | "delete" | "move" | "history" | "compose" } | { kind: "deploy-started"; deployId: string }

/** Linha de um ambiente: estado, portas, CPU/RAM, ref/commit, último deploy (link para o log) e as ações. */
export function EnvironmentRow({ env, pcAvailable, onIntent }: { env: EnvironmentDto; pcAvailable: boolean; onIntent: (intent: RowIntent) => void }) {
    const action = useEnvironmentAction(env.id)
    const [logs, setLogs] = useState<string | null>(null)
    const health = healthOf(env)
    const version = versionLabel(env)
    const onPc = (env.deployedOn?.runOn ?? env.runOn) === "pc" || env.buildOn === "pc"
    const blocked = onPc && !pcAvailable ? "PC indisponível (túnel do Builder Machine fechado)" : null
    const deploying = env.lastDeploy?.status === "running"
    const busy = action.isPending || deploying
    const run = (input: Parameters<typeof action.mutate>[0]) =>
        action.mutate(input, {
            onSuccess: (result) => {
                if (result.deployId) onIntent({ kind: "deploy-started", deployId: result.deployId })
                if (result.output !== null) setLogs(result.output)
            },
        })
    const cpu = env.services.map((service) => service.cpu).filter(Boolean).join(" · ")
    const memory = env.services.map((service) => service.memory?.split("/")[0]?.trim()).filter(Boolean).join(" · ")
    const limits = appliedLimitsText(env.services)
    const pendingLimits = limitsPendingDeploy(env)
    const pendingOverrides = composeOverridesPendingDeploy(env)
    const overrides = composeOverridesShortText(env.deployedComposeOverrides)

    return (
        <div className="flex flex-col gap-2 py-3 md:flex-row md:items-center">
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{env.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{env.slug}</span>
                    <EnvironmentStatusBadges health={health} deploying={deploying} version={version} />
                    {env.source.kind === "adopted" && <Badge variant="secondary">{env.source.git ? "Adotado" : "Adotado (sem git)"}</Badge>}
                    {env.source.kind === "managed" && <Badge variant="secondary">Gerenciado v{env.source.composeVersion}</Badge>}
                    {pendingLimits && (
                        <Badge variant="outline" className="border-warning/50 text-warning" title={`Salvos: ${environmentLimitsText(env.limits)}`}>
                            Limites salvos diferem dos aplicados: faça Deploy
                        </Badge>
                    )}
                    {pendingOverrides && (
                        <Badge variant="outline" className="border-warning/50 text-warning" title={`Salvos: ${composeOverridesText(env.composeOverrides) || "sem ajustes"}`}>
                            Ajustes dos serviços salvos diferem dos implantados: faça Deploy
                        </Badge>
                    )}
                </div>
                {composeNotDeployed(env) && (
                    <p className="text-xs text-warning">
                        Há compose novo não implantado (implantada: {env.deployedComposeVersion ? `v${env.deployedComposeVersion}` : "nenhuma"}). Faça o deploy para aplicar.
                    </p>
                )}
                <p className="text-xs text-muted-foreground">
                    {placementLabel(env.deployedOn?.buildOn ?? env.buildOn, env.deployedOn?.runOn ?? env.runOn)}
                    {env.ports.length ? ` · portas ${env.ports.join(", ")}` : ""}
                    {env.services.length ? ` · ${env.services.filter((service) => service.state === "running").length}/${env.services.length} serviço(s)` : ""}
                    {cpu ? ` · CPU ${cpu}` : ""}
                    {memory ? ` · RAM ${memory}` : ""}
                    {limits ? ` · limites: ${limits}` : ""}
                    {overrides ? ` · serviços: ${overrides}` : ""}
                </p>
                {env.lastDeploy && (
                    <Link href={deployPath(env.lastDeploy.id)} className="block w-fit rounded-sm text-left text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        Último deploy {env.lastDeploy.status === "success" ? "ok" : env.lastDeploy.status === "failed" ? "com falha" : "em andamento"} {formatDistanceToNow(new Date(env.lastDeploy.startedAt), { addSuffix: true, locale: ptBR })}
                        {env.lastDeploy.ref ? ` · ${env.lastDeploy.ref}` : ""}
                        {env.lastDeploy.commit ? ` @ ${env.lastDeploy.commit.slice(0, 8)}` : ""}
                    </Link>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
                <DeployMenu env={env} disabled={busy || Boolean(blocked)} reason={blocked} onDeploy={(ref) => run({ action: "deploy", ref })} />
                <RowButton label="Levantar" icon={Play} disabled={busy || Boolean(blocked) || !env.deployedOn} onClick={() => run({ action: "up" })} />
                <RowButton label="Derrubar" icon={Square} disabled={busy || Boolean(blocked) || !env.deployedOn} onClick={() => run({ action: "down" })} />
                <RowButton label="Reiniciar" icon={RotateCcw} disabled={busy || Boolean(blocked) || !env.deployedOn} onClick={() => run({ action: "restart" })} />
                <RowButton label="Logs" icon={FileText} disabled={busy || Boolean(blocked) || !env.deployedOn} onClick={() => run({ action: "logs" })} />
                {env.source.kind === "managed" && <RowButton label="Compose" icon={FileCode} onClick={() => onIntent({ kind: "compose" })} />}
                <RowButton label="Histórico" icon={History} onClick={() => onIntent({ kind: "history" })} />
                <RowButton label="Editar" icon={Pencil} disabled={deploying} onClick={() => onIntent({ kind: "edit" })} />
                <RowButton label="Mover" icon={ArrowRightLeft} disabled={busy || (env.source.kind === "adopted" && env.source.machine === "pc")} onClick={() => onIntent({ kind: "move" })} />
                <RowButton label="Apagar" icon={Trash2} disabled={busy} onClick={() => onIntent({ kind: "delete" })} />
                {action.isPending && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Executando" />}
            </div>
            <LogsDialog title={env.name} output={logs} onClose={() => setLogs(null)} />
        </div>
    )
}
