"use client"

import { useState } from "react"
import { CheckCircle2, ListTree, Trash2 } from "lucide-react"
import type { ManualStage } from "../../constants"
import type { CentralDto, WorkbenchDto } from "../../types"
import { DeleteWorkbenchDialog } from "./DeleteWorkbenchDialog"
import { SetStageDialog } from "./SetStageDialog"
import { ActionSheetItem, ActionSheetSection } from "./mobile/ActionSheet"

/** "Concluir mesa…" e "Definir etapa…" existem fora de Concluída e da exclusão (mesma regra do menu do cabeçalho). */
export const stageMenuAvailable = (workbench: WorkbenchDto) => workbench.stage !== "done" && !workbench.deletionRequestedAt

/** Etapa sugerida em "Definir etapa…": a revisão do plano quando há plano e a mesa está em outra etapa. */
export const firstManualStage = (workbench: WorkbenchDto): ManualStage => (workbench.plans.length > 0 && workbench.stage !== "plan_review" ? "plan_review" : "done")

export type ManageDialog = { kind: "stage"; stage: ManualStage } | { kind: "delete" }

/**
 * Itens "Mesa" da folha "Mais ações" do celular: Concluir mesa…, Definir etapa… e Excluir mesa. `canDelete`:
 * a confirmação de excluir precisa da central (sem ela o item não aparece, em vez de fechar a folha sem abrir nada).
 */
export function WorkbenchManageItems({ workbench, canDelete, onPick }: { workbench: WorkbenchDto; canDelete: boolean; onPick: (dialog: ManageDialog) => void }) {
    const stageMenu = stageMenuAvailable(workbench)
    const deletable = canDelete && !workbench.deletionRequestedAt
    if (!stageMenu && !deletable) return null
    return (
        <ActionSheetSection title="Mesa">
            {stageMenu && (
                <>
                    <ActionSheetItem icon={CheckCircle2} label="Concluir mesa…" hint="Conclui sem PR" onSelect={() => onPick({ kind: "stage", stage: "done" })} />
                    <ActionSheetItem icon={ListTree} label="Definir etapa…" hint="Leva a mesa a uma etapa manualmente" onSelect={() => onPick({ kind: "stage", stage: firstManualStage(workbench) })} />
                </>
            )}
            {deletable && <ActionSheetItem icon={Trash2} label="Excluir mesa" hint="Limpa o ambiente e apaga a mesa (pede confirmação)" destructive onSelect={() => onPick({ kind: "delete" })} />}
        </ActionSheetSection>
    )
}

/**
 * Diálogos dos itens "Mesa", montados fora da folha (a folha fecha ao escolher o item e o diálogo
 * continua aberto).
 */
export function WorkbenchManageDialogs({ workbench, central, dialog, onClose }: { workbench: WorkbenchDto; central: CentralDto | null; dialog: ManageDialog | null; onClose: () => void }) {
    // A última etapa escolhida fica no diálogo durante a animação de saída (o `SetStageDialog` reinicia o formulário ao abrir).
    const [lastStage, setLastStage] = useState<ManualStage>("done")
    const stage = dialog?.kind === "stage" ? dialog.stage : null
    if (stage && stage !== lastStage) setLastStage(stage)
    return (
        <>
            {stageMenuAvailable(workbench) && <SetStageDialog workbench={workbench} open={dialog?.kind === "stage"} initialStage={stage ?? lastStage} onOpenChange={(open) => !open && onClose()} />}
            {central && <DeleteWorkbenchDialog workbench={workbench} central={central} open={dialog?.kind === "delete"} onOpenChange={(open) => !open && onClose()} />}
        </>
    )
}
