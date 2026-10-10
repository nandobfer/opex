"use client"

import { useState } from "react"
import { Check, Loader2, TrendingUp, User, Wallet } from "lucide-react"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatNumberBR } from "@/lib/format"
import { formatFactorLabel, formatHoursLabel } from "@/features/orcamentos/logic"
import { useUpdateTaskEstimate } from "../../hooks/useTasks"
import { updateTaskEstimateSchema } from "../../schemas"
import type { TaskDetailDto } from "../../types"

/** Aceita vírgula ou ponto como separador decimal (ex.: "2,5" e "2.5"). */
const parseHours = (value: string): number => Number(value.trim().replace(",", "."))

/**
 * Estimativa da tarefa do portal (coluna lateral): as **horas estimadas** (originais) são editáveis
 * e as **horas do cliente** (`H × fator`) e o **faturamento** (`horas do cliente × custo/hora`) são
 * recalculados pelo servidor com o cliente que originou a tarefa.
 */
export function TaskEstimateCard({ task }: { task: TaskDetailDto }) {
    const estimate = task.estimate
    const save = useUpdateTaskEstimate(task.id, task.code)
    const [draft, setDraft] = useState<string | null>(null)

    if (!estimate) return null

    // Enquanto o usuário não digita, o campo acompanha o valor vindo do servidor.
    const value = draft ?? String(estimate.hours)
    const parsed = parseHours(value)
    const valid = updateTaskEstimateSchema.safeParse({ hours: parsed }).success
    const changed = valid && parsed !== estimate.hours

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
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") void submit()
                            }}
                            className="flex-1 font-mono"
                            aria-label="Horas estimadas"
                            disabled={save.isPending}
                        />
                        <Button type="button" size="sm" className="gap-1.5" disabled={!changed || save.isPending} onClick={submit} aria-label="Salvar horas estimadas">
                            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                            Salvar
                        </Button>
                    </div>
                </div>
                <dl className="space-y-2 text-sm">
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
                {task.estimateClientName && (
                    <p className="flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
                        <User className="h-3.5 w-3.5" aria-hidden /> Cliente: {task.estimateClientName}
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
