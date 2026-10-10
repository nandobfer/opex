"use client"

import { useState } from "react"
import { AlignLeft } from "lucide-react"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { useAiFeatureRealtime, useTaskSummarySettings } from "../../hooks/useAi"
import { TaskSummaryDialog } from "./TaskSummaryDialog"

/**
 * Botão de ícone "Gerar resumo" da página da tarefa, com o rótulo na dica; indisponível fica
 * bloqueado com o motivo na dica.
 */
export function TaskSummaryButton({ taskId, taskCode, label = "Gerar resumo" }: { taskId: string; taskCode: string; label?: string }) {
    useAiFeatureRealtime()
    const settings = useTaskSummarySettings()
    const [open, setOpen] = useState(false)
    const availability = settings.data?.availability
    const reason = settings.isError ? "Não foi possível verificar a configuração de IA" : availability && !availability.available ? availability.reason : null
    const disabledReason = availability?.available ? null : (reason ?? "Verificando a configuração de IA…")

    return (
        <>
            <TooltipIconButton label={label} disabledReason={disabledReason} onClick={() => setOpen(true)}>
                <AlignLeft className="text-primary" aria-hidden />
            </TooltipIconButton>
            <TaskSummaryDialog open={open} onOpenChange={setOpen} taskId={taskId} taskCode={taskCode} />
        </>
    )
}
