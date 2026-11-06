"use client"

import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ROUTINE_PROVISIONING_LABELS } from "../../status"
import type { RoutineAgentDto } from "../../types"
import { useRoutineProvisioning } from "../../hooks/useRoutineAgents"
import { RoutineBlockedChannels } from "./RoutineBlockedChannels"
import { RoutineExtraChannelsList } from "./RoutineExtraChannelsList"

/**
 * Resultado do subagente de provisionamento: o agente no Engramind, os canais base e os extras com o
 * motivo (com "Remover") e os canais bloqueados. Com erro, mostra a mensagem e "Tentar de novo" (retoma o que faltou, sem duplicar).
 */
export function RoutineProvisioningPanel({ agent }: { agent: RoutineAgentDto }) {
    const provisioning = useRoutineProvisioning()
    const state = agent.provisioning
    const running = state.status === "running" || state.status === "pending"
    return (
        <div className="space-y-4" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2 text-sm">
                {running ? <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> : state.status === "error" ? <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden /> : <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />}
                <span className="font-medium">{ROUTINE_PROVISIONING_LABELS[state.status]}</span>
                <span className="text-muted-foreground">
                    · agente <code>{agent.engramindAgent}</code>
                </span>
            </div>
            {running && (!agent.name || !agent.objective) && <p className="text-xs text-muted-foreground">O subagente está gerando {!agent.name && !agent.objective ? "o nome e o objetivo" : !agent.name ? "o nome" : "o objetivo"} do agente.</p>}
            {state.status === "error" && (
                <div className="space-y-2 rounded-md border border-destructive/40 p-3">
                    <p className="text-sm text-destructive">{state.error}</p>
                    <Button type="button" size="sm" className="gap-1.5" disabled={provisioning.isPending} onClick={() => provisioning.mutate({ id: agent.id, mode: "retry" })}>
                        <RefreshCw className="h-4 w-4" aria-hidden /> Tentar de novo
                    </Button>
                </div>
            )}
            <div className="space-y-1">
                <p className="text-xs font-semibold">Canais assinados sempre</p>
                <ul className="flex flex-wrap gap-1.5 text-xs">
                    {(state.channels.length ? state.channels : ["opex", "agentes/rotineiros/global", agent.channel]).map((channel) => (
                        <li key={channel} className="rounded-full bg-muted px-2 py-0.5">
                            <code>{channel}</code>
                        </li>
                    ))}
                </ul>
            </div>
            <RoutineExtraChannelsList agent={agent} disabled={running} />
            <RoutineBlockedChannels agent={agent} disabled={running} />
            {state.warnings.length > 0 && (
                <ul className="space-y-1 text-xs text-warning">
                    {state.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                    ))}
                </ul>
            )}
            {agent.workdir && (
                <p className="text-xs text-muted-foreground">
                    Pasta no host: <code>{agent.workdir}</code>
                </p>
            )}
            <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={provisioning.isPending || running} onClick={() => provisioning.mutate({ id: agent.id, mode: "reprovision" })}>
                    <RefreshCw className="h-4 w-4" aria-hidden /> Reprovisionar
                </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Reprovisionar reavalia só os canais extras e acrescenta, exceto os bloqueados; nunca remove opex, o global dos rotineiros nem o canal próprio.</p>
        </div>
    )
}
