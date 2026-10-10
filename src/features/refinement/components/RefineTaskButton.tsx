"use client"

import { useState } from "react"
import { Wand2 } from "lucide-react"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { useRefinementRealtime, useTaskRefinement } from "../hooks/useRefinement"
import { RefineTaskDialog } from "./RefineTaskDialog"

/**
 * Botão de ícone "Refinar tarefa" da página da tarefa, com o rótulo na dica; indisponível fica
 * bloqueado com o motivo na dica (feature desativada, OpenCode desconectado ou sem central).
 */
export function RefineTaskButton({ taskId, taskCode, label = "Refinar tarefa" }: { taskId: string; taskCode: string; label?: string }) {
    useRefinementRealtime(taskId)
    const query = useTaskRefinement(taskId)
    const [open, setOpen] = useState(false)
    const availability = query.data?.availability
    const reason = query.isError ? "Não foi possível verificar o refinamento" : availability && !availability.available ? availability.reason : null
    const disabledReason = availability?.available ? null : (reason ?? "Verificando a configuração de IA…")

    return (
        <>
            <TooltipIconButton label={label} disabledReason={disabledReason} onClick={() => setOpen(true)}>
                <Wand2 className="text-primary" aria-hidden />
            </TooltipIconButton>
            <RefineTaskDialog open={open} onOpenChange={setOpen} taskId={taskId} taskCode={taskCode} />
        </>
    )
}
