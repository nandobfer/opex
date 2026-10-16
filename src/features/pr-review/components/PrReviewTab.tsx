"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Info, Loader2, Save, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useAiProviderStatuses } from "@/features/ai/hooks/useAi"
import { ProviderModelCard } from "@/features/ai/components/understand-task/ProviderModelCard"
import { DEFAULT_PR_REVIEW_SETTINGS, prReviewSettingsSchema, type PrReviewSettings } from "../schemas"
import { usePrReviews, usePrReviewSettings, useSavePrReviewSettings } from "../hooks/usePrReview"
import { PrReviewScopeCard } from "./PrReviewScopeCard"
import { PrReviewExecutionCard } from "./PrReviewExecutionCard"
import { PrReviewHistoryCard } from "./PrReviewHistoryCard"

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/**
 * Aba "Revisão de PR": agente do OpenCode que executa a skill de code review nos PRs dos repositórios
 * das centrais, a cada execução da rotina de PRs. Configuração + histórico das revisões.
 */
export function PrReviewTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = usePrReviewSettings()
    const save = useSavePrReviewSettings()
    const reviews = usePrReviews()
    const { providers } = useAiProviderStatuses()
    const form = useForm<PrReviewSettings>({ resolver: zodResolver(prReviewSettingsSchema), mode: "onChange", defaultValues: DEFAULT_PR_REVIEW_SETTINGS })
    const dirty = form.formState.isDirty

    useEffect(() => {
        if (query.data) form.reset(query.data.settings)
    }, [query.data, form])
    useEffect(() => {
        onDirtyChange(dirty)
        return () => onDirtyChange(false)
    }, [dirty, onDirtyChange])

    if (query.isLoading) return <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar a configuração" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />

    const availability = query.data.availability
    const submit = form.handleSubmit(async (values) => {
        const saved = await save.mutateAsync(values).catch(() => null)
        if (saved) form.reset(saved.settings)
    })

    return (
        <>
            <Card>
                <CardContent className="space-y-3 pt-6">
                    <FormToggleCard<PrReviewSettings>
                        control={form.control}
                        name="enabled"
                        id="pr-review-enabled"
                        label="Revisão de PR"
                        description="Um agente do OpenCode revisa os PRs com a skill de code review sempre que a rotina de PRs roda, e publica a revisão no GitHub"
                    />
                    <AnimatePresence initial={false}>
                        {!dirty && !availability.available && availability.reason && (
                            <motion.p key="availability" {...noticeMotion} className="flex items-start gap-2 overflow-hidden text-xs text-muted-foreground">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {availability.reason}
                            </motion.p>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>

            <ProviderModelCard form={form} providers={providers} fixedProvider="opencode" />
            <PrReviewScopeCard form={form} githubLogin={reviews.data?.githubLogin} />
            <PrReviewExecutionCard form={form} />

            <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
                <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || save.isPending} onClick={() => form.reset(query.data.settings)}>
                    <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
                </Button>
                <Button type="button" data-ctrl-enter-submit className="gap-1.5" disabled={(!dirty && !query.data.isDefault) || save.isPending} onClick={() => void submit()}>
                    {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                    Salvar
                </Button>
            </div>

            <PrReviewHistoryCard query={reviews} available={availability.available} />
        </>
    )
}
