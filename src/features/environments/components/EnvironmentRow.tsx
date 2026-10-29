"use client"

import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowRightLeft, FileText, History, Pencil, Play, RefreshCw, RotateCcw, Square, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useEnvironmentAction } from "../hooks/useEnvironments"
import type { EnvironmentDto } from "../types"
import { healthOf, placementLabel, versionLabel } from "../view"
import { DeployMenu } from "./DeployMenu"
import { EnvironmentActionButton as RowButton, EnvironmentStatusBadges } from "./EnvironmentStatus"
import { LogsDialog } from "./LogsDialog"

export type RowIntent = { kind: "edit" | "delete" | "move" | "history" } | { kind: "deploy-started"; deployId: string }

/** Linha de um ambiente: estado, portas, CPU/RAM, ref/commit, último deploy e as ações. */
export function EnvironmentRow({ env, pcAvailable, onIntent, onOpenDeploy }: { env: EnvironmentDto; pcAvailable: boolean; onIntent: (intent: RowIntent) => void; onOpenDeploy: (deployId: string) => void }) {
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

    return (
        <div className="flex flex-col gap-2 py-3 md:flex-row md:items-center">
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{env.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{env.slug}</span>
                    <EnvironmentStatusBadges health={health} deploying={deploying} version={version} />
                    {env.source.kind === "adopted" && <Badge variant="secondary">{env.source.git ? "Adotado" : "Adotado (sem git)"}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                    {placementLabel(env.deployedOn?.buildOn ?? env.buildOn, env.deployedOn?.runOn ?? env.runOn)}
                    {env.ports.length ? ` · portas ${env.ports.join(", ")}` : ""}
                    {env.services.length ? ` · ${env.services.filter((service) => service.state === "running").length}/${env.services.length} serviço(s)` : ""}
                    {cpu ? ` · CPU ${cpu}` : ""}
                    {memory ? ` · RAM ${memory}` : ""}
                </p>
                {env.lastDeploy && (
                    <button type="button" className="text-left text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => onOpenDeploy(env.lastDeploy!.id)}>
                        Último deploy {env.lastDeploy.status === "success" ? "ok" : env.lastDeploy.status === "failed" ? "com falha" : "em andamento"} {formatDistanceToNow(new Date(env.lastDeploy.startedAt), { addSuffix: true, locale: ptBR })}
                        {env.lastDeploy.ref ? ` · ${env.lastDeploy.ref}` : ""}
                        {env.lastDeploy.commit ? ` @ ${env.lastDeploy.commit.slice(0, 8)}` : ""}
                    </button>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
                <DeployMenu env={env} disabled={busy || Boolean(blocked)} reason={blocked} onDeploy={(ref) => run({ action: "deploy", ref })} />
                <RowButton label="Levantar" icon={Play} disabled={busy || Boolean(blocked) || !env.deployedOn} onClick={() => run({ action: "up" })} />
                <RowButton label="Derrubar" icon={Square} disabled={busy || Boolean(blocked) || !env.deployedOn} onClick={() => run({ action: "down" })} />
                <RowButton label="Reiniciar" icon={RotateCcw} disabled={busy || Boolean(blocked) || !env.deployedOn} onClick={() => run({ action: "restart" })} />
                <RowButton label="Logs" icon={FileText} disabled={busy || Boolean(blocked) || !env.deployedOn} onClick={() => run({ action: "logs" })} />
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
