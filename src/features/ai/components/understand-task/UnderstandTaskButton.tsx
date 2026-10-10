"use client"

import { useState } from "react"
import { Sparkles } from "lucide-react"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { useAiFeatureRealtime, useUnderstandTaskSettings } from "../../hooks/useAi"
import { UnderstandTaskDialog } from "./UnderstandTaskDialog"

/**
 * Botão de ícone "Entender tarefa" da página da tarefa, com o rótulo na dica; indisponível fica
 * bloqueado com o motivo na dica.
 */
export function UnderstandTaskButton({ taskId, taskCode, label = "Entender tarefa" }: { taskId: string; taskCode: string; label?: string }) {
    useAiFeatureRealtime()
    const settings = useUnderstandTaskSettings()
    const [open, setOpen] = useState(false)
    const availability = settings.data?.availability
    const reason = settings.isError ? "Não foi possível verificar a configuração de IA" : availability && !availability.available ? availability.reason : null
    const disabledReason = availability?.available ? null : (reason ?? "Verificando a configuração de IA…")

    return (
        <>
            <TooltipIconButton label={label} disabledReason={disabledReason} onClick={() => setOpen(true)}>
                <Sparkles className="text-primary" aria-hidden />
            </TooltipIconButton>
            <UnderstandTaskDialog open={open} onOpenChange={setOpen} taskId={taskId} title={`${label} ${taskCode}`} />
        </>
    )
}
