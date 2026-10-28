"use client"

import { useEffect, useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, CheckCircle2, ListTree, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Textarea } from "@/components/ui/textarea"
import type { ManualStage } from "../../constants"
import { useSetWorkbenchStage } from "../../hooks/useAgentic"
import { manualStageOptions } from "../../logic"
import { setWorkbenchStageSchema, type SetWorkbenchStageInput } from "../../schemas"
import type { WorkbenchDto } from "../../types"

/** O que acontece ao escolher cada etapa (texto do diálogo). */
function stageEffect(stage: ManualStage, workbench: WorkbenchDto): string {
    switch (stage) {
        case "plan_review":
            return "A mesa volta à revisão do plano, sem replanejar: depois você pode implementar ou pedir correção do plano."
        case "preview":
            return "A mesa volta à prévia publicada: você pode aprovar, pedir correção ou gerar uma nova prévia (se o ambiente tiver sido derrubado)."
        case "pr_open":
            return `A mesa volta a acompanhar o PR #${workbench.pr?.number ?? ""} (comentários, CI e merge).`
        case "changes_requested":
            return "A mesa pede a descrição das mudanças do PR para replanejar."
        case "done":
            return `Conclui a mesa sem PR: a tarefa vai para a coluna "Ao concluir" (conforme a central), o ambiente registrado pela mesa é limpo (inclusive o backup do MongoDB da prévia)${workbench.branch ? ` — inclusive a branch local ${workbench.branch}, que pode ter commits sem PR` : ""} e a sessão do OpenCode é excluída. A mesa, os planos, a saída e a auditoria ficam.`
    }
}

interface SetStageDialogProps {
    workbench: WorkbenchDto
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Etapa pré-selecionada ao abrir ("Concluir mesa…" abre em Concluída). */
    initialStage: ManualStage
}

/** Definir a etapa da mesa (ou concluí-la sem PR), com o motivo que vai para a auditoria. */
export function SetStageDialog({ workbench, open, onOpenChange, initialStage }: SetStageDialogProps) {
    const mutation = useSetWorkbenchStage(workbench)
    const options = useMemo(() => manualStageOptions(workbench), [workbench])
    const form = useForm<SetWorkbenchStageInput>({ resolver: zodResolver(setWorkbenchStageSchema), mode: "onChange", defaultValues: { stage: initialStage, reason: "" } })
    const stage = useWatch({ control: form.control, name: "stage" })
    const errors = form.formState.errors
    const selected = options.find((option) => option.stage === stage)
    const unavailable = options.filter((option) => !option.available)
    const busy = workbench.runState === "running" || Boolean(workbench.slotQueue)

    useEffect(() => {
        if (open) form.reset({ stage: initialStage, reason: "" })
    }, [open, initialStage, form])

    const submit = form.handleSubmit(async (values) => {
        const saved = await mutation.mutateAsync(values).catch(() => null)
        if (saved) onOpenChange(false)
    })

    return (
        <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
            <DialogContent className="sm:max-w-lg">
                <form
                    className="space-y-4"
                    onSubmit={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        void submit()
                    }}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ListTree className="h-4 w-4 text-primary" aria-hidden /> Definir a etapa da mesa de {workbench.taskCode}
                        </DialogTitle>
                        <DialogDescription>Leva a mesa direto para uma etapa de espera, sem passar pelo fluxo normal. A ação e o motivo ficam na auditoria e na saída da mesa.</DialogDescription>
                    </DialogHeader>

                    <Field id="workbench-stage" label="Etapa">
                        <OptionTabs<ManualStage>
                            id="workbench-stage"
                            aria-label="Etapa"
                            className="flex-col"
                            options={options.map((option) => ({ value: option.stage, label: option.label, disabled: !option.available, title: option.reason ?? option.label }))}
                            value={stage}
                            onChange={(value) => form.setValue("stage", value, { shouldDirty: true, shouldValidate: true })}
                        />
                    </Field>

                    <AnimatePresence mode="wait" initial={false}>
                        <motion.p key={stage} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="text-xs text-muted-foreground" data-testid="stage-effect">
                            {selected?.available ? stageEffect(stage, workbench) : (selected?.reason ?? "")}
                        </motion.p>
                    </AnimatePresence>

                    {unavailable.length > 0 && (
                        <ul className="space-y-0.5 text-[11px] text-muted-foreground" aria-label="Etapas indisponíveis">
                            {unavailable.map((option) => (
                                <li key={option.stage}>
                                    <span className="font-medium text-foreground/80">{option.label}:</span> {option.reason}
                                </li>
                            ))}
                        </ul>
                    )}

                    {busy && (
                        <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning" role="status">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {workbench.slotQueue ? "A espera por vaga na central será descartada." : "O agente está trabalhando: o turno em andamento será interrompido."}
                        </p>
                    )}

                    <Field id="workbench-stage-reason" label="Motivo" error={errors.reason?.message}>
                        <Textarea id="workbench-stage-reason" rows={3} placeholder="Ex.: o problema já foi resolvido em outra tarefa" {...form.register("reason")} aria-invalid={errors.reason ? true : undefined} />
                    </Field>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={mutation.isPending || !form.formState.isValid || !selected?.available}>
                            {mutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : stage === "done" ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden /> : null}
                            {stage === "done" ? "Concluir mesa" : "Definir etapa"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
