"use client"

import { useEffect, useMemo, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "framer-motion"
import { Eye, Loader2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { FORM_GRID } from "@/components/ui/form-grid"
import { FormFooter } from "@/components/ui/form-footer"
import { Input } from "@/components/ui/input"
import { Markdown } from "@/components/ui/markdown"
import { SearchPicker } from "@/components/ui/search-picker"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { GithubAvatar } from "@/features/github/components/shared"
import type { BoardColumnView } from "../board"
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_TYPES, TASK_TYPE_LABELS, type TaskPriority, type TaskType } from "../constants"
import { taskFormSchema, type TaskFormValues } from "../schemas"
import type { ProjectRef, TaskDetailDto } from "../types"
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
    const [descTab, setDescTab] = useState<"write" | "preview">("write")

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
    const [description, projectId, columnId, taskType, priority] = useWatch({ control: form.control, name: ["description", "projectId", "columnId", "taskType", "priority"] })
    const project = useMemo(() => projects.find((item) => item.id === projectId) ?? null, [projects, projectId])
    const column = useMemo(() => columns.find((item) => item.key === columnId) ?? null, [columns, columnId])

    const repoField = (
        <Field id="task-repo" label="Repositório" error={errors.projectId?.message}>
            {mode === "edit" ? (
                <FieldTrigger id="task-repo" placeholder="Repositório" disabled value={project ? <RepoValue project={project} /> : undefined} />
            ) : (
                <Controller
                    control={form.control}
                    name="projectId"
                    render={({ field }) => (
                        <SearchPicker
                            trigger={<FieldTrigger id="task-repo" placeholder="Escolha o repositório" invalid={Boolean(errors.projectId)} value={project ? <RepoValue project={project} /> : undefined} />}
                            items={projects}
                            getKey={(item) => item.id}
                            searchKeys={["repo", "name", "sigla"]}
                            renderItem={(item) => <RepoValue project={item} />}
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
                <div className="space-y-2">
                    <div role="tablist" aria-label="Editar ou visualizar a descrição" className="flex gap-1 rounded-lg bg-muted p-1">
                        {(
                            [
                                { id: "write", label: "Escrever", icon: Pencil },
                                { id: "preview", label: "Visualizar", icon: Eye },
                            ] as const
                        ).map((tab) => {
                            const active = descTab === tab.id
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setDescTab(tab.id)}
                                    className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                                >
                                    <tab.icon className="h-3.5 w-3.5" aria-hidden />
                                    {tab.label}
                                </button>
                            )
                        })}
                    </div>
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div key={descTab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                            {descTab === "write" ? (
                                <Textarea id="task-description" rows={8} placeholder="Markdown aceito" {...form.register("description")} />
                            ) : (
                                <div className="min-h-[172px] rounded-md border bg-muted/30 p-3">
                                    {description?.trim() ? <Markdown>{description}</Markdown> : <p className="text-sm text-muted-foreground">Nada para visualizar ainda.</p>}
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
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

/** Valor do repositório no gatilho/opções: avatar + `owner/repo` + nome do projeto. */
function RepoValue({ project }: { project: ProjectRef }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <GithubAvatar login={project.repo} />
            <span className="min-w-0 truncate">
                <span className="font-medium">{project.repo}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">{project.name}</span>
            </span>
        </span>
    )
}
