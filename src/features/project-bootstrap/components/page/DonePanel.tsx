"use client"

import { motion } from "framer-motion"
import { Ban, PartyPopper } from "lucide-react"
import { centralSettingsPath } from "@/features/agentic/constants"
import type { ProjectBootstrapDto } from "../../types"
import { createdSummary } from "../../view"
import { ProgressRow } from "./ProgressRow"

/** Conclusão (links do repositório, da central e do ambiente, e a porta) ou o resumo do cancelamento. */
export function DonePanel({ bootstrap }: { bootstrap: ProjectBootstrapDto }) {
    if (bootstrap.status === "cancelled") {
        const items = createdSummary(bootstrap)
        return (
            <div className="space-y-3 rounded-md border border-dashed p-4" data-testid="bootstrap-cancelled">
                <p className="flex items-center gap-2 text-sm font-medium">
                    <Ban className="h-4 w-4 text-muted-foreground" aria-hidden /> Bootstrap cancelado. Nada do que já foi criado foi apagado.
                </p>
                {items.length ? (
                    <ul className="space-y-1 pl-6 text-sm text-muted-foreground">
                        {items.map((item) => (
                            <li key={item} className="list-disc">
                                {item}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground">Nada tinha sido criado ainda.</p>
                )}
            </div>
        )
    }
    const { created } = bootstrap
    return (
        <div className="space-y-4" data-testid="bootstrap-done">
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 22 }} className="flex items-center gap-3 rounded-md border border-success/40 bg-success/10 p-4">
                <PartyPopper className="h-6 w-6 shrink-0 text-success" aria-hidden />
                <div>
                    <p className="text-sm font-semibold">Ambiente no ar!</p>
                    <p className="text-xs text-muted-foreground">
                        {bootstrap.repo} provisionado, amarrado e implantado{created.port ? ` na porta ${created.port}` : ""}.
                    </p>
                </div>
            </motion.div>
            <ul className="space-y-2">
                <ProgressRow label="Repositório" description={`${bootstrap.repo} · ${bootstrap.visibility === "private" ? "privado" : "público"} · branch ${bootstrap.branch}`} state="done" href={created.repoUrl} external />
                <ProgressRow label="Central de desenvolvimento" description={bootstrap.directory} state={created.centralId ? "done" : "pending"} href={created.centralId ? centralSettingsPath(created.centralId) : null} />
                <ProgressRow label="Ambiente" description={created.port ? `Porta ${created.port} (anotada em /home/used_ports)` : undefined} state={created.environmentId ? "done" : "pending"} href={created.environmentId ? `/ambientes/${created.environmentId}/editar` : null} />
            </ul>
        </div>
    )
}
