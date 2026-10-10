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
import { getAiProvider } from "@/lib/ai/providers"
import { DEFAULT_BUDGET_PREVIEW_INSTRUCTIONS } from "../../constants"
import { DEFAULT_BUDGET_PREVIEW_SETTINGS, budgetPreviewSettingsSchema, type BudgetPreviewSettings } from "../../schemas"
import { useAiProviderStatuses, useBudgetPreviewSettings, useSaveBudgetPreviewSettings } from "../../hooks/useAi"
import { ProviderModelCard } from "../understand-task/ProviderModelCard"

/** `""` no campo numérico = vazio (usa o padrão do modelo). */
const toNumberOrNull = (value: string) => (value.trim() === "" ? null : Number(value))
const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/**
 * Aba "Orçamentos": provedor, modelo e instruções da IA que gera a prévia da tarefa enviada pelo
 * portal do cliente. A estimativa de horas é configurada em separado, na aba "Estimar prazos".
 */
export function BudgetPreviewTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useBudgetPreviewSettings()
    const save = useSaveBudgetPreviewSettings()
    const { providers } = useAiProviderStatuses()
    const form = useForm<BudgetPreviewSettings>({ resolver: zodResolver(budgetPreviewSettingsSchema), mode: "onChange", defaultValues: DEFAULT_BUDGET_PREVIEW_SETTINGS })
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
    const changeProvider = (next: BudgetPreviewSettings["provider"]) => {
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
                    <FormToggleCard<BudgetPreviewSettings>
                        control={form.control}
                        name="enabled"
                        id="ai-budget-enabled"
                        label="Orçamentos"
                        description="Gera a prévia da tarefa (título, tipo, prioridade, especificação, resumo) a partir da descrição enviada pelo cliente no portal"
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
                    <CardDescription>A descrição enviada pelo cliente é a entrada.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <AnimatePresence initial={false}>
                        {sampling && (
                            <motion.div key="sampling" {...noticeMotion} className="overflow-hidden">
                                <div className={FORM_GRID_WIDE}>
                                    <Field id="ai-budget-temperature" label="Temperatura" error={errors.temperature?.message}>
                                        <Controller
                                            control={form.control}
                                            name="temperature"
                                            render={({ field }) => <Input id="ai-budget-temperature" type="number" step="0.1" min={0} max={2} placeholder="Padrão do modelo" value={field.value ?? ""} onChange={(event) => field.onChange(toNumberOrNull(event.target.value))} />}
                                        />
                                    </Field>
                                    <Field id="ai-budget-max-tokens" label="Máximo de tokens na resposta" error={errors.maxOutputTokens?.message}>
                                        <Controller
                                            control={form.control}
                                            name="maxOutputTokens"
                                            render={({ field }) => <Input id="ai-budget-max-tokens" type="number" step="256" min={256} placeholder="Padrão do modelo" value={field.value ?? ""} onChange={(event) => field.onChange(toNumberOrNull(event.target.value))} />}
                                        />
                                    </Field>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <Field id="ai-budget-instructions" label="Instruções (prompt de sistema)" error={errors.instructions?.message}>
                        <Textarea id="ai-budget-instructions" rows={7} className="font-mono text-xs" {...form.register("instructions")} />
                        <div className="flex justify-end">
                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("instructions", DEFAULT_BUDGET_PREVIEW_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
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
