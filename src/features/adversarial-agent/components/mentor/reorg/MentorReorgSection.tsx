"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ListChecks, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useMentorSettings } from "../../../hooks/useMentor"
import { useMentorReorgs, useMentorReorgRealtime } from "../../../hooks/useMentorReorg"
import { MentorReorgHistory } from "./MentorReorgHistory"
import { MentorReorgPlan } from "./MentorReorgPlan"
import { MentorReorgStartDialog } from "./MentorReorgStartDialog"

/**
 * Seção "Reorganização" da aba Agente Mentor (OPE-132): o botão "Reorganizar memórias", a revisão em
 * andamento/aberta e o histórico. O plano é uma prévia: nada é gravado antes da aprovação.
 */
export function MentorReorgSection() {
    const history = useMentorReorgs()
    const settings = useMentorSettings()
    useMentorReorgRealtime()
    const [selected, setSelected] = useState<string | null>(null)
    const [startOpen, setStartOpen] = useState(false)
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden /> Reorganização do acervo
                        </CardTitle>
                        <CardDescription>Revise todas as memórias que o Mentor enxerga (Adversário, globais e centrais do escopo). Cada uma passa pela triagem e pela redação e vira uma proposta de manter, reescrever, mover ou fundir — sem gravar nada até a sua aprovação.</CardDescription>
                    </div>
                    <Button type="button" className="gap-1.5" disabled={!settings.data} onClick={() => setStartOpen(true)}>
                        <Sparkles className="h-4 w-4" aria-hidden /> Reorganizar memórias
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <AnimatePresence mode="wait" initial={false}>
                    {selected ? (
                        <motion.div key="plan" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }}>
                            <MentorReorgPlan id={selected} onBack={() => setSelected(null)} />
                        </motion.div>
                    ) : history.isLoading ? (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </motion.div>
                    ) : history.isError ? (
                        <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <ErrorState title="Não foi possível carregar o histórico" description={apiErrorMessage(history.error, "Tente novamente.")} onRetry={() => void history.refetch()} />
                        </motion.div>
                    ) : (
                        <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <MentorReorgHistory items={history.data?.items ?? []} onOpen={setSelected} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>
            {settings.data && <MentorReorgStartDialog open={startOpen} onOpenChange={setStartOpen} settings={settings.data.settings} centrals={history.data?.centrals ?? []} onStarted={setSelected} />}
        </Card>
    )
}
