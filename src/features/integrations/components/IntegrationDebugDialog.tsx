"use client"

import { DialogClose, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { getIntegrationDef, type IntegrationId } from "@/lib/integrations/catalog"
import { DebugConsoleCloseButton } from "./DebugConsoleCloseButton"
import { DebugLogsDialog } from "./DebugLogsDialog"
import { IntegrationDebugConsole } from "./IntegrationDebugConsole"

interface IntegrationDebugDialogProps {
    integrationId: IntegrationId | null
    onOpenChange: (open: boolean) => void
}

/**
 * Barra: título à esquerda; "Tempo real" → Testar → Atualizar → Fechar à direita, no mesmo
 * alinhamento (modal compartilhado `DebugLogsDialog`). Sem Maximizar (só no formulário da integração).
 */
export function IntegrationDebugDialog({ integrationId, onOpenChange }: IntegrationDebugDialogProps) {
    return (
        <DebugLogsDialog openKey={integrationId} onOpenChange={onOpenChange}>
            {integrationId && (
                <IntegrationDebugConsole
                    integrationId={integrationId}
                    consoleClassName="h-[60vh]"
                    title={<DialogTitle>Logs — {getIntegrationDef(integrationId).name}</DialogTitle>}
                    description={<DialogDescription>Chamadas, eventos e etapas da integração, iguais aos do console do servidor.</DialogDescription>}
                    actions={
                        <DialogClose asChild>
                            <DebugConsoleCloseButton />
                        </DialogClose>
                    }
                />
            )}
        </DebugLogsDialog>
    )
}
