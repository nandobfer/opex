"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { getIntegrationDef, type IntegrationId } from "@/lib/integrations/catalog"
import { dialogPanelMotion } from "@/components/motion/dialog-panel-motion"
import { DebugConsoleCloseButton } from "./DebugConsoleCloseButton"
import { isSearchEscape } from "./DebugSearchBar"
import { IntegrationDebugConsole } from "./IntegrationDebugConsole"

interface IntegrationDebugDialogProps {
    integrationId: IntegrationId | null
    onOpenChange: (open: boolean) => void
}

/**
 * Barra: título à esquerda; "Tempo real" → Testar → Atualizar → Fechar à direita, no mesmo
 * alinhamento. O X absoluto do `DialogContent` do core (sempre o último filho) é ocultado só
 * aqui, e o Fechar próprio entra na barra via `DialogClose` — sem alterar o core.
 *
 * Sem Maximizar (só no formulário da integração). Esc: com texto na busca, limpa a busca; senão, fecha.
 */
export function IntegrationDebugDialog({ integrationId, onOpenChange }: IntegrationDebugDialogProps) {
    return (
        <Dialog open={integrationId !== null} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-5xl overflow-hidden p-0 [&>button:last-child]:hidden"
                onEscapeKeyDown={(event) => {
                    // Esse Esc é da busca (limpar o campo), não do modal.
                    if (isSearchEscape(event)) event.preventDefault()
                }}
            >
                <AnimatePresence mode="wait">
                    {integrationId && (
                        <motion.div key={integrationId} {...dialogPanelMotion} className="p-6">
                            <IntegrationDebugConsole
                                integrationId={integrationId}
                                consoleClassName="h-[60vh]"
                                title={<DialogTitle>Logs — {getIntegrationDef(integrationId).name}</DialogTitle>}
                                description={
                                    <DialogDescription>
                                        Chamadas, eventos e etapas da integração, iguais aos do console do servidor.
                                    </DialogDescription>
                                }
                                actions={
                                    <DialogClose asChild>
                                        <DebugConsoleCloseButton />
                                    </DialogClose>
                                }
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    )
}
