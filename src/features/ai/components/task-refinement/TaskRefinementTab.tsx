"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FolderGit2, Info, Loader2, RotateCcw, Save, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { DEFAULT_TASK_REFINEMENT_INSTRUCTIONS, REFINEMENT_INCLUDE_LABELS } from "../../constants"
import { DEFAULT_TASK_REFINEMENT_SETTINGS, taskRefinementSettingsSchema, type TaskRefinementSettings } from "../../schemas"
import { useAiProviderStatuses, useSaveTaskRefinementSettings, useTaskRefinementSettings } from "../../hooks/useAi"
import { useCentrals } from "@/features/agentic/hooks/useAgentic"
import { ProviderModelCard } from "../understand-task/ProviderModelCard"

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }
const INCLUDE_KEYS = Object.keys(REFINEMENT_INCLUDE_LABELS) as (keyof typeof REFINEMENT_INCLUDE_LABELS)[]

/**
 * Aba "Refinar tarefa": configura o agente do OpenCode que lê a tarefa, faz perguntas (formulários)
 * e reescreve a especificação técnica até ela ficar clara. Exclusiva do OpenCode; a sessão é criada
 * no diretório da central de desenvolvimento do projeto da tarefa.
 */
export function TaskRefinementTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useTaskRefinementSettings()
    const save = useSaveTaskRefinementSettings()
    const { providers } = useAiProviderStatuses()
    const centrals = useCentrals()
    const form = useForm<TaskRefinementSettings>({ resolver: zodResolver(taskRefinementSettingsSchema), mode: "onChange", defaultValues: DEFAULT_TASK_REFINEMENT_SETTINGS })
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
                    <FormToggleCard<TaskRefinementSettings>
                        control={form.control}
                        name="enabled"
                        id="ai-refine-enabled"
                        label="Refinar tarefa"
                        description="Um agente do OpenCode lê a tarefa, faz perguntas até a especificação técnica ficar clara e vai reescrevendo o campo de especificação da tarefa"
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
                    <CardTitle className="text-base">Diretório da sessão</CardTitle>
                    <CardDescription>As sessões do OpenCode são criadas no diretório da central de desenvolvimento do projeto da tarefa — nunca no diretório da integração acima.</CardDescription>
                </CardHeader>
                <CardContent>
                    {centrals.isLoading ? (
                        <Skeleton className="h-10 w-full" />
                    ) : (centrals.data ?? []).length === 0 ? (
                        <p className="flex items-start gap-2 text-sm text-muted-foreground">
                            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Nenhuma central de desenvolvimento criada. Crie uma em
                            <span className="font-medium"> Desenvolvimento agêntico › Centrais de desenvolvimento</span> para poder refinar tarefas.
                        </p>
                    ) : (
                        <ul className="space-y-1.5">
                            {(centrals.data ?? []).map((central) => (
                                <li key={central.id} className="flex items-center gap-2 text-sm">
                                    <FolderGit2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                                    <span className="font-medium">{central.projectName}</span>
                                    <span className="truncate font-mono text-xs text-muted-foreground">{central.config.sessionDirectory}</span>
                                    {!central.config.enabled && <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">desativada</span>}
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">O que enviar</CardTitle>
                    <CardDescription>Código, título, tipo, prioridade, projeto, descrição e especificação vão sempre.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {INCLUDE_KEYS.map((key) => (
                            <FormToggleCard<TaskRefinementSettings> key={key} control={form.control} name={`include.${key}`} id={`ai-refine-include-${key}`} label={REFINEMENT_INCLUDE_LABELS[key].label} description={REFINEMENT_INCLUDE_LABELS[key].description} onLabel="Enviar" offLabel="Não enviar" />
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Instruções</CardTitle>
                    <CardDescription>Recebe a tarefa inteira; o protocolo de perguntas e de reescrita da especificação é sempre aplicado por cima destas instruções.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Field id="ai-refine-instructions" label="Instruções (prompt de sistema)" error={errors.instructions?.message}>
                        <Textarea id="ai-refine-instructions" rows={7} className="font-mono text-xs" {...form.register("instructions")} />
                        <div className="flex justify-end">
                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("instructions", DEFAULT_TASK_REFINEMENT_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                            </Button>
                        </div>
                    </Field>
                    <p className="mt-2 text-xs text-muted-foreground">O protocolo garante que a especificação cubra critérios de aceite, localização da mudança (rotas, telas, módulos, integrações) e casos de borda.</p>
                    <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> O agente pergunta pela ferramenta nativa de perguntas do OpenCode. Use o agente <span className="font-medium">Plan</span> ou outro que a tenha habilitada — os subagentes <span className="font-mono">general</span> e <span className="font-mono">explore</span> não conseguem perguntar.
                    </p>
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
