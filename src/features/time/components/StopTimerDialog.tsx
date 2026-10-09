"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronRight, Clock, Loader2, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useNow } from "@/hooks/useNow"
import { cn } from "@/lib/utils"
import { elapsedSeconds, formatClock, fromLocalInput, toLocalInput } from "../format"
import { stopTimerFormSchema, type StopTimerForm } from "../schemas"
import type { TimeLogDto } from "../types"

interface StopTimerDialogProps {
    log: TimeLogDto | null
    /** Tarefa que começa depois de parar (troca de timer). */
    next: { code: string; title: string } | null
    submitting: boolean
    error: string | null
    onConfirm: (input: { description?: string; startTime?: string; endTime?: string }) => Promise<void>
    onCancel: () => void
}

const EMPTY: StopTimerForm = { adjust: false, startTime: "", endTime: "", description: "" }

/**
 * Modal "Parar timer" (igual ao do Go! Sipal): tempo decorrido ao vivo, "Ajustar horários"
 * (início/fim) e descrição do trabalho realizado.
 */
export function StopTimerDialog({ log, next, submitting, error, onConfirm, onCancel }: StopTimerDialogProps) {
    const open = log !== null
    const now = useNow(1000, open)
    const form = useForm<StopTimerForm>({ resolver: zodResolver(stopTimerFormSchema), mode: "onChange", defaultValues: EMPTY })
    const adjust = useWatch({ control: form.control, name: "adjust" })
    const errors = form.formState.errors

    const key = log?.id ?? ""
    useEffect(() => {
        if (!key || !log) return
        form.reset({ adjust: false, startTime: toLocalInput(log.startTime), endTime: toLocalInput(new Date()), description: log.description ?? "" })
    }, [key, log, form])

    const toggleAdjust = () => {
        const nextAdjust = !form.getValues("adjust")
        form.setValue("adjust", nextAdjust, { shouldValidate: true })
        if (nextAdjust) form.setValue("endTime", toLocalInput(new Date()), { shouldValidate: true })
    }

    return (
        <Dialog open={open} onOpenChange={(value) => !value && onCancel()}>
            <DialogContent className="sm:max-w-lg">
                <form
                    className="space-y-5"
                    onSubmit={form.handleSubmit((values) =>
                        onConfirm({
                            description: values.description.trim() || undefined,
                            ...(values.adjust ? { startTime: fromLocalInput(values.startTime), endTime: fromLocalInput(values.endTime) } : {}),
                        }),
                    )}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-success" aria-hidden /> Parar timer
                        </DialogTitle>
                        <DialogDescription>
                            {next ? (
                                <>
                                    Só um timer por vez: pare o atual para iniciar <span className="font-mono text-foreground">{next.code}</span>.
                                </>
                            ) : (
                                "O apontamento é salvo no Go! Sipal."
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    {log && (
                        <div className="flex items-center justify-between gap-4 rounded-lg border border-success/30 bg-success/10 p-4">
                            <div>
                                <p className="text-xs text-muted-foreground">Tempo registrado</p>
                                <p className="font-mono text-2xl font-bold tabular-nums text-success" aria-live="off">
                                    {now ? formatClock(elapsedSeconds(log.startTime, now)) : "--:--:--"}
                                </p>
                            </div>
                            <div className="min-w-0 text-right">
                                <p className="text-xs text-muted-foreground">Tarefa</p>
                                {log.taskCode && <p className="font-mono text-xs font-semibold text-primary">{log.taskCode}</p>}
                                <p className="max-w-[220px] truncate text-sm" title={log.taskTitle ?? undefined}>
                                    {log.taskTitle ?? "Sem tarefa"}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <button
                            type="button"
                            onClick={toggleAdjust}
                            disabled={submitting}
                            aria-expanded={adjust}
                            className={cn("flex items-center gap-1 text-sm transition-colors", adjust ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                        >
                            <motion.span animate={{ rotate: adjust ? 90 : 0 }} transition={{ duration: 0.15 }} className="inline-flex">
                                <ChevronRight className="h-4 w-4" aria-hidden />
                            </motion.span>
                            Ajustar horários
                        </button>
                        <AnimatePresence initial={false}>
                            {adjust && (
                                <motion.div
                                    key="adjust"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <Field id="stop-start" label="Início" error={errors.startTime?.message}>
                                                <Controller control={form.control} name="startTime" render={({ field }) => <Input id="stop-start" type="datetime-local" disabled={submitting} {...field} />} />
                                            </Field>
                                            <Field id="stop-end" label="Fim" error={errors.endTime?.message}>
                                                <Controller control={form.control} name="endTime" render={({ field }) => <Input id="stop-end" type="datetime-local" disabled={submitting} {...field} />} />
                                            </Field>
                                        </div>
                                        <p className="text-xs text-muted-foreground">Ajuste os horários se necessário. Horários no futuro não são permitidos.</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <Field id="stop-description" label="Descrição do trabalho realizado (opcional)" error={errors.description?.message}>
                        <Textarea id="stop-description" rows={3} placeholder="O que você fez durante este período?" disabled={submitting} {...form.register("description")} />
                    </Field>

                    <AnimatePresence>
                        {error && (
                            <motion.p role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                {error}
                            </motion.p>
                        )}
                    </AnimatePresence>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" variant="destructive" disabled={submitting || (adjust && !form.formState.isValid)}>
                            {submitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <Square className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                            {submitting ? "Parando..." : next ? "Parar e iniciar" : "Parar timer"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
