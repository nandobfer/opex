"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangle, Info, Loader2, Save, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { DEFAULT_TASK_SUMMARY_SETTINGS, taskSummarySettingsSchema, type TaskSummarySettings } from "../../schemas"
import { useAiProviderStatuses, useSaveTaskSummarySettings, useTaskSummarySettings } from "../../hooks/useAi"
import { ProviderModelCard } from "../understand-task/ProviderModelCard"
import { SummaryPromptCard } from "./SummaryPromptCard"

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/** Aba "Resumos de tarefas": provedor, modelo e opções do resumo de 1 linha do card e da tarefa. */
export function TaskSummaryTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useTaskSummarySettings()
    const save = useSaveTaskSummarySettings()
    const { providers } = useAiProviderStatuses()
    const form = useForm<TaskSummarySettings>({ resolver: zodResolver(taskSummarySettingsSchema), mode: "onChange", defaultValues: DEFAULT_TASK_SUMMARY_SETTINGS })
    const dirty = form.formState.isDirty
    const provider = useWatch({ control: form.control, name: "provider" })

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
    const changeProvider = (next: TaskSummarySettings["provider"]) => {
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
                    <FormToggleCard<TaskSummarySettings>
                        control={form.control}
                        name="enabled"
                        id="ai-task-summary-enabled"
                        label="Resumos de tarefas"
                        description="Gera um resumo de 1 linha por tarefa com IA (substitui a descrição no card e na página). Ao ativar, resume também as tarefas não concluídas que ainda não têm resumo"
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

            <AnimatePresence initial={false}>
                {provider === "opencode" && (
                    <motion.div key="agent-warning" {...noticeMotion} className="overflow-hidden">
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            <span>
                                O conteúdo da tarefa pode vir de terceiros (ex.: issues do GitHub). Um agente do OpenCode com shell ou edição de arquivos pode ser induzido a executar comandos: prefira um agente só de leitura e confira as permissões dele no
                                opencode.json.
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <SummaryPromptCard form={form} />

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
