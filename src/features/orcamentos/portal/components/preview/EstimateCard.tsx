"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Clock, Loader2, RefreshCw, Wallet } from "lucide-react"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatNumberBR } from "@/lib/format"
import { formatHoursLabel } from "@/features/orcamentos/logic"
import type { DraftEstimateDto } from "@/features/orcamentos/types"

/**
 * Card das horas e do custo estimados (2ª fase da IA). Enquanto a estimativa roda, mostra um
 * carregamento animado; ao concluir, os valores entram animados (`AnimatedNumber`).
 */
export function EstimateCard({ estimate, estimating, status, error, onRetry }: { estimate: DraftEstimateDto | null; estimating: boolean; status?: string | null; error: string | null; onRetry: () => void }) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Horas e custo estimados</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
                <AnimatePresence mode="wait" initial={false}>
                    {estimate ? (
                        <motion.div key="done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="space-y-3">
                            <div className="flex items-center justify-between gap-2 text-sm">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                    <Clock className="h-3.5 w-3.5" aria-hidden /> Prazo
                                </span>
                                <span className="font-mono font-medium">
                                    <AnimatedNumber value={estimate.clientHours} formatter={(value) => `${formatHoursLabel(value)} h`} />
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-sm">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                    <Wallet className="h-3.5 w-3.5" aria-hidden /> Orçamento
                                </span>
                                <span className="font-mono font-medium">
                                    <AnimatedNumber value={estimate.billingBrl} formatter={(value) => `R$ ${formatNumberBR(value)}`} />
                                </span>
                            </div>
                        </motion.div>
                    ) : estimating ? (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3" aria-label="Calculando horas e custo">
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {status ?? "Calculando horas e custo…"}
                            </p>
                            <div className="space-y-2">
                                <motion.div className="h-6 rounded bg-muted" animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }} />
                                <motion.div className="h-6 rounded bg-muted" animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: 0.15 }} />
                            </div>
                        </motion.div>
                    ) : error ? (
                        <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                            <p className="text-sm text-destructive">{error}</p>
                            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onRetry}>
                                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Tentar novamente
                            </Button>
                        </motion.div>
                    ) : (
                        <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2" aria-hidden>
                            <Skeleton className="h-6 w-full" />
                            <Skeleton className="h-6 w-full" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}
