"use client"

import { ShieldQuestion } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { OpencodePermissionDto } from "@/lib/ai/opencode-events"

/**
 * Pedido de permissão do agente (ferramenta/ação) com aprovar uma vez, aprovar sempre ou recusar.
 * Presentacional: quem usa passa `onReply`/`pending` (mesa de trabalho, refinamento de tarefas).
 */
export function PermissionCard({ permission, pending, onReply }: { permission: OpencodePermissionDto; pending: boolean; onReply: (decision: "once" | "always" | "reject") => void }) {
    return (
        <div className="rounded-lg border border-amber-500/40 bg-background p-3" role="alertdialog" aria-label="Pedido de permissão do agente">
            <p className="flex items-center gap-2 text-sm font-medium">
                <ShieldQuestion className="h-4 w-4 text-amber-300" aria-hidden /> O agente pede permissão: <span className="font-mono">{permission.action}</span>
            </p>
            {permission.message && <p className="mt-1 text-sm text-muted-foreground">{permission.message}</p>}
            {permission.resources.length > 0 && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 font-mono text-[11px]">{permission.resources.join("\n")}</pre>}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onReply("reject")}>
                    Recusar
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onReply("always")}>
                    Aprovar sempre
                </Button>
                <Button type="button" size="sm" disabled={pending} onClick={() => onReply("once")}>
                    Aprovar uma vez
                </Button>
            </div>
        </div>
    )
}
