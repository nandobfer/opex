"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Info, Loader2, RotateCcw, Save, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { getAiProvider, type AiProviderId } from "@/lib/ai/providers"
import { DEFAULT_ESTIMATE_HOURS_INSTRUCTIONS } from "../../constants"
import { DEFAULT_ESTIMATE_HOURS_SETTINGS, estimateHoursSettingsSchema, type EstimateHoursSettings } from "../../schemas"
import { useAiProviderStatuses, useEstimateHoursSettings, useSaveEstimateHoursSettings } from "../../hooks/useAi"
import { ProviderModelCard } from "../understand-task/ProviderModelCard"
import { TemperatureInput } from "@/features/ai/components/TemperatureInput"

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/**
 * Aba "Estimar prazos": provedor (texto ou JEV), modelo, instruções e quantas tarefas semelhantes
 * embasar a estimativa. A estimativa usa as tags da tarefa (feature "Tags de tarefas") para buscar
 * o histórico; com JEV, um `score` de esforço é mapeado para horas.
 */
export function EstimateHoursTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useEstimateHoursSettings()
    const save = useSaveEstimateHoursSettings()
    const { providers } = useAiProviderStatuses(true)
    const form = useForm<EstimateHoursSettings>({ resolver: zodResolver(estimateHoursSettingsSchema), mode: "onChange", defaultValues: DEFAULT_ESTIMATE_HOURS_SETTINGS })
    const dirty = form.formState.isDirty
    const errors = form.formState.errors
    const provider = useWatch({ control: form.control, name: "provider" })
    const sampling = provider ? getAiProvider(provider).supportsSampling : false

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
    const changeProvider = (next: AiProviderId) => {
        if (next === provider) return
        form.setValue("provider", next, { shouldDirty: true, shouldValidate: true })
        form.setValue("model", null, { shouldDirty: true, shouldValidate: true })
        form.setValue("variant", null, { shouldDirty: true })
        form.setValue("agent", null, { shouldDirty: true })
    }

    return (
        <>
            <Card>
                <CardContent className="space-y-3 pt-6">
                    <FormToggleCard<EstimateHoursSettings>
                        control={form.control}
                        name="enabled"
                        id="ai-estimate-enabled"
                        label="Estimar prazos"
                        description="Estima as horas de uma tarefa pelas tarefas semelhantes (por tags), numa única chamada — sem agente"
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

            <ProviderModelCard form={form} providers={providers} onProviderChange={changeProvider} />

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Instruções</CardTitle>
                    <CardDescription>Recebe a prévia, o pedido original e o histórico de tarefas semelhantes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className={FORM_GRID_WIDE}>
                        <Field id="ai-estimate-similar" label="Tarefas semelhantes a considerar" error={errors.similarLimit?.message}>
                            <Controller
                                control={form.control}
                                name="similarLimit"
                                render={({ field }) => <Input id="ai-estimate-similar" type="number" min={1} max={20} value={field.value} onChange={(event) => field.onChange(event.target.value === "" ? 0 : Number(event.target.value))} />}
                            />
                        </Field>
                    </div>

                    <AnimatePresence initial={false}>
                        {sampling && (
                            <motion.div key="sampling" {...noticeMotion} className="overflow-hidden">
                                <div className={FORM_GRID_WIDE}>
                                    <Field id="ai-estimate-temperature" label="Temperatura" error={errors.temperature?.message}>
                                        <Controller
                                            control={form.control}
                                            name="temperature"
                                            render={({ field }) => <TemperatureInput id="ai-estimate-temperature" value={field.value} onChange={field.onChange} />}
                                        />
                                    </Field>
                                    <Field id="ai-estimate-max-tokens" label="Máximo de tokens na resposta" error={errors.maxOutputTokens?.message}>
                                        <Controller
                                            control={form.control}
                                            name="maxOutputTokens"
                                            render={({ field }) => <Input id="ai-estimate-max-tokens" type="number" step="256" min={256} placeholder="Padrão do modelo" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value.trim() === "" ? null : Number(event.target.value))} />}
                                        />
                                    </Field>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

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
                <Button type="button" data-ctrl-enter-submit className="gap-1.5" disabled={(!dirty && !query.data.isDefault) || save.isPending} onClick={() => void submit()}>
                    {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                    Salvar
                </Button>
            </div>
        </>
    )
}
