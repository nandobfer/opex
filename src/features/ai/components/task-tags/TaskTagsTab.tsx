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
import { DEFAULT_TASK_TAGS_INSTRUCTIONS } from "../../constants"
import { DEFAULT_TASK_TAGS_SETTINGS, taskTagsSettingsSchema, type TaskTagsSettings } from "../../schemas"
import { useAiProviderStatuses, useSaveTaskTagsSettings, useTaskTagsSettings } from "../../hooks/useAi"
import { ProviderModelCard } from "../understand-task/ProviderModelCard"
import { TaxonomyEditor } from "./TaxonomyEditor"

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/**
 * Aba "Tags de tarefas": provedor (texto ou JEV), modelo, instruções e a **taxonomia fechada**.
 * A IA gera as tags das tarefas (e das prévias do portal) a partir dessa taxonomia; com JEV cada
 * tag vira uma pergunta `noul` e vale o limiar (`jevThreshold`).
 */
export function TaskTagsTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useTaskTagsSettings()
    const save = useSaveTaskTagsSettings()
    // A tags pode usar o JEV (decisão estruturada), então a lista inclui os três provedores.
    const { providers } = useAiProviderStatuses(true)
    const form = useForm<TaskTagsSettings>({ resolver: zodResolver(taskTagsSettingsSchema), mode: "onChange", defaultValues: DEFAULT_TASK_TAGS_SETTINGS })
    const dirty = form.formState.isDirty
    const errors = form.formState.errors
    const provider = useWatch({ control: form.control, name: "provider" })
    const slots = provider ? getAiProvider(provider).supportsSampling : false

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
    const taxonomyError = errors.taxonomy ? "Verifique a taxonomia: há ids repetidos ou vazios." : undefined

    return (
        <>
            <Card>
                <CardContent className="space-y-3 pt-6">
                    <FormToggleCard<TaskTagsSettings>
                        control={form.control}
                        name="enabled"
                        id="ai-task-tags-enabled"
                        label="Tags de tarefas"
                        description="Classifica cada tarefa com tags de uma taxonomia fechada. Ao ativar, marca também as tarefas não concluídas que ainda não têm tags. As tags ajudam a estimar prazos por tarefas semelhantes"
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
                    <CardTitle className="text-base">Taxonomia</CardTitle>
                    <CardDescription>Lista fechada de tags. A IA escolhe apenas entre elas; o JEV usa cada uma como uma pergunta sim/não.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Controller control={form.control} name="taxonomy" render={({ field }) => <TaxonomyEditor value={field.value} onChange={field.onChange} />} />
                    {taxonomyError && <p className="mt-2 text-xs text-destructive">{taxonomyError}</p>}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Instruções</CardTitle>
                    <CardDescription>Recebe título, tipo, projeto e descrição da tarefa.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className={FORM_GRID_WIDE}>
                        <Field id="ai-task-tags-max" label="Máximo de tags por tarefa" error={errors.maxTags?.message}>
                            <Controller
                                control={form.control}
                                name="maxTags"
                                render={({ field }) => <Input id="ai-task-tags-max" type="number" min={1} max={20} value={field.value} onChange={(event) => field.onChange(event.target.value === "" ? 0 : Number(event.target.value))} />}
                            />
                        </Field>
                        <AnimatePresence initial={false}>
                            {provider === "jev" && (
                                <motion.div key="jev-threshold" {...noticeMotion} className="overflow-hidden">
                                    <Field id="ai-task-tags-threshold" label="Limiar do JEV (probabilidade)" error={errors.jevThreshold?.message}>
                                        <Controller
                                            control={form.control}
                                            name="jevThreshold"
                                            render={({ field }) => <Input id="ai-task-tags-threshold" type="number" step={0.05} min={0.05} max={0.95} value={field.value} onChange={(event) => field.onChange(Number(event.target.value))} />}
                                        />
                                    </Field>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <AnimatePresence initial={false}>
                        {slots && (
                            <motion.div key="slots" {...noticeMotion} className="overflow-hidden">
                                <div className={FORM_GRID_WIDE}>
                                    <Field id="ai-task-tags-temperature" label="Temperatura" error={errors.temperature?.message}>
                                        <Controller
                                            control={form.control}
                                            name="temperature"
                                            render={({ field }) => <Input id="ai-task-tags-temperature" type="number" step="0.1" min={0} max={2} placeholder="Padrão do modelo" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value.trim() === "" ? null : Number(event.target.value))} />}
                                        />
                                    </Field>
                                    <Field id="ai-task-tags-max-tokens" label="Máximo de tokens na resposta" error={errors.maxOutputTokens?.message}>
                                        <Controller
                                            control={form.control}
                                            name="maxOutputTokens"
                                            render={({ field }) => <Input id="ai-task-tags-max-tokens" type="number" step="256" min={256} placeholder="Padrão do modelo" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value.trim() === "" ? null : Number(event.target.value))} />}
                                        />
                                    </Field>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <Field id="ai-task-tags-instructions" label="Instruções (prompt de sistema)" error={errors.instructions?.message}>
                        <Textarea id="ai-task-tags-instructions" rows={7} className="font-mono text-xs" {...form.register("instructions")} />
                        <div className="flex justify-end">
                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("instructions", DEFAULT_TASK_TAGS_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
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
