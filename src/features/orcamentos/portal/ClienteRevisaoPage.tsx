"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { AlertTriangle, ArrowLeft, BadgeCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { TaskPriority } from "@/features/tasks/constants"
import { clientePortalPath } from "../constants"
import { PREVIEW_CLARITY_DIMENSION_LABELS, selectPreviewClarity } from "../clarity"
import { selectReviewView } from "../review"
import { useApproveDraft, useClienteDraft, useSetCorrection } from "./hooks"
import { ClientePortalProvider, useClientePortal } from "./ClientePortalContext"
import { useBudgetReview } from "./useBudgetReview"
import { ClarityCard } from "../components/preview/ClarityCard"
import { CorrectionCard } from "../components/preview/CorrectionCard"
import { EstimateCard } from "../components/preview/EstimateCard"
import { PreviewSpecCard } from "../components/preview/PreviewSpecCard"
import { PreviewTitleCard } from "../components/preview/PreviewTitleCard"
import { RepoMetaCard } from "../components/preview/RepoMetaCard"
import { TypePriorityMetaCard } from "../components/preview/TypePriorityMetaCard"
import { PreviewTagsCard } from "../components/preview/PreviewTagsCard"

/** Revisão da prévia da IA: metadados à parte, prévia em destaque; aprovar ou solicitar correção. */
export function ClienteRevisaoPage({ token, draftId }: { token: string; draftId: string }) {
    return (
        <ClientePortalProvider token={token}>
            <ClienteRevisaoView draftId={draftId} />
        </ClientePortalProvider>
    )
}

function ClienteRevisaoView({ draftId }: { draftId: string }) {
    const { token } = useClientePortal()
    const router = useRouter()
    const draft = useClienteDraft(draftId)
    const { state, start, retryEstimate } = useBudgetReview(draftId)
    const correction = useSetCorrection(draftId)
    const approve = useApproveDraft(draftId)
    const [text, setText] = useState("")
    const [priorityOverride, setPriorityOverride] = useState<TaskPriority | null>(null)
    const startedRef = useRef(false)

    const data = draft.data
    const status = data?.status ?? "draft"
    // Enquanto a IA regenera (correção enviada, prévia ou estimativa), mostra skeleton no lugar do
    // que era da geração anterior até chegar o novo valor — não reaproveita o cache do rascunho.
    const view = selectReviewView(state, data, correction.isPending)
    const preview = view.preview
    const estimate = view.estimate
    const isDraft = status === "draft"
    // A clareza vive só na tela (o stream traz a avaliação; a prévia lida do banco não tem) —
    // sem avaliação, cai em "aviso" (submissão liberada).
    const clarity = selectPreviewClarity(preview?.clarity)
    const missingDimensions = clarity.issues.filter((issue) => issue.status === "missing").map((issue) => PREVIEW_CLARITY_DIMENSION_LABELS[issue.dimension])

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
            await approve.mutateAsync(priorityOverride ?? undefined)
            router.push(clientePortalPath(token))
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
                    <Link href={clientePortalPath(token)}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Tarefas
                    </Link>
                </Button>
                <div>
                    <h1 className="text-lg font-semibold md:text-2xl">Revise a tarefa</h1>
                    <p className="text-sm text-muted-foreground">A IA interpretou a sua descrição. Aprove ou peça uma correção.</p>
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
                            <EstimateCard estimate={estimate} estimating={state.estimating} status={state.estimating ? state.notice : null} error={estimateError} onRetry={() => void retryEstimate()} />
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
