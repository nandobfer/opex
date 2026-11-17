"use client"

import { useState } from "react"
import { AnimatePresence } from "framer-motion"
import { LiveMessageComposer } from "@/features/agentic/components/workbench/LiveMessageComposer"
import { useSendRefinementMessage } from "../hooks/useRefinement"
import type { TaskRefinementDto } from "../types"

/**
 * Chat durante a execução no refinamento: com o agente refinando (fora da consolidação final) e a
 * opção ligada, a mensagem entra no turno em andamento. `compact`: mesa no celular (`< lg`, OPE-166).
 */
export function RefinementLiveMessage({ taskId, refinement, compact = false }: { taskId: string; refinement: TaskRefinementDto; compact?: boolean }) {
    const [text, setText] = useState("")
    const send = useSendRefinementMessage(taskId)
    const visible = refinement.liveChat && refinement.runState === "running" && !refinement.finalizing
    return (
        <AnimatePresence initial={false}>
            {visible && (
                <LiveMessageComposer key="refinement-live-message" id={`refinement-live-message-${refinement.id}`} value={text} onValueChange={setText} pending={send.isPending} compact={compact} onSubmit={(value) => send.mutate(value, { onSuccess: () => setText("") })} />
            )}
        </AnimatePresence>
    )
}
