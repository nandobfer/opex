"use client"

import { useState } from "react"
import { Info, Loader2, RefreshCw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorMessage } from "@/lib/api"
import { MENTOR_TARGETS, type MentorTarget } from "../../../mentor/constants"
import { enabledTargets, type MentorSettings } from "../../../mentor/schemas"
import { useMentorReorgPreview, useStartMentorReorg } from "../../../hooks/useMentorReorg"
import { formatReorgCost } from "./format"

const TARGET_HINT: Record<MentorTarget, string> = {
    adversarial: "O que o revisor deve verificar",
    "developer-global": "Como trabalhar em qualquer projeto",
    "developer-central": "Convenções de um projeto",
}

interface CentralOption {
    id: string
    projectName: string | null
}

/**
 * Confirmação do recorte antes de revisar o acervo: listas e centrais marcáveis, quantas memórias
 * serão revisadas, quantas chamadas de IA e o custo médio por memória das últimas revisões.
 */
export function MentorReorgStartDialog({ open, onOpenChange, settings, centrals, onStarted }: { open: boolean; onOpenChange: (open: boolean) => void; settings: MentorSettings; centrals: CentralOption[]; onStarted: (id: string) => void }) {
    const enabled = enabledTargets(settings.targets)
    const scopedCentrals = settings.scope.all ? centrals : centrals.filter((central) => settings.scope.centralIds.includes(central.id))
    const [targets, setTargets] = useState<MentorTarget[]>(enabled)
    const [centralIds, setCentralIds] = useState<string[]>([])
    const start = useStartMentorReorg()
    const preview = useMentorReorgPreview({ targets, centralIds }, open && targets.length > 0)
    const toggleTarget = (target: MentorTarget) => setTargets((current) => (current.includes(target) ? current.filter((item) => item !== target) : [...current, target]))
    const toggleCentral = (id: string) => setCentralIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
    const submit = async () => {
        const plan = await start.mutateAsync({ targets, centralIds }).catch(() => null)
        if (plan) {
            onOpenChange(false)
            onStarted(plan.id)
        }
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] flex-col gap-0 p-0 sm:max-w-lg">
                <DialogHeader className="border-b px-5 pb-4 pt-5 sm:px-6">
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" aria-hidden /> Reorganizar memórias
                    </DialogTitle>
                    <DialogDescription>O Mentor revisa as memórias de cada lista e propõe manter, reescrever, mover ou fundir. Nada é gravado antes da sua aprovação.</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
                    <section className="space-y-2">
                        <h3 className="text-sm font-medium">Listas</h3>
                        <ul className="space-y-2">
                            {MENTOR_TARGETS.map((target) => (
                                <li key={target} className="flex items-start gap-2 text-sm">
                                    <Checkbox id={`reorg-target-${target}`} className="mt-0.5" checked={targets.includes(target)} disabled={!enabled.includes(target)} onCheckedChange={() => toggleTarget(target)} />
                                    <label htmlFor={`reorg-target-${target}`} className="min-w-0 flex-1">
                                        {TARGET_HINT[target]}
                                        <span className="block text-xs text-muted-foreground">{enabled.includes(target) ? target : "desligada na configuração do Mentor"}</span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </section>
                    {targets.includes("developer-central") && scopedCentrals.length > 0 && (
                        <section className="space-y-2">
                            <h3 className="text-sm font-medium">Centrais</h3>
                            <p className="text-xs text-muted-foreground">Sem marcar nenhuma, todas as centrais do escopo do Mentor entram.</p>
                            <ul className="space-y-1.5">
                                {scopedCentrals.map((central) => (
                                    <li key={central.id} className="flex items-center gap-2 text-sm">
                                        <Checkbox id={`reorg-central-${central.id}`} checked={centralIds.includes(central.id)} onCheckedChange={() => toggleCentral(central.id)} />
                                        <label htmlFor={`reorg-central-${central.id}`} className="min-w-0 flex-1">
                                            {central.projectName ?? central.id}
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                    <section aria-label="Estimativa" className="rounded-lg border bg-muted/40 p-3 text-sm">
                        {preview.isLoading ? (
                            <div className="space-y-1.5" aria-label="Calculando a estimativa">
                                <Skeleton className="h-4 w-2/3" />
                                <Skeleton className="h-4 w-1/3" />
                            </div>
                        ) : preview.isError ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-muted-foreground">{apiErrorMessage(preview.error, "Não foi possível estimar o recorte.")}</span>
                                <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => void preview.refetch()}>
                                    <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Tentar novamente
                                </Button>
                            </div>
                        ) : preview.data ? (
                            <div className="space-y-1">
                                <p className="font-medium">
                                    {preview.data.memories} memórias · {preview.data.calls} chamadas de IA
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {preview.data.memories === 0 ? "Nenhuma memória neste recorte." : `Custo médio das últimas revisões: ${preview.data.averageCostUsdPerMemory === null ? "sem histórico" : `${formatReorgCost(preview.data.averageCostUsdPerMemory)} por memória`}.`}
                                </p>
                                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                    <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> Cada memória passa pela triagem e pela redação; dá para cancelar no meio.
                                </p>
                            </div>
                        ) : null}
                    </section>
                </div>
                <DialogFooter className="border-t px-5 py-3 sm:px-6">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button type="button" className="gap-1.5" disabled={!targets.length || start.isPending || preview.isLoading || (preview.data?.memories ?? 0) === 0} onClick={() => void submit()}>
                        {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} Iniciar revisão
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
