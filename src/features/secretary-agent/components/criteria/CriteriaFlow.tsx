"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Check, CircleDot, Minus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CriteriaStep } from "../../criteria"
import type { CriteriaFlowStep } from "../../criteria-describe"

const row = { initial: { opacity: 0, x: -6 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0 }, transition: { duration: 0.18 } }

const OUTCOME_ICON = { pass: Check, fail: X, skipped: Minus } as const
const OUTCOME_CLASS = { pass: "text-primary", fail: "text-destructive", skipped: "text-muted-foreground" } as const
const OUTCOME_LABEL = { pass: "passou", fail: "barrou", skipped: "não se aplica" } as const

/**
 * Fluxo da decisão em passos verticais. Na aba Critérios mostra o que acontece com "sim" e "não" em cada passo
 * (`flow`); na Simulação, o resultado de cada passo (`steps` de `evaluateCriteria`) com ✓, ✗ ou —.
 */
export function CriteriaFlow({ flow, steps }: { flow?: CriteriaFlowStep[]; steps?: CriteriaStep[] }) {
    if (steps) {
        return <ol className="space-y-2" aria-label="Passo a passo dos critérios">
            <AnimatePresence initial={false}>
                {steps.map((item) => {
                    const Icon = OUTCOME_ICON[item.outcome]
                    return <motion.li key={item.id} {...row} className="flex items-start gap-2 text-sm" data-outcome={item.outcome}>
                        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", OUTCOME_CLASS[item.outcome])} aria-label={OUTCOME_LABEL[item.outcome]} />
                        <span><span className="font-medium">{item.label}</span> <span className="text-muted-foreground">{item.detail}</span></span>
                    </motion.li>
                })}
            </AnimatePresence>
        </ol>
    }
    return <ol className="space-y-2" aria-label="Fluxo da decisão">
        <AnimatePresence initial={false}>
            {(flow ?? []).map((item, index) => (
                <motion.li key={item.id} {...row} className="flex items-start gap-3 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span>
                    <span className="space-y-0.5"><span className="block font-medium">{item.label}</span><span className="block text-xs text-muted-foreground">Sim → {item.yes} · Não → {item.no}</span></span>
                </motion.li>
            ))}
            <motion.li key="reply" {...row} className="flex items-center gap-3 text-sm font-medium text-primary">
                <CircleDot className="h-6 w-6 shrink-0" aria-hidden /> Passou em tudo → responde
            </motion.li>
        </AnimatePresence>
    </ol>
}
