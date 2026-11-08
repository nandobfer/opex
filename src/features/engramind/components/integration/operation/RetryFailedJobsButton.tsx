"use client"

import { RotateCw } from "lucide-react"
import { ReasonButton } from "@/components/ui/reason-button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { cn } from "@/lib/utils"
import { RETRY_BATCH_MAX } from "../../../job-retry-batch"
import type { RetryFailedJobsState } from "../../../hooks/useRetryFailedJobs"

const plural = (count: number) => (count === 1 ? "job falho" : "jobs falhos")

/** "Retentar todos" do card Jobs: botão com motivo do bloqueio, confirmação com a contagem e progresso. */
export function RetryFailedJobsButton({ batch }: { batch: RetryFailedJobsState }) {
    const { phase, progress, targets } = batch
    const count = targets.ids.length
    return (
        <>
            <ReasonButton variant="outline" size="sm" disabledReason={batch.blockedReason} disabled={batch.running || phase === "confirming"} onClick={() => void batch.start()}>
                <RotateCw aria-hidden className={cn("size-4", batch.running && "animate-spin")} />
                {phase === "collecting" ? (
                    "Contando…"
                ) : phase === "running" ? (
                    <span>
                        Retentando <AnimatedNumber value={progress.done} />/{progress.total}…
                    </span>
                ) : (
                    "Retentar todos"
                )}
            </ReasonButton>
            <ConfirmDialog
                open={phase === "confirming" || phase === "running"}
                onOpenChange={(open) => !open && batch.cancel()}
                title={`Recolocar ${count} ${plural(count)} na fila?`}
                description={[
                    "Cada job volta para a fila com as tentativas zeradas.",
                    targets.kind ? `Só jobs do tipo ${targets.kind}.` : null,
                    targets.truncated ? `Há mais de ${RETRY_BATCH_MAX} jobs falhos; serão retentados os ${RETRY_BATCH_MAX} mais recentes. Rode de novo para o restante.` : null,
                ]
                    .filter(Boolean)
                    .join(" ")}
                confirmLabel={phase === "running" ? `Retentando ${progress.done}/${progress.total}…` : "Retentar todos"}
                pending={phase === "running"}
                onConfirm={() => void batch.confirm()}
            />
        </>
    )
}
