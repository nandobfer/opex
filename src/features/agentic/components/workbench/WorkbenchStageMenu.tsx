"use client"

import { useState } from "react"
import { CheckCircle2, ListTree, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { ManualStage } from "../../constants"
import type { WorkbenchDto } from "../../types"
import { SetStageDialog } from "./SetStageDialog"

/** Menu do cabeçalho da mesa: "Concluir mesa…" (sem PR) e "Definir etapa…". Oculto em mesa concluída ou em exclusão. */
export function WorkbenchStageMenu({ workbench }: { workbench: WorkbenchDto }) {
    const [dialog, setDialog] = useState<ManualStage | null>(null)
    const [lastStage, setLastStage] = useState<ManualStage>("done")
    if (workbench.stage === "done" || workbench.deletionRequestedAt) return null
    const openWith = (stage: ManualStage) => {
        setLastStage(stage)
        setDialog(stage)
    }
    const firstAvailable: ManualStage = workbench.plans.length > 0 && workbench.stage !== "plan_review" ? "plan_review" : "done"

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais ações da mesa">
                        <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => openWith("done")}>
                        <CheckCircle2 className="h-4 w-4" aria-hidden /> Concluir mesa…
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openWith(firstAvailable)}>
                        <ListTree className="h-4 w-4" aria-hidden /> Definir etapa…
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <SetStageDialog workbench={workbench} open={dialog !== null} initialStage={dialog ?? lastStage} onOpenChange={(open) => !open && setDialog(null)} />
        </>
    )
}
