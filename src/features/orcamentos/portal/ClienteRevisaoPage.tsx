"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { AlertTriangle, ArrowLeft, Check, Loader2, RefreshCw, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Markdown } from "@/components/ui/markdown"
import { Textarea } from "@/components/ui/textarea"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { formatNumberBR } from "@/lib/format"
import { TaskPriorityBadge, TaskTypeBadge } from "@/features/tasks/components/TaskBadges"
import { clientePortalPath } from "../constants"
import { formatHoursLabel } from "../logic"
import type { DraftPreviewDto } from "../types"
import { useApproveDraft, useClienteDraft, useSetCorrection } from "./hooks"
import { ClientePortalProvider, useClientePortal } from "./ClientePortalContext"
import { useBudgetPreviewStream } from "./useBudgetPreviewStream"

/** Revisão da prévia da IA: aprovar ou solicitar correção. */
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
    const stream = useBudgetPreviewStream(draftId)
    const correction = useSetCorrection(draftId)
    const approve = useApproveDraft(draftId)
    const [text, setText] = useState("")
    const startedRef = useRef(false)

    const storedPreview = draft.data?.preview ?? null
    const shownPreview: DraftPreviewDto | null = stream.state.preview ?? storedPreview
    const busy = stream.state.running || correction.isPending || approve.isPending

    useEffect(() => {
        if (startedRef.current) return
        if (!draft.data) return
        if (draft.data.status === "draft" && !draft.data.preview) {
            startedRef.current = true
            void stream.start()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft.data])

    const requestCorrection = async () => {
        if (!text.trim()) return
        try {
            await correction.mutateAsync(text.trim())
            setText("")
            await stream.start()
        } catch {
            // Erro exibido abaixo.
        }
    }

    const approveDraft = async () => {
        try {
            await approve.mutateAsync()
            router.push(clientePortalPath(token))
        } catch {
            // Erro exibido abaixo.
        }
    }

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
            ) : draft.isError ? (
                <ErrorState title="Rascunho não encontrado" description={apiErrorMessage(draft.error, "Volte e tente novamente.")} onRetry={() => void draft.refetch()} />
            ) : (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Prévia da IA</CardTitle>
                            <CardDescription>{draft.data?.projectName ? `Repositório: ${draft.data.projectName}` : "Gerando…"}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {stream.state.running && !shownPreview ? (
                                <div className="space-y-2">
                                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Gerando a prévia{stream.state.notice ? ` · ${stream.state.notice}` : "…"}
                                    </p>
                                    {stream.state.text && <Markdown className="max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-3">{stream.state.text}</Markdown>}
                                </div>
                            ) : shownPreview ? (
                                <PreviewContent preview={shownPreview} estimate={draft.data?.estimate ?? null} />
                            ) : (
                                <p className="text-sm text-muted-foreground">Nenhuma prévia ainda.</p>
                            )}

                            {stream.state.error && (
                                <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {stream.state.error}
                                </p>
                            )}
                            {(correction.isError || approve.isError) && <p className="text-sm text-destructive">{apiErrorMessage(correction.error ?? approve.error, "Não foi possível concluir")}</p>}
                        </CardContent>
                    </Card>

                    {shownPreview && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Ajustar ou aprovar</CardTitle>
                                <CardDescription>Descreva o que mudar na prévia, ou aprove para criar a tarefa.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Textarea rows={4} placeholder="Ex.: O prazo está alto; é só ajustar o texto do rodapé." value={text} onChange={(event) => setText(event.target.value)} disabled={busy} />
                                <div className="flex flex-wrap justify-end gap-2">
                                    <Button type="button" variant="outline" className="gap-1.5" onClick={() => void stream.start()} disabled={busy}>
                                        {stream.state.running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} Gerar novamente
                                    </Button>
                                    <Button type="button" variant="secondary" className="gap-1.5" onClick={() => void requestCorrection()} disabled={busy || !text.trim()}>
                                        {correction.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Solicitar correção
                                    </Button>
                                    <Button type="button" className="gap-1.5" onClick={() => void approveDraft()} disabled={busy}>
                                        {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Aprovar tarefa
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </motion.section>
    )
}

function PreviewContent({ preview, estimate }: { preview: DraftPreviewDto; estimate: { clientHours: number; billingBrl: number } | null }) {
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <TaskTypeBadge type={preview.taskType} long />
                <TaskPriorityBadge priority={preview.priority} />
            </div>
            <div>
                <h3 className="text-base font-semibold">{preview.title}</h3>
                {preview.summary && <p className="text-sm text-muted-foreground">{preview.summary}</p>}
            </div>
            {estimate && (
                <div className="flex flex-wrap gap-4 rounded-md border bg-muted/30 p-3 text-sm">
                    <span>
                        Prazo estimado: <span className="font-mono font-medium">{formatHoursLabel(estimate.clientHours)} h</span>
                    </span>
                    <span>
                        Orçamento: <span className="font-mono font-medium">R$ {formatNumberBR(estimate.billingBrl)}</span>
                    </span>
                </div>
            )}
            <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Especificação técnica</p>
                {preview.technicalSpec ? <Markdown>{preview.technicalSpec}</Markdown> : <p className="text-sm text-muted-foreground">Sem especificação.</p>}
            </div>
        </div>
    )
}
