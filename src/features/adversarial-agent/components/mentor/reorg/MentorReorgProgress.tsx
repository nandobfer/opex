"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Loader2, X } from "lucide-react"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { MENTOR_REORG_STATUS_LABELS, type MentorReorgStatus } from "../../../mentor/constants"
import type { MentorReorgDto } from "../../../mentor/types"
import { formatReorgCost, formatReorgDuration } from "./format"

const TONE: Record<MentorReorgStatus, string> = {
    queued: "bg-muted text-muted-foreground",
    running: "bg-primary/15 text-primary",
    ready: "bg-sky-500/15 text-sky-300",
    applying: "bg-primary/15 text-primary",
    applied: "bg-emerald-500/15 text-emerald-300",
    partial: "bg-amber-500/15 text-amber-300",
    failed: "bg-destructive/15 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
    discarded: "bg-muted text-muted-foreground",
}

/** Selo da situação de uma reorganização. */
export function MentorReorgBadge({ status }: { status: MentorReorgStatus }) {
    const busy = status === "queued" || status === "running" || status === "applying"
    return (
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", TONE[status])}>
            {busy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
            {MENTOR_REORG_STATUS_LABELS[status]}
        </span>
    )
}

/** Progresso e custo da revisão, com cancelar enquanto ela roda. */
export function MentorReorgProgress({ plan, onCancel, cancelling }: { plan: MentorReorgDto; onCancel: () => void; cancelling: boolean }) {
    const running = plan.status === "queued" || plan.status === "running"
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <MentorReorgBadge status={plan.status} />
                <span className="text-muted-foreground">
                    <AnimatedNumber value={plan.done} /> de {plan.total} memórias revisadas
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{formatReorgCost(plan.costUsd)}</span>
                {plan.durationMs !== null && (
                    <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{formatReorgDuration(plan.durationMs)}</span>
                    </>
                )}
                {running && (
                    <Button type="button" variant="outline" size="sm" className="ml-auto gap-1.5" disabled={cancelling} onClick={onCancel}>
                        <X className="h-3.5 w-3.5" aria-hidden /> Cancelar
                    </Button>
                )}
            </div>
            {(running || plan.status === "applying") && <Progress value={plan.done} max={Math.max(plan.total, 1)} className="h-2" />}
            <AnimatePresence initial={false}>
                {plan.error && (
                    <motion.p key="error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {plan.error}
                    </motion.p>
                )}
            </AnimatePresence>
        </div>
    )
}
