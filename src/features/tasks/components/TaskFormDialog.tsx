"use client"

import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { BoardColumnView } from "../board"
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_TYPES, TASK_TYPE_LABELS } from "../constants"
import { taskInputSchema, type TaskInput } from "../schemas"
import type { ProjectRef, TaskDetailDto, TaskDto } from "../types"

interface TaskFormDialogProps {
    open: boolean
    /** Tarefa em edição; `null` = nova. */
    task: TaskDto | TaskDetailDto | null
    projects: readonly ProjectRef[]
    columns: readonly BoardColumnView[]
    /** Coluna inicial da nova tarefa. */
    defaultColumnKey?: string
    submitting: boolean
    onSubmit: (values: TaskInput) => Promise<void> | void
    onClose: () => void
}

const emptyValues = (projectId: string, columnKey: string): TaskInput => ({
    title: "",
    projectId,
    columnId: columnKey,
    description: "",
    technicalSpec: "",
    taskType: null,
    priority: "medium",
})

/** Criar/editar tarefa (mesmo schema Zod da API). */
export function TaskFormDialog({ open, task, projects, columns, defaultColumnKey, submitting, onSubmit, onClose }: TaskFormDialogProps) {
    const form = useForm<TaskInput>({ resolver: zodResolver(taskInputSchema), mode: "onChange", defaultValues: emptyValues(projects[0]?.id ?? "", defaultColumnKey ?? columns[0]?.key ?? "") })

    useEffect(() => {
        if (!open) return
        form.reset(
            task
                ? {
                      title: task.title,
                      projectId: task.project?.id ?? projects[0]?.id ?? "",
                      columnId: task.columnId,
                      description: (task as TaskDetailDto).description ?? "",
                      technicalSpec: (task as TaskDetailDto).technicalSpec ?? "",
                      taskType: task.taskType,
                      priority: task.priority,
                  }
                : emptyValues(projects[0]?.id ?? "", defaultColumnKey ?? columns[0]?.key ?? ""),
        )
    }, [open, task, projects, columns, defaultColumnKey, form])

    const errors = form.formState.errors

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !submitting && onClose()}>
            <DialogContent className="sm:max-w-2xl">
                <form
                    className="space-y-5"
                    onSubmit={form.handleSubmit(async (values) => {
                        await onSubmit(values)
                    })}
                >
                    <DialogHeader>
                        <DialogTitle>{task ? `Editar ${task.code}` : "Nova tarefa"}</DialogTitle>
                        <DialogDescription>As tarefas dO Opex são locais: título, projeto, coluna, tipo e prioridade.</DialogDescription>
                    </DialogHeader>

                    <Field id="task-title" label="Título" error={errors.title?.message}>
                        <Input id="task-title" autoFocus placeholder="Ex.: Ajustar o relatório de horas" {...form.register("title")} aria-invalid={errors.title ? true : undefined} />
                    </Field>

                    <div className={FORM_GRID}>
                        <Field id="task-project" label="Projeto" error={errors.projectId?.message}>
                            <Controller
                                control={form.control}
                                name="projectId"
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger id="task-project" aria-label="Projeto">
                                            <SelectValue placeholder="Selecione o projeto" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {projects.map((project) => (
                                                <SelectItem key={project.id} value={project.id}>
                                                    {project.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </Field>
                        <Field id="task-column" label="Coluna" error={errors.columnId?.message}>
                            <Controller
                                control={form.control}
                                name="columnId"
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger id="task-column" aria-label="Coluna">
                                            <SelectValue placeholder="Selecione a coluna" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {columns.map((column) => (
                                                <SelectItem key={column.key} value={column.key}>
                                                    {column.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </Field>
                        <Field id="task-type" label="Tipo">
                            <Controller
                                control={form.control}
                                name="taskType"
                                render={({ field }) => (
                                    <Select value={field.value ?? "none"} onValueChange={(value) => field.onChange(value === "none" ? null : value)}>
                                        <SelectTrigger id="task-type" aria-label="Tipo">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Sem tipo</SelectItem>
                                            {TASK_TYPES.map((type) => (
                                                <SelectItem key={type} value={type}>
                                                    {TASK_TYPE_LABELS[type]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </Field>
                        <Field id="task-priority" label="Prioridade">
                            <Controller
                                control={form.control}
                                name="priority"
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger id="task-priority" aria-label="Prioridade">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {TASK_PRIORITIES.map((priority) => (
                                                <SelectItem key={priority} value={priority}>
                                                    {TASK_PRIORITY_LABELS[priority]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </Field>
                    </div>

                    <Field id="task-description" label="Descrição" error={errors.description?.message}>
                        <Textarea id="task-description" rows={4} placeholder="Markdown aceito" {...form.register("description")} />
                    </Field>

                    <Field id="task-spec" label="Especificação técnica" error={errors.technicalSpec?.message}>
                        <Textarea id="task-spec" rows={4} placeholder="Markdown aceito" {...form.register("technicalSpec")} />
                    </Field>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={submitting || !form.formState.isValid}>
                            {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                            {task ? "Salvar" : "Criar tarefa"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
