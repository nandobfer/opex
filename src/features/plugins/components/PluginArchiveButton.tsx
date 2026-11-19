"use client"

import { useState } from "react"
import { Archive, ArchiveRestore } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useSetPluginArchived } from "../hooks/usePlugins"

/**
 * Arquivar/Desarquivar um plugin (OPE-172), no cabeçalho da página dele, com confirmação: arquivar
 * desliga o plugin e o tira das telas; desarquivar o traz de volta desligado. Nada é apagado.
 */
export function PluginArchiveButton({ pluginId, pluginName, archived }: { pluginId: string; pluginName: string; archived: boolean }) {
    const mutation = useSetPluginArchived(pluginId)
    const [confirm, setConfirm] = useState(false)
    const label = archived ? "Desarquivar" : "Arquivar"
    const Icon = archived ? ArchiveRestore : Archive
    return (
        <>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`${label} ${pluginName}`} disabled={mutation.isPending} onClick={() => setConfirm(true)}>
                            <Icon className="h-4 w-4" aria-hidden />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <ConfirmDialog
                open={confirm}
                onOpenChange={setConfirm}
                title={`${label} ${pluginName}?`}
                description={
                    archived
                        ? "O plugin volta para a lista desligado; ligue-o quando quiser. As versões continuam as mesmas."
                        : "O plugin é desligado e sai das telas (e, no dono, do servidor). Versões, logs e dados ficam guardados e você pode desarquivar depois."
                }
                confirmLabel={label}
                variant={archived ? "default" : "destructive"}
                pending={mutation.isPending}
                onConfirm={() => {
                    setConfirm(false)
                    mutation.mutate(!archived)
                }}
            />
        </>
    )
}
