"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AnimatePresence, motion } from "framer-motion"
import { Markdown } from "@/components/ui/markdown"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { PlanVersionDto } from "../../types"

/** Versões do plano (a mais recente por padrão) com o pedido que originou cada uma. */
export function PlanView({ plans }: { plans: PlanVersionDto[] }) {
    const [selected, setSelected] = useState<number | null>(null)
    const plan = plans.find((item) => item.version === selected) ?? plans.at(-1)
    if (!plan) return null
    return (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Gerado em {format(new Date(plan.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                {plans.length > 1 && (
                    <Select value={String(plan.version)} onValueChange={(value) => setSelected(Number(value))}>
                        <SelectTrigger className="w-40" aria-label="Versão do plano">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {[...plans].reverse().map((item) => (
                                <SelectItem key={item.version} value={String(item.version)}>
                                    Versão {item.version}
                                    {item.version === plans.length ? " (atual)" : ""}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={plan.version} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }} className="space-y-3">
                    {plan.feedback && (
                        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                            <p className="mb-1 text-xs font-medium text-primary">Pedido que originou esta versão</p>
                            <p className="whitespace-pre-wrap text-muted-foreground">{plan.feedback}</p>
                        </div>
                    )}
                    <Markdown>{plan.text}</Markdown>
                </motion.div>
            </AnimatePresence>
        </div>
    )
}
