"use client"

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useDeleteWorkbench } from "../../hooks/useAgentic"
import type { CentralDto, WorkbenchDto } from "../../types"

/** Confirmação de "Excluir mesa" (botão do cabeçalho no desktop e item da folha "Mais ações" no celular). */
export function DeleteWorkbenchDialog({ workbench, central, open, onOpenChange }: { workbench: WorkbenchDto; central: CentralDto; open: boolean; onOpenChange: (open: boolean) => void }) {
    const remove = useDeleteWorkbench()
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Excluir a mesa de {workbench.taskCode}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Excluir limpa o ambiente da mesa antes de apagá-la: containers da prévia, backup do MongoDB, worktree e branch local, conforme as configurações da central de {central.projectName}. A sessão do OpenCode é excluída. O Pull Request e a branch remota não são tocados. Se a limpeza não puder começar, a mesa permanece para tentar novamente.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate(workbench)}>Excluir mesa</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
