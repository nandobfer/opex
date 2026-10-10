"use client"

import { Wand2 } from "lucide-react"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { useRefinementRealtime, useTaskRefinement } from "../hooks/useRefinement"

/**
 * Botão de ícone "Refinar tarefa" da página da tarefa. Abre a aba "Especificação técnica" (onde o
 * refinamento acontece, com a saída do agente e as perguntas) pelo callback `onOpen`; indisponível
 * fica bloqueado com o motivo na dica (feature desativada, OpenCode desconectado ou sem central).
 */
export function RefineTaskButton({ taskId, label = "Refinar tarefa", onOpen }: { taskId: string; label?: string; onOpen?: () => void }) {
    useRefinementRealtime(taskId)
    const query = useTaskRefinement(taskId)
    const availability = query.data?.availability
    const reason = query.isError ? "Não foi possível verificar o refinamento" : availability && !availability.available ? availability.reason : null
    const disabledReason = availability?.available ? null : (reason ?? "Verificando a configuração de IA…")

    return (
        <TooltipIconButton label={label} disabledReason={disabledReason} onClick={() => onOpen?.()}>
            <Wand2 className="text-primary" aria-hidden />
        </TooltipIconButton>
    )
}
