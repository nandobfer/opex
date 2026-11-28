"use client"

import { motion } from "framer-motion"
import { AlertTriangle, Check, SkipForward, X, type LucideIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { resolvedTrackIndex, trackPosition } from "./track"

export interface WizardStep {
    id: string
    label: string
    icon: LucideIcon
}

/** Estado de uma etapa com progresso ao vivo (ex.: bootstrap de projeto). */
export type WizardStepStatus = "idle" | "running" | "waiting" | "failed" | "done" | "skipped"

interface WizardStepperProps {
    steps: ReadonlyArray<WizardStep>
    /** Índice (0-based) da etapa atual (a aberta). */
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
    /**
     * Estado de cada etapa (cor do círculo, ícone e barra): sem a prop, vale o comportamento clássico
     * (concluídas antes da atual). Com ela, a trilha fica verde até a última etapa concluída ou pulada
     * (em sequência desde a primeira) e roxa de lá até `trackIndex`.
     */
    statuses?: ReadonlyArray<WizardStepStatus>
    /** Progresso (0–1) de cada etapa, numa barra abaixo do rótulo (só com `statuses`). */
    progress?: ReadonlyArray<number>
    /** Rótulo curto abaixo da etapa (ex.: "Tentativa 3"). */
    badges?: ReadonlyArray<string | null>
    /** Etapa até onde a trilha preenche (com `statuses`; padrão: `current`). */
    trackIndex?: number
}

const STATUS_CIRCLE: Record<WizardStepStatus, string> = {
    idle: "border-border text-muted-foreground",
    running: "border-primary text-primary",
    waiting: "border-warning text-warning",
    failed: "border-destructive text-destructive",
    done: "border-success bg-success text-background",
    skipped: "border-dashed border-muted-foreground/60 text-muted-foreground",
}

const STATUS_BAR: Record<WizardStepStatus, string> = {
    idle: "bg-muted-foreground/40",
    running: "bg-primary",
    waiting: "bg-warning",
    failed: "bg-destructive",
    done: "bg-success",
    skipped: "bg-muted-foreground/40",
}

const STATUS_LABEL: Record<WizardStepStatus, string> = { idle: "", running: "em andamento", waiting: "aguardando você", failed: "falhou", done: "concluída", skipped: "não se aplica" }

/**
 * Stepper horizontal de assistentes (copiado do wizard "Gerar contrato" do Smart Desk, com as
 * cores do tema). Cada etapa é clicável até `maxReachable`; a trilha preenche até o centro do
 * círculo da etapa atual, com animação do Framer Motion. Com `statuses`, cada etapa mostra o próprio
 * estado (em andamento com o anel girando, aguardando você, falhou, concluída) e a barra de progresso.
 *
 * Geometria: a trilha é dividida em `steps.length` segmentos. O centro de cada círculo fica no
 * meio do seu segmento (`(index + 0.5) / steps.length`), então a linha passa pelos círculos
 * independentemente do tamanho dos rótulos.
 */
export function WizardStepper({ steps, current, maxReachable, pending, disabled = false, onStepClick, className, "aria-label": ariaLabel = "Etapas", statuses, progress: stepProgress, badges, trackIndex }: WizardStepperProps) {
    const track = statuses ? (trackIndex ?? current) : current
    const progress = steps.length > 0 ? (track + 0.5) / steps.length : 0
    // Só com `statuses`: verde até a última concluída/pulada; a roxa segue por baixo até a atual.
    const resolved = statuses ? trackPosition(resolvedTrackIndex(statuses), steps.length) : 0

    return (
        <nav aria-label={ariaLabel} className={cn("relative overflow-x-auto rounded-md border bg-card px-4 py-4 shadow-sm", className)}>
            <ol className="relative flex min-w-max items-start justify-between gap-3">
                <div className="absolute inset-x-0 top-[18px] z-0 h-0.5 -translate-y-1/2 rounded-full bg-border" aria-hidden>
                    <motion.div
                        data-testid="wizard-track"
                        className="h-full rounded-full bg-primary"
                        initial={false}
                        animate={{ scaleX: progress }}
                        style={{ originX: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                    />
                    {statuses && (
                        <motion.div
                            data-testid="wizard-track-resolved"
                            className="absolute inset-y-0 left-0 w-full rounded-full bg-success"
                            initial={false}
                            animate={{ scaleX: resolved }}
                            style={{ originX: 0 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                        />
                    )}
                </div>

                {steps.map((step, index) => {
                    const isCurrent = index === current
                    const status = statuses?.[index] ?? null
                    const isDone = status ? status === "done" : index < current
                    const pendingFields = pending?.[index] ?? []
                    const pendingText = pendingFields.length === 1 ? `Campo pendente: ${pendingFields[0]}` : `Campos pendentes: ${pendingFields.join(", ")}`
                    const reachable = !disabled && index <= maxReachable
                    const Icon = isDone ? Check : status === "failed" ? X : status === "skipped" ? SkipForward : step.icon
                    const value = Math.max(0, Math.min(1, stepProgress?.[index] ?? 0))
                    const badge = badges?.[index] ?? null

                    return (
                        <li key={step.id} className="relative z-10 flex min-w-max flex-1 flex-col items-center gap-1.5 px-2">
                            <button
                                type="button"
                                disabled={!reachable}
                                aria-current={isCurrent ? "step" : undefined}
                                aria-label={`Etapa ${index + 1}: ${step.label}${status && STATUS_LABEL[status] ? ` (${STATUS_LABEL[status]})` : ""}`}
                                data-status={status ?? undefined}
                                onClick={() => reachable && onStepClick(index)}
                                className={cn(
                                    "relative flex h-9 w-9 items-center justify-center rounded-full border-2 bg-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    reachable ? "cursor-pointer" : "cursor-not-allowed",
                                    status
                                        ? cn(STATUS_CIRCLE[status], isCurrent && "ring-2 ring-primary/40 ring-offset-2 ring-offset-card")
                                        : isCurrent
                                          ? "border-primary text-primary"
                                          : isDone
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : reachable
                                              ? "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
                                              : "border-border text-muted-foreground/60",
                                )}
                            >
                                {status === "running" && (
                                    <motion.span
                                        className="absolute -inset-1 rounded-full border-2 border-transparent border-t-primary"
                                        animate={{ rotate: 360 }}
                                        transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
                                        aria-hidden
                                    />
                                )}
                                <motion.span
                                    key={`${step.id}-${status ?? (isDone ? "done" : "todo")}`}
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
                            {status && (
                                <span className="h-1 w-16 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Progresso de ${step.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
                                    <motion.span className={cn("block h-full rounded-full", STATUS_BAR[status])} initial={false} animate={{ width: `${value * 100}%` }} transition={{ duration: 0.3, ease: "easeOut" }} />
                                </span>
                            )}
                            {badge && <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">{badge}</span>}
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}
