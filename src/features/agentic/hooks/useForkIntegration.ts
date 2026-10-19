"use client"

import { useState } from "react"
import type { ForkIntegrationTarget } from "../constants"
import { forkActions, forkIntegrationTargets, type ForkParentView } from "../fork-logic"
import type { ForkDto, WorkbenchDto } from "../types"
import { useForkAction } from "./useForks"

/**
 * Estado da integração do fork, compartilhado entre o corpo (resumo, destino e ajuste, no fim da
 * conversa) e os botões (na barra inferior do fork).
 */
export function useForkIntegration(workbench: WorkbenchDto, fork: ForkDto, parent: ForkParentView | null) {
    const mutation = useForkAction(workbench.id, fork)
    const targets = forkIntegrationTargets({ stage: workbench.stage, runState: workbench.runState, sessionId: workbench.sessionId, waitingSlot: Boolean(workbench.slotQueue) }, parent)
    const firstAvailable = targets.find((item) => item.available)?.target ?? "context"
    const [chosen, setChosen] = useState<ForkIntegrationTarget | null>(null)
    const target = chosen && targets.find((item) => item.target === chosen)?.available ? chosen : firstAvailable
    const option = targets.find((item) => item.target === target)!
    const [editing, setEditing] = useState(false)
    const [request, setRequest] = useState("")
    const [confirmReopen, setConfirmReopen] = useState(false)
    const actions = forkActions(fork.status, fork.runState, Boolean(fork.summary))

    return {
        targets,
        target,
        option,
        setTarget: setChosen,
        editing,
        startEditing: () => setEditing(true),
        stopEditing: () => setEditing(false),
        request,
        setRequest,
        confirmReopen,
        setConfirmReopen,
        actions,
        pending: mutation.isPending,
        running: fork.runState === "running",
        apply: () => mutation.mutate({ action: "apply", target }),
        cancel: () => mutation.mutate({ action: "cancel-integration" }),
        revise: () =>
            mutation.mutate(
                { action: "revise-summary", text: request.trim() },
                {
                    onSuccess: () => {
                        setEditing(false)
                        setRequest("")
                    },
                },
            ),
    }
}

export type ForkIntegrationState = ReturnType<typeof useForkIntegration>
