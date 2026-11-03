"use client"

import { motion } from "framer-motion"
import type { ConsolidationRun } from "../../../types"

/** Resultado de `run_consolidation`: jobs enfileirados (com `already_queued`) ou o plano por canal. */
export function ConsolidationResult({ result }: { result: ConsolidationRun }) {
    return (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden rounded-md bg-muted/30 px-3 py-2 text-xs" data-testid="consolidation-result">
            {result.dry_run ? (
                <div className="space-y-1">
                    <p className="font-medium">Plano (nada foi gravado)</p>
                    {result.channels.length === 0 && <p className="text-muted-foreground">Nenhum canal com consolidação ativa.</p>}
                    {result.channels.map((plan) => (
                        <p key={plan.channel} className="break-words">
                            <span className="font-mono">{plan.channel}</span>: {plan.duplicates.length} duplicata(s) · {plan.classify.length} para classificar · {plan.stale.flag.length} desatualizada(s) · {plan.stale.archive.length} para arquivar
                            {Object.keys(plan.skipped).length > 0 && <span className="text-muted-foreground"> · puladas: {Object.entries(plan.skipped).map(([task, reason]) => `${task} (${reason})`).join(", ")}</span>}
                        </p>
                    ))}
                </div>
            ) : (
                <div className="space-y-1">
                    <p className="font-medium">Jobs enfileirados</p>
                    {result.jobs.length === 0 && <p className="text-muted-foreground">Nenhum canal com consolidação ativa.</p>}
                    {result.jobs.map((job) => (
                        <p key={`${job.channel}-${job.job_id}`}>
                            <span className="font-mono">{job.channel}</span>: job #{job.job_id}
                            {job.already_queued && <span className="text-muted-foreground"> (já estava na fila)</span>}
                        </p>
                    ))}
                </div>
            )}
        </motion.div>
    )
}
