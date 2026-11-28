"use client"

import { motion } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ItemNameLink } from "@/components/list/ItemNameLink"
import { PROJECT_BOOTSTRAP_STEP_LABELS, projectBootstrapPath } from "../constants"
import { activeStepLabel } from "../steps"
import type { ProjectBootstrapSummaryDto } from "../types"
import { BootstrapStatusBadge } from "./BootstrapStatusBadge"

/** Linha de um bootstrap (em andamento ou no histórico): o repositório é o link da página dele. */
export function BootstrapRow({ bootstrap }: { bootstrap: ProjectBootstrapSummaryDto }) {
    const phase = activeStepLabel(bootstrap)
    return (
        <motion.li layout="position" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2.5">
            <div className="min-w-0 space-y-0.5">
                <ItemNameLink href={projectBootstrapPath(bootstrap.id)} className="font-mono text-sm">
                    {bootstrap.repo}
                </ItemNameLink>
                <p className="truncate text-xs text-muted-foreground">
                    {PROJECT_BOOTSTRAP_STEP_LABELS[bootstrap.step]}
                    {phase ? ` · ${phase}` : ""}
                    {bootstrap.attempt > 1 ? ` · tentativa ${bootstrap.attempt}` : ""}
                    {bootstrap.withEnvironment ? "" : " · sem ambiente"} · {formatDistanceToNow(new Date(bootstrap.updatedAt), { addSuffix: true, locale: ptBR })}
                </p>
            </div>
            <BootstrapStatusBadge status={bootstrap.status} />
        </motion.li>
    )
}
