"use client"

import { useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, CheckCheck, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { VirtualStack } from "@/components/list/VirtualStack"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { MENTOR_REORG_ACTION_LABELS, MENTOR_REORG_ACTIONS, type MentorReorgAction } from "../../../mentor/constants"
import { useMentorReorg, useMentorReorgDecision } from "../../../hooks/useMentorReorg"
import { formatReorgDate } from "./format"
import { MentorReorgItem } from "./MentorReorgItem"
import { MentorReorgProgress } from "./MentorReorgProgress"

type Filter = "all" | MentorReorgAction
type Confirmation = "apply" | "discard" | "cancel"

/** Esqueleto do plano: cabeçalho, filtros e linhas com a mesma altura dos itens reais. */
function PlanSkeleton() {
    return (
        <div className="space-y-4" aria-label="Carregando o plano de reorganização">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-9 w-full" />
            {[0, 1, 2].map((index) => (
                <div key={index} className="space-y-2 rounded-lg border p-3">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-16 w-full" />
                </div>
            ))}
        </div>
    )
}

/** Plano de reorganização de uma revisão: progresso, filtros, itens e decisão em lote ou por item. */
export function MentorReorgPlan({ id, onBack }: { id: string; onBack: () => void }) {
    const query = useMentorReorg(id)
    const decision = useMentorReorgDecision()
    const [filter, setFilter] = useState<Filter>("all")
    const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
    const [confirmOwnerBatch, setConfirmOwnerBatch] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const items = useMemo(() => query.data?.items ?? [], [query.data])
    const visible = useMemo(() => (filter === "all" ? items : items.filter((item) => item.action === filter)), [items, filter])
    const pending = items.filter((item) => item.status === "pending" && item.action !== "keep")
    const allPending = items.filter((item) => item.status === "pending")
    const actionable = ["ready", "partial"].includes(query.data?.status ?? "")
    const options: { value: Filter; label: string }[] = [
        { value: "all", label: `Todas (${items.length})` },
        ...MENTOR_REORG_ACTIONS.map((action) => ({ value: action as Filter, label: `${MENTOR_REORG_ACTION_LABELS[action]} (${items.filter((item) => item.action === action).length})` })),
    ]
    const decide = (vars: Parameters<typeof decision.mutate>[0]) => decision.mutate(vars)
    if (query.isLoading) return <PlanSkeleton />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar o plano" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    const plan = query.data
    const merges = pending.filter((item) => item.action === "merge").length
    const moves = pending.filter((item) => item.action === "move").length
    // Fusões que arquivam memória do dono exigem confirmação explícita (no item ou no lote).
    const ownerMerges = pending.filter((item) => item.action === "merge" && item.ownerMemory)
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onBack}>
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Voltar
                </Button>
                <h3 className="text-base font-medium">Plano de reorganização</h3>
                <span className="text-xs text-muted-foreground">{formatReorgDate(plan.createdAt)}</span>
                <Button type="button" variant="ghost" size="icon" className="ml-auto" aria-label="Atualizar" onClick={() => void query.refetch()}>
                    <RefreshCw className="h-4 w-4" aria-hidden />
                </Button>
            </div>
            <MentorReorgProgress plan={plan} cancelling={decision.isPending} onCancel={() => setConfirmation("cancel")} />
            <OptionTabs<Filter> id="mentor-reorg-filter" options={options} value={filter} onChange={setFilter} className="w-full flex-wrap" />
            {visible.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma memória nesta ação.</p>
            ) : (
                <div ref={scrollRef} className="max-h-[65vh] overflow-y-auto pr-1">
                    <VirtualStack count={visible.length} scrollRef={scrollRef} getKey={(index) => visible[index]!.id} estimateSize={260} className="space-y-2" renderItem={(index) => {
                        const item = visible[index]!
                        return (
                            <MentorReorgItem
                                item={item}
                                busy={decision.isPending}
                                onApprove={(override) => decide({ id: plan.id, decision: "apply", itemIds: [item.id], overrides: { [item.id]: override } })}
                                onDiscard={() => decide({ id: plan.id, decision: "discard", itemIds: [item.id] })}
                            />
                        )
                    }} />
                </div>
            )}
            <AnimatePresence initial={false}>
                {actionable && allPending.length > 0 && (
                    <motion.div key="actions" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap items-center gap-2 overflow-hidden border-t pt-4">
                        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                            {moves} mover · {merges} fundir · {pending.length - moves - merges} reescrever · {allPending.length - pending.length} manter. Fundir arquiva a memória absorvida (sem excluir).
                        </p>
                        <Button type="button" variant="outline" className="gap-1.5" disabled={decision.isPending || !allPending.length} onClick={() => setConfirmation("discard")}>
                            <Trash2 className="h-4 w-4" aria-hidden /> Descartar tudo
                        </Button>
                        <Button
                            type="button"
                            className="gap-1.5"
                            disabled={decision.isPending}
                            onClick={() => {
                                setConfirmOwnerBatch(false)
                                setConfirmation("apply")
                            }}
                        >
                            {decision.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCheck className="h-4 w-4" aria-hidden />} Aprovar tudo
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
            <AlertDialog
                open={confirmation !== null}
                onOpenChange={(open) => {
                    if (open) return
                    setConfirmation(null)
                    setConfirmOwnerBatch(false)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmation === "apply" ? "Aplicar o plano de reorganização?" : confirmation === "discard" ? "Descartar o plano?" : "Cancelar a revisão?"}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmation === "apply"
                                ? `${allPending.length} memórias serão aplicadas com a auditoria do Mentor (${moves} movidas, ${merges} fundidas com a origem arquivada, ${pending.length - moves - merges} reescritas).${ownerMerges.length ? ` ${ownerMerges.length} fusão(ões) arquivam memória do dono e precisam da confirmação abaixo.` : ""}`
                                : confirmation === "discard"
                                  ? "Nada será alterado no Engramind; o plano fica no histórico como descartado."
                                  : "A revisão para onde está; o que já foi revisado fica no plano, sem aprovação."}
                        </AlertDialogDescription>
                        {confirmation === "apply" && ownerMerges.length > 0 && (
                            <span className="flex items-start gap-2 text-sm">
                                <Checkbox id="reorg-owner-batch" className="mt-0.5" checked={confirmOwnerBatch} onCheckedChange={(value) => setConfirmOwnerBatch(value)} />
                                <label htmlFor="reorg-owner-batch">Confirmo arquivar {ownerMerges.length} memória(s) do dono (ficam arquivadas, não são excluídas)</label>
                            </span>
                        )}
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <Button
                            variant={confirmation === "apply" ? "default" : "destructive"}
                            disabled={confirmation === "apply" && ownerMerges.length > 0 && !confirmOwnerBatch}
                            onClick={() => {
                                const kind = confirmation!
                                const overrides = Object.fromEntries(ownerMerges.map((item) => [item.id, { confirmOwner: true }]))
                                setConfirmation(null)
                                setConfirmOwnerBatch(false)
                                if (kind === "apply") decide({ id: plan.id, decision: "apply", ...(ownerMerges.length ? { overrides } : {}) })
                                else if (kind === "discard") decide({ id: plan.id, decision: "discard" })
                                else decide({ id: plan.id, decision: "cancel" })
                            }}
                        >
                            {confirmation === "apply" ? "Aplicar" : confirmation === "discard" ? "Descartar" : "Cancelar a revisão"}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
