"use client"

import { AlertTriangle, Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { joinLabels, type PendingDeployItem } from "../../view"

/** Faixa de aviso do card: o que está salvo e ainda não foi implantado, numa linha, com "Fazer deploy". */
export function PendingDeployNotice({ items, disabled, reason, onDeploy }: { items: PendingDeployItem[]; disabled: boolean; reason: string | null; onDeploy: () => void }) {
    return (
        <div className="flex flex-col gap-2 border-t border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning sm:flex-row sm:items-center" role="status" title={items.map((item) => item.detail).join("\n")}>
            <AlertTriangle className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
            <p className="min-w-0 flex-1">Mudanças salvas ainda não implantadas: {joinLabels(items.map((item) => item.label))}.</p>
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 border-warning/40 bg-transparent text-warning hover:bg-warning/10" disabled={disabled} title={reason ?? undefined} onClick={onDeploy}>
                <Rocket className="h-3.5 w-3.5" aria-hidden /> Fazer deploy
            </Button>
        </div>
    )
}
