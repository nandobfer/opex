"use client"

import { useState } from "react"
import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { MAX_RUN_REQUEST_CHARS } from "../../constants"
import { useTriggerRoutineRun } from "../../hooks/useRoutineRuns"

/** "Executar agora": diálogo com a "Solicitação desta execução" opcional. */
export function RunNowDialog({ agentId, disabledReason }: { agentId: string; disabledReason: string | null }) {
    const [open, setOpen] = useState(false)
    const [request, setRequest] = useState("")
    const trigger = useTriggerRoutineRun(agentId)
    return (
        <>
            <Button type="button" size="sm" className="h-9 gap-1.5" disabled={Boolean(disabledReason)} title={disabledReason ?? undefined} onClick={() => setOpen(true)}>
                <Play className="h-4 w-4" aria-hidden /> Executar agora
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Executar agora</DialogTitle>
                        <DialogDescription>A execução entra na fila do agente (ou começa na hora, se houver vaga).</DialogDescription>
                    </DialogHeader>
                    <Field id="routine-run-request" label="Solicitação desta execução (opcional)">
                        <Textarea id="routine-run-request" rows={4} maxLength={MAX_RUN_REQUEST_CHARS} value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Ex.: só as vagas publicadas hoje" />
                    </Field>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            disabled={trigger.isPending}
                            onClick={() =>
                                trigger.mutate(request, {
                                    onSuccess: () => {
                                        setOpen(false)
                                        setRequest("")
                                    },
                                })
                            }
                        >
                            Executar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
