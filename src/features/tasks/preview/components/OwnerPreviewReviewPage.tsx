"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { AlertTriangle, ArrowLeft, BadgeCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { TASKS_PATH, taskPath, type TaskPriority } from "../../constants"
import { PREVIEW_CLARITY_DIMENSION_LABELS, selectPreviewClarity } from "@/features/orcamentos/clarity"
import { selectReviewView } from "@/features/orcamentos/review"
import { useOrcamentoClients } from "@/features/orcamentos/hooks/useOrcamentos"
import { ClarityCard } from "@/features/orcamentos/components/preview/ClarityCard"
import { CorrectionCard } from "@/features/orcamentos/components/preview/CorrectionCard"
import { PreviewSpecCard } from "@/features/orcamentos/components/preview/PreviewSpecCard"
import { PreviewTitleCard } from "@/features/orcamentos/components/preview/PreviewTitleCard"
import { PreviewTagsCard } from "@/features/orcamentos/components/preview/PreviewTagsCard"
import { RepoMetaCard } from "@/features/orcamentos/components/preview/RepoMetaCard"
import { TypePriorityMetaCard } from "@/features/orcamentos/components/preview/TypePriorityMetaCard"
import { useApproveOwnerDraft, useOwnerDraft, useSetOwnerCorrection } from "../hooks"
import { useOwnerPreviewReview } from "../useOwnerPreviewReview"
import { PreviewEstimateCard } from "./PreviewEstimateCard"

/**
 * Revisão da prévia do **dono**: prévia + especificação em destaque, metadados à parte (com o cliente
 * **opcional** só para o custo) e os cards de clareza e de ajuste/aprovar. Aprovar cria a tarefa real.
 */
export function OwnerPreviewReviewPage({ draftId }: { draftId: string }) {
    const router = useRouter()
    const draft = useOwnerDraft(draftId)
    const { state, start, retryEstimate, runEstimate } = useOwnerPreviewReview(draftId)
    const correction = useSetOwnerCorrection(draftId)
    const approve = useApproveOwnerDraft(draftId)
    const clients = useOrcamentoClients()
    const [text, setText] = useState("")
    const [priorityOverride, setPriorityOverride] = useState<TaskPriority | null>(null)
    const [clientId, setClientId] = useState<string | null>(null)
    const startedRef = useRef(false)
    const initializedRef = useRef(false)

    const data = draft.data
    const status = data?.status ?? "draft"
    // Enquanto a IA regenera (correção enviada, prévia ou estimativa), mostra skeleton no lugar do
    // que era da geração anterior até chegar o novo valor — não reaproveita o cache do rascunho.
    const view = selectReviewView(state, data, correction.isPending)
    const preview = view.preview
    const estimate = view.estimate
    const isDraft = status === "draft"
    const clarity = selectPreviewClarity(preview?.clarity)
    const missingDimensions = clarity.issues.filter((issue) => issue.status === "missing").map((issue) => PREVIEW_CLARITY_DIMENSION_LABELS[issue.dimension])

    // Só os clientes ativos que incluem o repositório do rascunho podem custear a tarefa.
    const selectableClients = useMemo(() => (clients.data ?? []).filter((client) => client.active && client.projectIds.includes(data?.projectId ?? "")), [clients.data, data?.projectId])

    // O cliente escolhido vive no rascunho; parte dele na primeira leitura.
    useEffect(() => {
        if (initializedRef.current || !data) return
        initializedRef.current = true
        setClientId(data.estimateClientId ?? null)
    }, [data])

    useEffect(() => {
        if (startedRef.current) return
        if (!data) return
        if (data.status !== "draft") return
        startedRef.current = true
        if (!data.preview) void start()
        else if (!data.estimate) void retryEstimate()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data])

    const requestCorrection = async () => {
        if (!text.trim()) return
        try {
            await correction.mutateAsync(text.trim())
            setText("")
            // A correção regenera a prévia: descarta a prioridade escolhida sobre a sugestão da IA.
            setPriorityOverride(null)
            await start()
        } catch {
            // Erro exibido abaixo.
        }
    }

    const approveDraft = async () => {
        try {
            const task = await approve.mutateAsync(priorityOverride ?? undefined)
            router.push(taskPath(task.id))
        } catch {
            // Erro exibido abaixo.
        }
    }

    const previewError = !preview ? state.error : null
    const estimateError = preview ? state.error : null
    const actionError = correction.error ?? approve.error

    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-5">
            <header className="space-y-3">
                <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                    <Link href={TASKS_PATH}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Tarefas
                    </Link>
                </Button>
                <div>
                    <h1 className="text-lg font-semibold md:text-2xl">Revise a prévia</h1>
                    <p className="text-sm text-muted-foreground">A IA interpretou a sua descrição. Ajuste se precisar e aprove para criar a tarefa.</p>
                </div>
            </header>

            {draft.isLoading ? (
                <Skeleton className="h-72 w-full" />
            ) : draft.isError || !data ? (
                <ErrorState title="Rascunho não encontrado" description={apiErrorMessage(draft.error, "Volte e tente novamente.")} onRetry={() => void draft.refetch()} />
            ) : (
                <>
                    <div className="grid gap-4 lg:grid-cols-4">
                        <div className="space-y-4 lg:order-2 lg:col-span-1">
                            <RepoMetaCard repo={data.projectRepo} />
                            <TypePriorityMetaCard taskType={preview?.taskType ?? null} priority={priorityOverride ?? preview?.priority ?? "medium"} loading={!preview && state.generatingPreview} onPriorityChange={setPriorityOverride} updating={approve.isPending} />
                            <PreviewTagsCard tags={view.tags} loading={state.estimating && view.tags.length === 0} />
                            <PreviewEstimateCard
                                estimate={estimate}
                                estimating={state.estimating}
                                status={state.estimating ? state.notice : null}
                                error={estimateError}
                                onRetry={() => void retryEstimate()}
                                clients={selectableClients}
                                clientId={clientId}
                                onPickClient={(next) => {
                                    const previous = clientId
                                    setClientId(next)
                                    void runEstimate({ clientId: next }).then((ok) => {
                                        if (!ok) setClientId(previous)
                                    })
                                }}
                                clientsLoading={clients.isLoading}
                            />
                        </div>
                        <div className="space-y-4 lg:order-1 lg:col-span-3">
                            <PreviewTitleCard preview={preview} description={data.description} generating={state.generatingPreview} notice={state.notice} />
                            <PreviewSpecCard technicalSpec={preview?.technicalSpec ?? null} loading={!preview && state.generatingPreview} />
                        </div>
                    </div>

                    {previewError && (
                        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {previewError}
                        </p>
                    )}
                    {actionError && <p className="text-sm text-destructive">{apiErrorMessage(actionError, "Não foi possível concluir")}</p>}

                    {!isDraft && preview ? (
                        <Card>
                            <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
                                <BadgeCheck className="h-4 w-4 text-success" aria-hidden /> Tarefa aprovada e criada no quadro.
                            </CardContent>
                        </Card>
                    ) : preview ? (
                        <div className="space-y-4">
                            <ClarityCard result={clarity} />
                            <CorrectionCard
                                value={text}
                                onChange={setText}
                                onCorrect={() => void requestCorrection()}
                                onApprove={() => void approveDraft()}
                                correcting={correction.isPending}
                                approving={approve.isPending}
                                disabled={state.generatingPreview || correction.isPending || approve.isPending}
                                approveDisabled={!clarity.canApprove}
                                approveDisabledReason={missingDimensions.length ? `Especifique ${missingDimensions.join(" e ")} para aprovar a tarefa.` : undefined}
                            />
                        </div>
                    ) : null}
                </>
            )}
        </motion.section>
    )
}
