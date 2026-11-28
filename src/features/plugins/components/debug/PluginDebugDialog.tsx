"use client"

import { DialogClose, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DebugConsoleCloseButton } from "@nandobfer/integracoes/react"
import { DebugLogsDialog } from "@nandobfer/integracoes/react"
import { PluginDebugConsole } from "./PluginDebugConsole"

/** Modal de logs de um plugin (lista de `/plugins`), igual ao da lista de integrações. */
export function PluginDebugDialog({ plugin, onOpenChange }: { plugin: { id: string; name: string } | null; onOpenChange: (open: boolean) => void }) {
    return (
        <DebugLogsDialog openKey={plugin?.id ?? null} onOpenChange={onOpenChange}>
            {plugin && (
                <PluginDebugConsole
                    pluginId={plugin.id}
                    consoleClassName="h-[60vh]"
                    title={<DialogTitle>Logs — {plugin.name}</DialogTitle>}
                    description={<DialogDescription>Ativação, rotas, crons, ferramentas, `ctx.log` e erros de interface do plugin.</DialogDescription>}
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
