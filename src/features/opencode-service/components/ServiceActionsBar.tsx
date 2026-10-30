"use client"

import { useState } from "react"
import { ArrowUpCircle, Loader2, Play, RotateCw, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { OPENCODE_SERVICE_ACTION_LABELS, type OpencodeServiceAction } from "../constants"
import { useServiceAction } from "../hooks/useOpencodeService"
import type { OpencodeServiceStatusDto } from "../types"

const ICONS: Record<OpencodeServiceAction, typeof Play> = { start: Play, stop: Square, restart: RotateCw, upgrade: ArrowUpCircle }

type Pending = { action: OpencodeServiceAction; version?: string; allowMajor?: boolean }

/** Iniciar, Parar, Reiniciar e Atualizar OpenCode (por SSH), com confirmação e o impacto nas execuções. */
export function ServiceActionsBar({ status }: { status: OpencodeServiceStatusDto }) {
    const action = useServiceAction()
    const [pending, setPending] = useState<Pending | null>(null)
    const running = status.operation?.status === "running"
    const canControl = status.ssh.trusted && !running && !action.isPending
    const up = status.state === "running"
    const update = status.update
    const impact = status.impact.workbenches + status.impact.refinements
    const impactText = impact > 0 ? `Isso interrompe ${status.impact.workbenches} mesa(s) e ${status.impact.refinements} refinamento(s) rodando agora.` : "Nenhuma mesa ou refinamento está rodando agora."

    const run = (item: Pending) => action.mutate({ action: item.action, body: item.action === "upgrade" ? { version: item.version, allowMajor: item.allowMajor } : {} }, { onSettled: () => setPending(null) })
    const button = (item: Pending, label: string, disabled: boolean, variant: "default" | "outline" | "destructive" = "outline") => {
        const Icon = ICONS[item.action]
        const busy = action.isPending && action.variables?.action === item.action
        return (
            <Button type="button" variant={variant} size="sm" className="gap-1.5" disabled={disabled} onClick={() => (item.action === "start" ? run(item) : setPending(item))}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
                {label}
            </Button>
        )
    }

    const title = pending ? (pending.action === "upgrade" ? `Atualizar o OpenCode para a ${pending.version}?` : `${OPENCODE_SERVICE_ACTION_LABELS[pending.action].verb} o serviço do OpenCode?`) : ""
    const description = pending
        ? [
              pending.action === "stop" ? "O serviço só volta pelo botão Iniciar (por SSH)." : null,
              pending.allowMajor ? `A ${pending.version} é de uma major nova e pode ser incompatível com o Opex (feito para o OpenCode 2.x).` : null,
              impactText,
          ]
              .filter(Boolean)
              .join(" ")
        : ""

    return (
        <div className="flex flex-wrap gap-2">
            {button({ action: "start" }, "Iniciar", !canControl || up)}
            {button({ action: "stop" }, "Parar", !canControl || status.state === "stopped", "destructive")}
            {button({ action: "restart" }, "Reiniciar serviço", !canControl)}
            {update?.latestSupported ? button({ action: "upgrade", version: update.latestSupported }, `Atualizar OpenCode (${update.latestSupported})`, !canControl || !update.available || update.latestSupported === update.current, "default") : null}
            {update?.latestMajor ? button({ action: "upgrade", version: update.latestMajor, allowMajor: true }, `Major nova ${update.latestMajor}`, !canControl) : null}
            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(open) => !open && !action.isPending && setPending(null)}
                title={title}
                description={description}
                variant={pending?.action === "stop" || pending?.allowMajor ? "destructive" : "default"}
                confirmLabel={pending ? OPENCODE_SERVICE_ACTION_LABELS[pending.action].verb : ""}
                pending={action.isPending}
                onConfirm={() => pending && run(pending)}
            />
        </div>
    )
}
