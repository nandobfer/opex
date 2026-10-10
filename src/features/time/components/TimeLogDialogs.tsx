"use client"

import { useEffect } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { formatMinutes } from "@/features/tasks/format"
import { fromLocalInput, minutesBetween, toLocalInput } from "../format"
import { editPeriodFormSchema, type EditPeriodForm } from "../schemas"
import type { TimeLogDto } from "../types"

const subject = (log: TimeLogDto) => `${log.taskCode ? `${log.taskCode} · ` : ""}${log.taskTitle ?? "Sem tarefa"}`

interface EditPeriodDialogProps {
    log: TimeLogDto | null
    submitting: boolean
    onSubmit: (input: { startTime: string; endTime: string }) => Promise<void>
    onClose: () => void
}

/** Editar início/fim de um apontamento. */
export function EditPeriodDialog({ log, submitting, onSubmit, onClose }: EditPeriodDialogProps) {
    const form = useForm<EditPeriodForm>({ resolver: zodResolver(editPeriodFormSchema), mode: "onChange", defaultValues: { startTime: "", endTime: "" } })
    const errors = form.formState.errors
    const key = log?.id ?? ""
    useEffect(() => {
        if (!key || !log) return
        form.reset({ startTime: toLocalInput(log.startTime), endTime: toLocalInput(log.endTime ?? new Date()) })
    }, [key, log, form])
    const [start, end] = useWatch({ control: form.control, name: ["startTime", "endTime"] })
    const preview = start && end && new Date(end) > new Date(start) ? formatMinutes(minutesBetween(fromLocalInput(start), fromLocalInput(end))) : null

    return (
        <Dialog open={log !== null} onOpenChange={(open) => !open && !submitting && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <form className="space-y-5" onSubmit={form.handleSubmit((values) => onSubmit({ startTime: fromLocalInput(values.startTime), endTime: fromLocalInput(values.endTime) }))}>
                    <DialogHeader>
                        <DialogTitle>Editar período</DialogTitle>
                        <DialogDescription>{log && subject(log)}. Ajuste início e fim.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field id="period-start" label="Início" error={errors.startTime?.message}>
                            <Input id="period-start" type="datetime-local" disabled={submitting} {...form.register("startTime")} />
                        </Field>
                        <Field id="period-end" label="Fim" error={errors.endTime?.message}>
                            <Input id="period-end" type="datetime-local" disabled={submitting} {...form.register("endTime")} />
                        </Field>
                    </div>
                    {preview && <p className="text-xs text-muted-foreground">Duração: <strong className="font-mono text-foreground">{preview}</strong></p>}
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={submitting || !form.formState.isValid}>
                            {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                            Salvar período
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

interface DeleteTimeLogDialogProps {
    log: TimeLogDto | null
    submitting: boolean
    onSubmit: () => Promise<void>
    onClose: () => void
}

/** Excluir apontamento. */
export function DeleteTimeLogDialog({ log, submitting, onSubmit, onClose }: DeleteTimeLogDialogProps) {
    return (
        <Dialog open={log !== null} onOpenChange={(open) => !open && !submitting && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Excluir apontamento</DialogTitle>
                    <DialogDescription>
                        {log && subject(log)}
                        {log?.duration != null && ` (${formatMinutes(log.duration)})`}. O apontamento é excluído.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                        Cancelar
                    </Button>
                    <Button type="button" variant="destructive" disabled={submitting} onClick={() => void onSubmit()}>
                        {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                        Excluir
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
