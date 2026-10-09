"use client"

import { useEffect, useId } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Controller, useFieldArray, useForm, type Control, type UseFormRegister } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Plus, RotateCcw, Save, Trash2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_TYPE_LABELS, TASK_TYPES } from "@/features/tasks/constants"
import { DEFAULT_PRIORITY_RULES, DEFAULT_TYPE_RULES } from "../../logic"
import { mappingInputSchema, type MappingInput } from "../../schemas"
import { useGithubIssueTypes, useGithubLabels, useGithubMapping, useSaveMapping } from "../../hooks/useGithub"
import { NotConfiguredHint } from "../shared"

const KIND_OPTIONS = [
    { value: "type", label: "Issue Type" },
    { value: "label", label: "Label" },
] as const

const rowMotion = { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.16 } }

/**
 * Aba Mapeamento: Issue Type/label → tipo da tarefa (Issue Type vale mais que label; a primeira
 * regra que casar vence) e label → prioridade. Salvar reaplica nos rascunhos pendentes.
 */
export function GithubMappingTab({ configured, onDirtyChange }: { configured: boolean; onDirtyChange: (dirty: boolean) => void }) {
    const mapping = useGithubMapping()
    const save = useSaveMapping()
    const labels = useGithubLabels(configured)
    const issueTypes = useGithubIssueTypes(configured)
    const form = useForm<MappingInput>({ resolver: zodResolver(mappingInputSchema), mode: "onChange", defaultValues: { typeRules: [], priorityRules: [] } })
    const typeRules = useFieldArray({ control: form.control, name: "typeRules" })
    const priorityRules = useFieldArray({ control: form.control, name: "priorityRules" })
    const labelsId = useId()
    const typesId = useId()
    const dirty = form.formState.isDirty

    useEffect(() => {
        if (mapping.data) form.reset({ typeRules: mapping.data.typeRules, priorityRules: mapping.data.priorityRules })
    }, [mapping.data, form])
    useEffect(() => {
        onDirtyChange(dirty)
        return () => onDirtyChange(false)
    }, [dirty, onDirtyChange])

    if (!configured) return <NotConfiguredHint />
    if (mapping.isLoading) return <Skeleton className="h-72 w-full" />
    if (mapping.isError) return <ErrorState title="Não foi possível carregar o mapeamento" description={apiErrorMessage(mapping.error, "Tente novamente.")} onRetry={() => void mapping.refetch()} />

    const submit = form.handleSubmit(async (values) => {
        const saved = await save.mutateAsync(values).catch(() => null)
        if (saved) form.reset({ typeRules: saved.typeRules, priorityRules: saved.priorityRules })
    })

    return (
        <>
            <datalist id={labelsId}>
                {(labels.data ?? []).map((label) => (
                    <option key={label.name} value={label.name} />
                ))}
            </datalist>
            <datalist id={typesId}>
                {(issueTypes.data ?? []).map((name) => (
                    <option key={name} value={name} />
                ))}
            </datalist>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Tipo da tarefa</CardTitle>
                    <CardDescription>Issue Type da issue tem precedência sobre labels; entre as labels, vale a primeira regra da lista. Sem regra, usa o tipo padrão do vínculo.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <AnimatePresence initial={false}>
                        {typeRules.fields.map((field, index) => (
                            <motion.div key={field.id} {...rowMotion} className="grid gap-2 sm:grid-cols-[170px_minmax(0,1fr)_200px_auto] sm:items-center">
                                <Controller control={form.control} name={`typeRules.${index}.kind`} render={({ field: kind }) => <OptionTabs options={KIND_OPTIONS} value={kind.value} onChange={kind.onChange} size="sm" className="w-full" />} />
                                <TypeValueInput control={form.control} register={form.register} index={index} labelsId={labelsId} typesId={typesId} invalid={Boolean(form.formState.errors.typeRules?.[index]?.value)} />
                                <Controller
                                    control={form.control}
                                    name={`typeRules.${index}.taskType`}
                                    render={({ field: type }) => (
                                        <Select value={type.value} onValueChange={type.onChange}>
                                            <SelectTrigger className="w-full" aria-label="Tipo da tarefa">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {TASK_TYPES.map((value) => (
                                                    <SelectItem key={value} value={value}>
                                                        {TASK_TYPE_LABELS[value]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                                <Button type="button" variant="ghost" size="icon" aria-label="Remover regra" onClick={() => typeRules.remove(index)}>
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                </Button>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {typeRules.fields.length === 0 && <p className="py-2 text-sm text-muted-foreground">Sem regras: toda issue usa o tipo padrão do vínculo.</p>}
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => typeRules.append({ kind: "label", value: "", taskType: "feature" })}>
                        <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar regra
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Prioridade</CardTitle>
                    <CardDescription>Label da issue → prioridade (a primeira regra que casar vence). Sem regra, usa a prioridade padrão do vínculo.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <AnimatePresence initial={false}>
                        {priorityRules.fields.map((field, index) => (
                            <motion.div key={field.id} {...rowMotion} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-center">
                                <Input list={labelsId} placeholder="Label" aria-label="Label" aria-invalid={form.formState.errors.priorityRules?.[index]?.label ? true : undefined} {...form.register(`priorityRules.${index}.label`)} />
                                <Controller
                                    control={form.control}
                                    name={`priorityRules.${index}.priority`}
                                    render={({ field: priority }) => (
                                        <Select value={priority.value} onValueChange={priority.onChange}>
                                            <SelectTrigger className="w-full" aria-label="Prioridade">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {TASK_PRIORITIES.map((value) => (
                                                    <SelectItem key={value} value={value}>
                                                        {TASK_PRIORITY_LABELS[value]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                                <Button type="button" variant="ghost" size="icon" aria-label="Remover regra" onClick={() => priorityRules.remove(index)}>
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                </Button>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {priorityRules.fields.length === 0 && <p className="py-2 text-sm text-muted-foreground">Sem regras: toda issue usa a prioridade padrão do vínculo.</p>}
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => priorityRules.append({ label: "", priority: "medium" })}>
                        <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar regra
                    </Button>
                </CardContent>
            </Card>

            <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
                <Button type="button" variant="ghost" className="mr-auto gap-1.5" onClick={() => form.reset({ typeRules: DEFAULT_TYPE_RULES, priorityRules: DEFAULT_PRIORITY_RULES }, { keepDefaultValues: true })}>
                    <RotateCcw className="h-4 w-4" aria-hidden /> Valores iniciais
                </Button>
                <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || save.isPending} onClick={() => mapping.data && form.reset({ typeRules: mapping.data.typeRules, priorityRules: mapping.data.priorityRules })}>
                    <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
                </Button>
                <Button type="button" className="gap-1.5" disabled={(!dirty && !mapping.data?.isDefault) || save.isPending || !form.formState.isValid} onClick={() => void submit()}>
                    {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                    Salvar
                </Button>
            </div>
        </>
    )
}

function TypeValueInput({ control, register, index, labelsId, typesId, invalid }: { control: Control<MappingInput>; register: UseFormRegister<MappingInput>; index: number; labelsId: string; typesId: string; invalid: boolean }) {
    return (
        <Controller
            control={control}
            name={`typeRules.${index}.kind`}
            render={({ field: kind }) => (
                <Input
                    list={kind.value === "type" ? typesId : labelsId}
                    placeholder={kind.value === "type" ? "Issue Type (ex.: Bug)" : "Label (ex.: bug)"}
                    aria-label={kind.value === "type" ? "Issue Type" : "Label"}
                    aria-invalid={invalid || undefined}
                    {...register(`typeRules.${index}.value`)}
                />
            )}
        />
    )
}
