"use client"

import { Check, ShieldAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { RoutinePendingActionDto } from "../../types"
import { formatDateTime } from "../../format"

/** Ação irreversível pendente: o resumo, a entrada (sem segredos) e Confirmar/Recusar. */
export function RoutinePendingAction({ action, pending, onResolve }: { action: RoutinePendingActionDto; pending: boolean; onResolve: (decision: "confirm" | "reject") => void }) {
    const open = !action.resolvedAt
    return (
        <div className="space-y-2 rounded-lg border border-warning/50 bg-warning/5 p-3" role="region" aria-label="Ação pendente">
            <p className="flex items-center gap-2 text-sm font-semibold">
                <ShieldAlert className="h-4 w-4 text-warning" aria-hidden /> {open ? "Aguardando sua confirmação" : action.resolution === "confirmed" ? "Ação confirmada" : "Ação recusada"}
            </p>
            <p className="text-sm">{action.summary}</p>
            {action.toolLabel && <p className="text-xs text-muted-foreground">Ferramenta: {action.toolLabel}</p>}
            {action.input && <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-[11px]">{action.input}</pre>}
            <p className="text-[11px] text-muted-foreground">Pedida em {formatDateTime(action.requestedAt)}</p>
            {open && (
                <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" className="gap-1.5" disabled={pending} onClick={() => onResolve("confirm")}>
                        <Check className="h-4 w-4" aria-hidden /> Confirmar
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={pending} onClick={() => onResolve("reject")}>
                        <X className="h-4 w-4" aria-hidden /> Recusar
                    </Button>
                </div>
            )}
        </div>
    )
}
