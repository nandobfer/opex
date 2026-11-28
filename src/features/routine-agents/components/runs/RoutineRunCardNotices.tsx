"use client"

import Link from "next/link"
import { AlertTriangle, Moon, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { routineRunPath } from "../../constants"
import { formatDateTime } from "../../format"
import type { RoutineRunDto } from "../../types"

/**
 * Avisos do card de execução (OPE-213): o motivo do Erro, o pendente de Aguardando confirmação com o atalho
 * **Responder** (decisão do dono, 27/11/2026: abre a página da execução; sem Confirmar/Recusar no card) e a próxima
 * verificação da Hibernada.
 */
export function RoutineRunCardNotices({ run }: { run: RoutineRunDto }) {
    if (run.status === "error" && run.error)
        return (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert" data-testid="run-card-error">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 whitespace-pre-line break-words">{run.error}</span>
            </p>
        )
    if (run.status === "awaiting_confirmation" && run.pendingAction && !run.pendingAction.resolvedAt)
        return (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/50 bg-warning/5 px-3 py-2" role="region" aria-label="Ação pendente" data-testid="run-card-pending">
                <ShieldAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">Aguardando sua confirmação</p>
                    <p className="break-words text-sm">{run.pendingAction.summary}</p>
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link href={routineRunPath(run.agentId, run.id)}>Responder</Link>
                </Button>
            </div>
        )
    if (run.status === "hibernating" && run.hibernation)
        return (
            <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground" data-testid="run-card-hibernation">
                <Moon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">
                    Próxima verificação em {formatDateTime(run.hibernation.at)}
                    {run.hibernation.reason ? ` · ${run.hibernation.reason}` : ""}
                </span>
            </p>
        )
    return null
}
