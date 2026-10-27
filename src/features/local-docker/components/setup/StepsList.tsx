"use client"

import { motion } from "framer-motion"
import { CheckCircle2, XCircle } from "lucide-react"
import type { LocalDockerStepDto } from "../../types"

/** Resultado passo a passo de uma ação no PC. */
export function StepsList({ steps }: { steps: LocalDockerStepDto[] }) {
    return (
        <ul className="space-y-1 text-sm">
            {steps.map((step, index) => (
                <motion.li key={`${step.label}-${index}`} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18, delay: index * 0.04 }} className="flex items-start gap-2">
                    {step.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />}
                    <span>
                        <span className="font-medium">{step.label}</span> <span className="text-muted-foreground">— {step.detail}</span>
                    </span>
                </motion.li>
            ))}
        </ul>
    )
}
