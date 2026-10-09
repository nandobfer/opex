"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Markdown } from "@/components/ui/markdown"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import type { CreatableTaskStatus } from "@/features/github/schemas"
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, TASK_TYPE_LABELS, TASK_TYPES, type TaskPriority, type TaskType } from "../../constants"
import { DRAFT_SENDABLE_STATUSES } from "../../drafts"
import { useDraftDetail, useSendDraft } from "../../hooks/useDrafts"
import type { PersonRef, TaskDto } from "../../types"
import { TaskAssigneePicker } from "../TaskAssigneePicker"

export interface SendDraftRequest {
    task: TaskDto
    status: CreatableTaskStatus
}

interface SendDraftDialogProps {
    request: SendDraftRequest | null
    people: readonly PersonRef[]
    currentUserId: string | null
    onClose: () => void
    /** Enviado com sucesso (ex.: a página do rascunho navega para a tarefa criada). */
    onSent?: (taskId: string) => void
}

const STATUS_OPTIONS = DRAFT_SENDABLE_STATUSES.map((value) => ({ value: value as CreatableTaskStatus, label: TASK_STATUS_LABELS[value] }))
const PRIORITY_OPTIONS = TASK_PRIORITIES.map((value) => ({ value, label: TASK_PRIORITY_LABELS[value] }))
const NO_PACKAGE = "__none__"

/**
 * Confirmação de envio do rascunho ao Go! Sipal (ao soltar numa coluna do Go! Sipal ou pelo botão
 * da página): coluna, tipo, prioridade, responsável e pacote já vêm do mapeamento e podem mudar.
 */
export function SendDraftDialog({ request, people, currentUserId, onClose, onSent }: SendDraftDialogProps) {
    const send = useSendDraft()
    return (
        <Dialog open={request !== null} onOpenChange={(next) => !next && !send.isPending && onClose()}>
            <DialogContent className="sm:max-w-2xl">
                {request && <SendDraftForm key={`${request.task.id}:${request.status}`} request={request} people={people} currentUserId={currentUserId} send={send} onClose={onClose} onSent={onSent} />}
            </DialogContent>
        </Dialog>
    )
}

interface SendDraftFormProps extends Omit<SendDraftDialogProps, "request"> {
    request: SendDraftRequest
    send: ReturnType<typeof useSendDraft>
}

function SendDraftForm({ request, people, currentUserId, send, onClose, onSent }: SendDraftFormProps) {
    const detail = useDraftDetail(request.task.id)
    const [status, setStatus] = useState<CreatableTaskStatus>(request.status)
    const [taskType, setTaskType] = useState<TaskType>(request.task.taskType ?? "feature")
    const [priority, setPriority] = useState<TaskPriority>(request.task.priority)
    const [assignee, setAssignee] = useState<PersonRef | null>(request.task.assignee)
    const [workPackage, setWorkPackage] = useState<{ id: string; name: string } | null>(request.task.workPackage ? { id: request.task.workPackage.id, name: request.task.workPackage.name } : null)
    const [preview, setPreview] = useState(false)

    const confirm = async () => {
        try {
            const result = await send.mutateAsync({
                task: request.task,
                input: {
                    status,
                    taskType,
                    priority,
                    assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null,
                    workPackage,
                },
            })
            onClose()
            onSent?.(result.taskId)
        } catch {
            // Toast já mostrado; o diálogo continua aberto.
        }
    }
    const origins = detail.data?.origins ?? {}
    const hint = (key: string) => (origins[key] ? <span className="ml-1 font-normal text-muted-foreground">· {origins[key]}</span> : null)

    return (
        <>
                <DialogHeader>
                    <DialogTitle>Enviar {request.task.code} para o Go! Sipal?</DialogTitle>
                    <DialogDescription>Cria a tarefa no produto {request.task.product?.name}. As imagens da issue viram anexos e o rascunho sai do quadro.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-sm font-semibold">{request.task.title}</p>
                        <button type="button" onClick={() => setPreview((value) => !value)} className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline" aria-expanded={preview}>
                            <motion.span animate={{ rotate: preview ? 180 : 0 }} className="inline-flex">
                                <ChevronDown className="h-3 w-3" aria-hidden />
                            </motion.span>
                            {preview ? "Ocultar descrição" : "Ver descrição"}
                        </button>
                        <AnimatePresence initial={false}>
                            {preview && (
                                <motion.div key="preview" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                    <div className="custom-scrollbar mt-2 max-h-64 overflow-y-auto text-sm">
                                        {detail.isLoading ? <Skeleton className="h-20 w-full" /> : <Markdown>{detail.data?.previewBody || "_Sem descrição_"}</Markdown>}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <Field id="send-status" label="Coluna no Go! Sipal">
                        <OptionTabs id="send-status" options={STATUS_OPTIONS} value={status} onChange={setStatus} size="md" className="w-full" />
                    </Field>

                    <div className={FORM_GRID}>
                        <Field id="send-type" label="Tipo">
                            <Select value={taskType} onValueChange={(value) => setTaskType(value as TaskType)}>
                                <SelectTrigger id="send-type" className="w-full">
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
                        </Field>
                        <Field id="send-package" label="Pacote de trabalho">
                            <Select value={workPackage?.id ?? NO_PACKAGE} onValueChange={(value) => setWorkPackage(value === NO_PACKAGE ? null : (detail.data?.workPackages.find((item) => item.id === value) ?? null))}>
                                <SelectTrigger id="send-package" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_PACKAGE}>Sem pacote</SelectItem>
                                    {(detail.data?.workPackages ?? (workPackage ? [workPackage] : [])).map((item) => (
                                        <SelectItem key={item.id} value={item.id}>
                                            {item.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field id="send-priority" label="Prioridade">
                            <OptionTabs id="send-priority" options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} size="md" className="w-full" />
                        </Field>
                        <Field id="send-assignee" label="Responsável">
                            <div className="flex h-9 items-center rounded-md border px-2">
                                <TaskAssigneePicker value={assignee} people={people} currentUserId={currentUserId} onChange={setAssignee} />
                            </div>
                        </Field>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Origem: tipo{hint("taskType")}; prioridade{hint("priority")}; responsável{hint("assignee")}; pacote{hint("workPackage")}.
                    </p>
                </div>

                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={send.isPending}>
                        Cancelar
                    </Button>
                    <Button type="button" onClick={() => void confirm()} disabled={send.isPending}>
                        {send.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-1.5 h-4 w-4" aria-hidden />}
                        Enviar para {TASK_STATUS_LABELS[status]}
                    </Button>
                </DialogFooter>
        </>
    )
}
