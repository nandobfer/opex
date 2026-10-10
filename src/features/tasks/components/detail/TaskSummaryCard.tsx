"use client"

import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

/** Card do resumo de 1 linha gerado por IA, exibido acima do card de conteúdo da tarefa. */
export function TaskSummaryCard({ summary }: { summary: string }) {
    return (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Card>
                <CardContent className="flex items-start gap-2.5 pt-4">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0 space-y-0.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Resumo (IA)</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">{summary}</p>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
