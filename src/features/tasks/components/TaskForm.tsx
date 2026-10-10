"use client"

import { useEffect, useMemo } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { FORM_GRID } from "@/components/ui/form-grid"
import { FormFooter } from "@/components/ui/form-footer"
import { Input } from "@/components/ui/input"
import { MarkdownField } from "@/components/ui/markdown-field"
import { SearchPicker } from "@/components/ui/search-picker"
import type { BoardColumnView } from "../board"
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_TYPES, TASK_TYPE_LABELS, type TaskPriority, type TaskType } from "../constants"
import { taskFormSchema, type TaskFormValues } from "../schemas"
import type { ProjectRef, TaskDetailDto } from "../types"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelOption, useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import { ColumnBadge, TaskPriorityBadge, TaskTypeBadge } from "./TaskBadges"

interface TaskFormProps {
    mode: "create" | "edit"
    /** Tarefa em edição (modo `edit`). */
    task?: TaskDetailDto | null
    projects: readonly ProjectRef[]
    columns: readonly BoardColumnView[]
    /** Coluna inicial da nova tarefa. */
    defaultColumnKey?: string
    submitting: boolean
    onSubmit: (values: TaskFormValues) => Promise<void> | void
    onCancel: () => void
}

type TypeOption = { value: string; label: string }
const typeOptions: TypeOption[] = [{ value: "", label: "Sem tipo" }, ...TASK_TYPES.map((type) => ({ value: type, label: TASK_TYPE_LABELS[type] }))]
const priorityOptions: TypeOption[] = TASK_PRIORITIES.map((priority) => ({ value: priority, label: TASK_PRIORITY_LABELS[priority] }))

const emptyValues = (projectId: string, columnKey: string): TaskFormValues => ({
    title: "",
    projectId,
    columnId: columnKey,
    description: "",
    taskType: null,
    priority: "medium",
})

/**
 * Formulário de tarefa (criar/editar) no estilo "nova issue": título, descrição com Markdown e
 * pré-visualização e metadados (repositório, coluna, tipo e prioridade) em autocomplete com chips.
 * Sem o campo de especificação técnica.
 */
export function TaskForm({ mode, task, projects, columns, defaultColumnKey, submitting, onSubmit, onCancel }: TaskFormProps) {
    const form = useForm<TaskFormValues>({
        resolver: zodResolver(taskFormSchema),
        mode: "onChange",
        defaultValues: emptyValues(projects[0]?.id ?? "", defaultColumnKey ?? columns[0]?.key ?? ""),
    })

    useEffect(() => {
        form.reset(
            task
                ? {
                      title: task.title,
                      projectId: task.project?.id ?? projects[0]?.id ?? "",
                      columnId: task.columnId,
                      description: task.description ?? "",
                      taskType: task.taskType,
                      priority: task.priority,
                  }
                : emptyValues(projects[0]?.id ?? "", defaultColumnKey ?? columns[0]?.key ?? ""),
        )
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [task?.id, mode, projects, columns, defaultColumnKey])

    const errors = form.formState.errors
    const [projectId, columnId, taskType, priority] = useWatch({ control: form.control, name: ["projectId", "columnId", "taskType", "priority"] })
    const project = useMemo(() => projects.find((item) => item.id === projectId) ?? null, [projects, projectId])
    const column = useMemo(() => columns.find((item) => item.key === columnId) ?? null, [columns, columnId])
    const repoIndex = useRepoIndex()

    const repoField = (
        <Field id="task-repo" label="Repositório" error={errors.projectId?.message}>
            {mode === "edit" ? (
                <FieldTrigger id="task-repo" placeholder="Repositório" disabled value={project ? <GithubRepoLabel repo={repoLabelOption(project.repo, repoIndex)} /> : undefined} />
            ) : (
                <Controller
                    control={form.control}
                    name="projectId"
                    render={({ field }) => (
                        <SearchPicker
                            trigger={<FieldTrigger id="task-repo" placeholder="Escolha o repositório" invalid={Boolean(errors.projectId)} value={project ? <GithubRepoLabel repo={repoLabelOption(project.repo, repoIndex)} /> : undefined} />}
                            items={projects}
                            getKey={(item) => item.id}
                            searchKeys={["repo", "name", "sigla"]}
                            renderItem={(item) => <GithubRepoLabel repo={repoLabelOption(item.repo, repoIndex)} />}
                            onPick={(item) => field.onChange(item.id)}
                            matchTriggerWidth
                            searchLabel="Buscar repositório"
                            listLabel="Repositórios vinculados"
                            emptyText="Nenhum repositório vinculado: vincule um em Integrações › GitHub"
                            emptySearchText="Nenhum repositório encontrado"
                        />
                    )}
                />
            )}
        </Field>
    )

    return (
        <form
            className="space-y-5"
            onSubmit={form.handleSubmit(async (values) => {
                await onSubmit(values)
            })}
        >
            <Field id="task-title" label="Título" error={errors.title?.message}>
                <Input id="task-title" autoFocus placeholder="Ex.: Ajustar o relatório de horas" {...form.register("title")} aria-invalid={errors.title ? true : undefined} />
            </Field>

            <Field id="task-description" label="Descrição" error={errors.description?.message}>
                <Controller
                    control={form.control}
                    name="description"
                    render={({ field }) => <MarkdownField id="task-description" value={field.value ?? ""} onChange={field.onChange} rows={8} placeholder="Markdown aceito" invalid={Boolean(errors.description)} />}
                />
            </Field>

            <div className={FORM_GRID}>
                {repoField}

                <Field id="task-column" label="Coluna" error={errors.columnId?.message}>
                    <Controller
                        control={form.control}
                        name="columnId"
                        render={({ field }) => (
                            <SearchPicker
                                trigger={<FieldTrigger id="task-column" placeholder="Escolha a coluna" invalid={Boolean(errors.columnId)} value={column ? <ColumnBadge column={column} /> : undefined} />}
                                items={columns}
                                getKey={(item) => item.key}
                                searchKeys={["label"]}
                                renderItem={(item) => <ColumnBadge column={item} />}
                                onPick={(item) => field.onChange(item.key)}
                                matchTriggerWidth
                                searchLabel="Buscar coluna"
                                listLabel="Colunas"
                                emptyText="Nenhuma coluna: crie uma no quadro de Tarefas"
                                emptySearchText="Nenhuma coluna encontrada"
                            />
                        )}
                    />
                </Field>

                <Field id="task-type" label="Tipo">
                    <Controller
                        control={form.control}
                        name="taskType"
                        render={({ field }) => (
                            <SearchPicker
                                trigger={<FieldTrigger id="task-type" placeholder="Sem tipo" value={taskType ? <TaskTypeBadge type={taskType} long /> : undefined} />}
                                items={typeOptions}
                                getKey={(item) => item.value || "none"}
                                searchKeys={["label"]}
                                renderItem={(item) => (item.value ? <TaskTypeBadge type={item.value as TaskType} long /> : <span className="text-sm text-muted-foreground">Sem tipo</span>)}
                                onPick={(item) => field.onChange(item.value === "" ? null : (item.value as TaskType))}
                                matchTriggerWidth
                                searchLabel="Buscar tipo"
                                listLabel="Tipos"
                                emptyText="Nenhum tipo"
                                emptySearchText="Nenhum tipo encontrado"
                            />
                        )}
                    />
                </Field>

                <Field id="task-priority" label="Prioridade">
                    <Controller
                        control={form.control}
                        name="priority"
                        render={({ field }) => (
                            <SearchPicker
                                trigger={<FieldTrigger id="task-priority" placeholder="Prioridade" value={<TaskPriorityBadge priority={priority ?? "medium"} />} />}
                                items={priorityOptions}
                                getKey={(item) => item.value}
                                searchKeys={["label"]}
                                renderItem={(item) => <TaskPriorityBadge priority={item.value as TaskPriority} />}
                                onPick={(item) => field.onChange(item.value as TaskPriority)}
                                matchTriggerWidth
                                searchLabel="Buscar prioridade"
                                listLabel="Prioridades"
                                emptyText="Nenhuma prioridade"
                                emptySearchText="Nenhuma prioridade encontrada"
                            />
                        )}
                    />
                </Field>
            </div>

            <FormFooter>
                <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={submitting || !form.formState.isValid}>
                    {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                    {mode === "edit" ? "Salvar" : "Criar tarefa"}
                </Button>
            </FormFooter>
        </form>
    )
}
