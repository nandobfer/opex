"use client"

import { motion } from "framer-motion"
import { AlertTriangle, Check, type LucideIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface WizardStep {
    id: string
    label: string
    icon: LucideIcon
}

interface WizardStepperProps {
    steps: ReadonlyArray<WizardStep>
    /** Índice (0-based) da etapa atual. */
    current: number
    /** Maior índice navegável (etapas além dele ficam bloqueadas). */
    maxReachable: number
    /** Campos com pendência por etapa — exibidos como alerta no círculo. */
    pending?: ReadonlyArray<ReadonlyArray<string>>
    /** Trava toda a navegação. */
    disabled?: boolean
    onStepClick: (index: number) => void
    className?: string
    "aria-label"?: string
}

/**
 * Stepper horizontal de assistentes (copiado do wizard "Gerar contrato" do Smart Desk, com as
 * cores do tema). Cada etapa é clicável até `maxReachable`; a trilha preenche até o centro do
 * círculo da etapa atual, com animação do Framer Motion.
 *
 * Geometria: a trilha é dividida em `steps.length` segmentos. O centro de cada círculo fica no
 * meio do seu segmento (`(index + 0.5) / steps.length`), então a linha passa pelos círculos
 * independentemente do tamanho dos rótulos.
 */
export function WizardStepper({ steps, current, maxReachable, pending, disabled = false, onStepClick, className, "aria-label": ariaLabel = "Etapas" }: WizardStepperProps) {
    const progress = steps.length > 0 ? (current + 0.5) / steps.length : 0

    return (
        <nav aria-label={ariaLabel} className={cn("relative overflow-x-auto rounded-md border bg-card px-4 py-4 shadow-sm", className)}>
            <ol className="relative flex min-w-max items-start justify-between gap-3">
                <div className="absolute inset-x-0 top-[18px] z-0 h-0.5 -translate-y-1/2 rounded-full bg-border" aria-hidden>
                    <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={false}
                        animate={{ scaleX: progress }}
                        style={{ originX: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                    />
                </div>

                {steps.map((step, index) => {
                    const isCurrent = index === current
                    const isDone = index < current
                    const pendingFields = pending?.[index] ?? []
                    const pendingText = pendingFields.length === 1 ? `Campo pendente: ${pendingFields[0]}` : `Campos pendentes: ${pendingFields.join(", ")}`
                    const reachable = !disabled && index <= maxReachable
                    const Icon = isDone ? Check : step.icon

                    return (
                        <li key={step.id} className="relative z-10 flex min-w-max flex-1 flex-col items-center gap-1.5 px-2">
                            <button
                                type="button"
                                disabled={!reachable}
                                aria-current={isCurrent ? "step" : undefined}
                                aria-label={`Etapa ${index + 1}: ${step.label}`}
                                onClick={() => reachable && onStepClick(index)}
                                className={cn(
                                    "flex h-9 w-9 items-center justify-center rounded-full border-2 bg-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    reachable ? "cursor-pointer" : "cursor-not-allowed",
                                    isCurrent
                                        ? "border-primary text-primary"
                                        : isDone
                                          ? "border-primary bg-primary text-primary-foreground"
                                          : reachable
                                            ? "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
                                            : "border-border text-muted-foreground/60",
                                )}
                            >
                                <motion.span
                                    key={`${step.id}-${isDone ? "done" : "todo"}`}
                                    initial={{ scale: 0.6, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 280, damping: 18 }}
                                    className="flex items-center justify-center"
                                >
                                    <Icon className="h-4 w-4" aria-hidden />
                                </motion.span>
                            </button>
                            {pendingFields.length > 0 && (
                                <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                aria-label={pendingText}
                                                className="absolute left-1/2 top-0 z-20 -mt-1 ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-warning/40 bg-warning/15 text-warning shadow-sm outline-none transition-colors hover:bg-warning/25 focus-visible:ring-2 focus-visible:ring-amber-400/50"
                                            >
                                                <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2.7} aria-hidden />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-[280px] text-xs font-medium leading-relaxed">
                                            {pendingText}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                            <span className={cn("whitespace-nowrap text-center text-[11px] font-semibold leading-tight transition-colors sm:text-xs", isCurrent ? "text-primary" : isDone ? "text-foreground" : "text-muted-foreground")}>
                                {step.label}
                            </span>
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}
