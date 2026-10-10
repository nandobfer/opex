"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Info, Loader2, RotateCcw, Save, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { DEFAULT_ESTIMATE_HOURS_INSTRUCTIONS } from "../../constants"
import { DEFAULT_ESTIMATE_HOURS_SETTINGS, estimateHoursSettingsSchema, type EstimateHoursSettings } from "../../schemas"
import { useAiProviderStatuses, useEstimateHoursSettings, useSaveEstimateHoursSettings } from "../../hooks/useAi"
import { ProviderModelCard } from "../understand-task/ProviderModelCard"

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/**
 * Aba "Estimar prazos": configura o agente do OpenCode que estima as horas de uma tarefa do portal.
 * O agente roda tools no servidor OpenCode (ex.: consulta ao banco via MCP) e pensa antes de responder.
 */
export function EstimateHoursTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useEstimateHoursSettings()
    const save = useSaveEstimateHoursSettings()
    const { providers } = useAiProviderStatuses()
    const form = useForm<EstimateHoursSettings>({ resolver: zodResolver(estimateHoursSettingsSchema), mode: "onChange", defaultValues: DEFAULT_ESTIMATE_HOURS_SETTINGS })
    const dirty = form.formState.isDirty
    const errors = form.formState.errors

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
                    <FormToggleCard<EstimateHoursSettings>
                        control={form.control}
                        name="enabled"
                        id="ai-estimate-enabled"
                        label="Estimar prazos"
                        description="Estima as horas de uma tarefa com um agente do OpenCode, que consulta o banco (via MCP) e pensa antes de responder"
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

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Instruções</CardTitle>
                    <CardDescription>Recebe a prévia e o pedido original; usa as ferramentas do agente para embasar a estimativa.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Field id="ai-estimate-instructions" label="Instruções (prompt de sistema)" error={errors.instructions?.message}>
                        <Textarea id="ai-estimate-instructions" rows={7} className="font-mono text-xs" {...form.register("instructions")} />
                        <div className="flex justify-end">
                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("instructions", DEFAULT_ESTIMATE_HOURS_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                            </Button>
                        </div>
                    </Field>
                </CardContent>
            </Card>

            <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
                <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || save.isPending} onClick={() => form.reset(query.data.settings)}>
                    <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
                </Button>
                <Button type="button" className="gap-1.5" disabled={(!dirty && !query.data.isDefault) || save.isPending} onClick={() => void submit()}>
                    {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                    Salvar
                </Button>
            </div>
        </>
    )
}
