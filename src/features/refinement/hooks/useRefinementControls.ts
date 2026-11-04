"use client"

import { useAutoReconnect } from "@/features/agentic/hooks/useAutoReconnect"
import type { TaskRefinementDto } from "../types"
import { useRefinementAction, useRefinementReconnect } from "./useRefinement"

/**
 * Controles de execução do refinamento (Parar, Continuar, Recomeçar, Encerrar e Reconectar com o ciclo
 * automático), compartilhados pelo painel da página da tarefa e pela barra da mesa em "Refinando"
 * (OPE-137): as duas telas agem sobre o MESMO refinamento.
 */
export function useRefinementControls(taskId: string, refinement: TaskRefinementDto | null) {
    const action = useRefinementAction(taskId)
    const reconnect = useRefinementReconnect(taskId)
    const running = refinement?.runState === "running"
    const reconnectable = Boolean(refinement && refinement.sessionId && (refinement.runState === "failed" || refinement.runState === "interrupted"))
    // Ciclo automático de reconexão (mesmo comportamento da mesa): dispara ao oferecer Reconectar e
    // nunca depois de um Parar do usuário; um ciclo por episódio de queda.
    const autoReconnect = useAutoReconnect({
        eligible: reconnectable && !refinement?.stoppedByUser,
        episodeKey: `${refinement?.id ?? taskId}:${refinement?.turnStartedAt ?? ""}`,
        attempt: () => reconnect.mutateAsync().then((state) => (state.refinement?.runState === "running" ? "attached" : (state.refinement?.reconnect?.outcome ?? null)), () => null),
    })
    return { action, running, reconnectable, autoReconnect }
}
