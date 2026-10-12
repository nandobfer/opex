"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Clock, Loader2, RefreshCw, Sparkles, TrendingUp, User, Wallet } from "lucide-react"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatNumberBR } from "@/lib/format"
import { formatFactorLabel, formatHoursLabel } from "@/features/orcamentos/logic"
import { updateTaskEstimateSchema } from "../../schemas"
import { useGenerateTaskEstimate } from "../../hooks/useGenerateTaskEstimate"
import { useUpdateTaskEstimate } from "../../hooks/useTasks"
import type { TaskDetailDto } from "../../types"

/** Aceita vírgula ou ponto como separador decimal (ex.: "2,5" e "2.5"). */
const parseHours = (value: string): number => Number(value.trim().replace(",", "."))

/**
 * Estimativa da tarefa (coluna lateral), visível **com ou sem cliente**: as **horas reais** são
 * sempre editáveis (ou geradas por IA) e, **com cliente**, o **prazo** (`H × fator`) e o
 * **faturamento** (`prazo × custo/hora`) são recalculados pelo servidor com o cliente da tarefa.
 * Sem cliente, só as horas reais valem (sem inflação).
 */
export function TaskEstimateCard({ task }: { task: TaskDetailDto }) {
    const estimate = task.estimate
    const save = useUpdateTaskEstimate(task.id, task.code)
    const generate = useGenerateTaskEstimate(task.id, task.code)
    const [draft, setDraft] = useState<string | null>(null)

    // Enquanto o usuário não digita, o campo acompanha o valor vindo do servidor.
    const value = draft ?? (estimate ? String(estimate.hours) : "")
    const parsed = parseHours(value)
    const valid = updateTaskEstimateSchema.safeParse({ hours: parsed }).success
    const changed = valid && value.trim() !== "" && parsed !== (estimate?.hours ?? null)

    // A inflação só existe com cliente: sem ele, o card mostra apenas as horas reais.
    const showCommercial = Boolean(task.clientId) && Boolean(estimate)
    const saving = save.isPending

    const submit = async () => {
        if (!changed) return
        try {
            await save.mutateAsync(parsed)
            setDraft(null)
        } catch {
            // Toast já mostrado; o campo fica como está para corrigir.
        }
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estimativa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
                <div className="space-y-1.5">
                    <label htmlFor={`estimate-hours-${task.id}`} className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Horas estimadas
                    </label>
                    <div className="flex gap-2">
                        <Input
                            id={`estimate-hours-${task.id}`}
                            inputMode="decimal"
                            value={value}
                            placeholder="0"
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") void submit()
                            }}
                            className="flex-1 font-mono"
                            aria-label="Horas estimadas"
                            disabled={saving}
                        />
                        <Button type="button" size="sm" className="gap-1.5" disabled={!changed || saving} onClick={submit} aria-label="Salvar horas estimadas">
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                            Salvar
                        </Button>
                    </div>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                    {generate.running ? (
                        <motion.p key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {generate.notice ?? "Estimando…"}
                        </motion.p>
                    ) : generate.error ? (
                        <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-1.5">
                            <p className="text-xs text-destructive">{generate.error}</p>
                            <Button type="button" variant="outline" size="sm" className="w-full gap-1.5" onClick={() => void generate.generate()}>
                                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Tentar novamente
                            </Button>
                        </motion.div>
                    ) : (
                        <motion.div key="action" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                            <Button type="button" variant="outline" size="sm" className="w-full gap-1.5" onClick={() => void generate.generate()} disabled={saving}>
                                <Sparkles className="h-3.5 w-3.5" aria-hidden /> {estimate ? "Regerar com IA" : "Estimar com IA"}
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {showCommercial && estimate ? (
                    <dl className="space-y-2 border-t pt-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                            <dt className="flex items-center gap-1.5 text-muted-foreground">
                                <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Prazo do cliente (× {formatFactorLabel(estimate.factor)})
                            </dt>
                            <dd className="font-mono font-medium">
                                <AnimatedNumber value={estimate.clientHours} formatter={(value) => `${formatHoursLabel(value)} h`} />
                            </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <dt className="flex items-center gap-1.5 text-muted-foreground">
                                <Wallet className="h-3.5 w-3.5" aria-hidden /> Faturamento estimado
                            </dt>
                            <dd className="font-mono font-medium">
                                <AnimatedNumber value={estimate.billingBrl} formatter={(value) => `R$ ${formatNumberBR(value)}`} />
                            </dd>
                        </div>
                    </dl>
                ) : (
                    <p className="flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" aria-hidden /> {estimate ? "Estimativa real de horas (sem cliente)." : "Ainda não estimada."}
                    </p>
                )}

                {showCommercial && task.estimateClientName && (
                    <p className="flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
                        <User className="h-3.5 w-3.5" aria-hidden /> Cliente: {task.estimateClientName}
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
