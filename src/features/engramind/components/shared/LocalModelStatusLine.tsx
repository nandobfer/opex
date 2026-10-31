"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Loader2, XCircle } from "lucide-react"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { LOCAL_MODEL_STATE_HELP } from "../../help/operation"
import type { LocalModelStatus } from "../../types"
import { HelpBadge, toneOf } from "./Badges"

/** O modelo local está baixando ou carregando (Testar/Aplicar esperam). */
export const isLocalModelBusy = (status: LocalModelStatus | null | undefined) => status?.state === "downloading" || status?.state === "loading"

const LABELS: Record<LocalModelStatus["state"], string> = { idle: "ainda não pedido", downloading: "baixando", loading: "carregando", ready: "pronto", failed: "falhou" }

/** Estado do modelo local de embedding (`get_status.embedding.local`): selo, tempo decorrido e erro. */
export function LocalModelStatusLine({ status, compact = false }: { status: LocalModelStatus; compact?: boolean }) {
    const busy = isLocalModelBusy(status)
    const seconds = typeof status.elapsed_ms === "number" ? Math.round(status.elapsed_ms / 1000) : null
    return (
        <div className="flex flex-wrap items-center gap-2 text-xs" role="status" data-testid="local-model-status" data-state={status.state}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-warning" aria-hidden />}
            <HelpBadge value={`modelo local ${LABELS[status.state]}`} tone={busy ? "warning" : toneOf(status.state)} help={LOCAL_MODEL_STATE_HELP[status.state]} />
            <span className="font-mono">{status.model}</span>
            {seconds !== null && (busy || !compact) && (
                <span className="text-muted-foreground">
                    {busy ? "há " : "em "}
                    <AnimatedNumber value={seconds} /> s
                </span>
            )}
            <AnimatePresence initial={false}>
                {status.state === "failed" && status.error && (
                    <motion.span key="error" initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex w-full items-center gap-1 text-destructive">
                        <XCircle className="h-3.5 w-3.5" aria-hidden /> {status.error} — nova tentativa em 30 s, na próxima chamada.
                    </motion.span>
                )}
            </AnimatePresence>
        </div>
    )
}
