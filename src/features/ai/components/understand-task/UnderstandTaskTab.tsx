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
import { DEFAULT_UNDERSTAND_TASK_SETTINGS, understandTaskSettingsSchema, type UnderstandTaskSettings } from "../../schemas"
import { useAiProviderStatuses, useSaveUnderstandTaskSettings, useUnderstandTaskSettings } from "../../hooks/useAi"
import { IncludeCard } from "./IncludeCard"
import { ProviderModelCard } from "./ProviderModelCard"
import { ResponseCard } from "./ResponseCard"

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/** Aba "Entender tarefas": provedor, modelo e demais opções do botão "Entender tarefa". */
export function UnderstandTaskTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useUnderstandTaskSettings()
    const save = useSaveUnderstandTaskSettings()
    const { providers } = useAiProviderStatuses()
    const form = useForm<UnderstandTaskSettings>({ resolver: zodResolver(understandTaskSettingsSchema), mode: "onChange", defaultValues: DEFAULT_UNDERSTAND_TASK_SETTINGS })
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
    const changeProvider = (next: UnderstandTaskSettings["provider"]) => {
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
                    <FormToggleCard<UnderstandTaskSettings>
                        control={form.control}
                        name="enabled"
                        id="ai-understand-enabled"
                        label="Entender tarefa"
                        description="Botão na página da tarefa que explica a tarefa com IA, em streaming, a partir de todo o conteúdo dela"
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
                                O conteúdo da tarefa vem de terceiros (Go! Sipal). Um agente do OpenCode com shell ou edição de arquivos pode ser induzido a executar comandos: prefira um agente só de leitura e confira as permissões dele no
                                opencode.json.
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <ResponseCard form={form} />
            <IncludeCard form={form} />

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
