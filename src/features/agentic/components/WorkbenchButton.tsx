"use client"

import { motion } from "framer-motion"
import { Bot } from "lucide-react"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { workbenchPath } from "../constants"
import { useCentrals, useWorkbenchByTask } from "../hooks/useAgentic"
import { WorkbenchStageBadge, workbenchToneClasses } from "./WorkbenchStageBadge"

const LABEL = "Mesa de trabalho"

/**
 * Botão de ícone da página da tarefa: abre a mesa de trabalho dela na Central de desenvolvimento. Com
 * mesa, o botão assume a cor da etapa e a dica mostra o chip da etapa.
 */
export function WorkbenchButton({ taskId, productId }: { taskId: string; productId: string | null }) {
    const centrals = useCentrals()
    const central = productId ? centrals.data?.find((item) => item.productId === productId) : undefined
    const workbench = useWorkbenchByTask(central ? taskId : null)

    if (!central) {
        const reason = centrals.isLoading ? "Carregando as centrais…" : "Nenhuma central de desenvolvimento para o produto desta tarefa"
        return (
            <TooltipIconButton label={LABEL} disabledReason={reason}>
                <Bot aria-hidden />
            </TooltipIconButton>
        )
    }

    const current = workbench.data
    return (
        <TooltipIconButton
            label={LABEL}
            href={workbenchPath(central.id, taskId)}
            className={current ? workbenchToneClasses(current.stage, current.runState).button : undefined}
            tooltip={
                current ? (
                    <span className="flex items-center gap-2">
                        {LABEL}
                        <WorkbenchStageBadge stage={current.stage} runState={current.runState} />
                    </span>
                ) : undefined
            }
        >
            <motion.span key={current ? `${current.stage}-${current.runState}` : "none"} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18 }} className="inline-flex">
                <Bot aria-hidden />
            </motion.span>
        </TooltipIconButton>
    )
}
