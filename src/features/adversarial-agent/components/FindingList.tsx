"use client"

import { AnimatePresence, motion } from "framer-motion"
import { FileCode2, ShieldAlert } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { listItem } from "@/components/motion/presets"
import { cn } from "@/lib/utils"
import { FINDING_CATEGORY_LABELS, FINDING_SEVERITY_LABELS, type FindingCategory, type FindingSeverity } from "../constants"

/** Tom da severidade (tokens do tema). */
export const SEVERITY_TONE: Record<FindingSeverity, string> = {
    critical: "bg-destructive/15 text-destructive",
    high: "bg-orange-500/15 text-orange-300",
    medium: "bg-amber-500/15 text-amber-300",
    low: "bg-sky-500/15 text-sky-300",
    nit: "bg-muted text-muted-foreground",
}

export function SeverityBadge({ severity }: { severity: FindingSeverity }) {
    return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", SEVERITY_TONE[severity])}>{FINDING_SEVERITY_LABELS[severity]}</span>
}

export interface FindingView {
    id: string
    severity: FindingSeverity
    title: string
    file: string | null
    line: number | null
    blocking: boolean
    demotedReason: string | null
    category?: FindingCategory
    evidence?: string
    scenario?: string
    suggestion?: string
}

interface FindingListProps {
    findings: readonly FindingView[]
    /** Mostra evidência, cenário e sugestão. */
    detailed?: boolean
    /** Achados bloqueantes com caixa de seleção (painel "Corrigir"): `excluded` são os desmarcados. */
    selectable?: { excluded: readonly string[]; onToggle: (id: string, keep: boolean) => void; disabled?: boolean }
}

/** Achados de uma rodada: bloqueantes em destaque; os demais como sugestões (com a trava aplicada, quando houver). */
export function FindingList({ findings, detailed = false, selectable }: FindingListProps) {
    if (!findings.length) return <p className="text-sm text-muted-foreground">Nenhum achado.</p>
    return (
        <ul className="flex flex-col gap-2" aria-label="Achados do agente adversário">
            <AnimatePresence initial={false}>
                {findings.map((finding) => {
                    const id = `adversarial-finding-${finding.id}`
                    const keep = selectable ? !selectable.excluded.includes(finding.id) : true
                    return (
                        <motion.li
                            key={finding.id}
                            variants={listItem}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className={cn("rounded-md border px-3 py-2 text-sm", finding.blocking ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/20", selectable && finding.blocking && !keep && "opacity-60")}
                        >
                            <div className="flex items-start gap-2">
                                {selectable && finding.blocking ? (
                                    <span className="mt-0.5">
                                        <Checkbox id={id} checked={keep} disabled={selectable.disabled} onCheckedChange={(next) => selectable.onToggle(finding.id, next)} aria-label={`Corrigir ${finding.id}`} />
                                    </span>
                                ) : finding.blocking ? (
                                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="Bloqueia" />
                                ) : null}
                                <div className="min-w-0 flex-1 space-y-1">
                                    <label htmlFor={selectable && finding.blocking ? id : undefined} className="flex flex-wrap items-center gap-1.5">
                                        <span className="font-mono text-xs text-muted-foreground">{finding.id}</span>
                                        <SeverityBadge severity={finding.severity} />
                                        {finding.category && <span className="text-[11px] text-muted-foreground">{FINDING_CATEGORY_LABELS[finding.category]}</span>}
                                        <span className="min-w-0 font-medium">{finding.title}</span>
                                    </label>
                                    {finding.file && (
                                        <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                                            <FileCode2 className="h-3 w-3 shrink-0" aria-hidden />
                                            <span className="truncate">
                                                {finding.file}
                                                {finding.line ? `:${finding.line}` : ""}
                                            </span>
                                        </p>
                                    )}
                                    {!finding.blocking && finding.demotedReason && <p className="text-xs text-muted-foreground">Não bloqueia: {finding.demotedReason}.</p>}
                                    {detailed && (
                                        <dl className="space-y-1 pt-1 text-xs">
                                            {finding.evidence && (
                                                <div>
                                                    <dt className="font-medium text-muted-foreground">Evidência</dt>
                                                    <dd className="whitespace-pre-wrap">{finding.evidence}</dd>
                                                </div>
                                            )}
                                            {finding.scenario && (
                                                <div>
                                                    <dt className="font-medium text-muted-foreground">Cenário</dt>
                                                    <dd className="whitespace-pre-wrap">{finding.scenario}</dd>
                                                </div>
                                            )}
                                            {finding.suggestion && (
                                                <div>
                                                    <dt className="font-medium text-muted-foreground">Sugestão</dt>
                                                    <dd className="whitespace-pre-wrap">{finding.suggestion}</dd>
                                                </div>
                                            )}
                                        </dl>
                                    )}
                                </div>
                            </div>
                        </motion.li>
                    )
                })}
            </AnimatePresence>
        </ul>
    )
}
