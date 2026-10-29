"use client"

import { useState } from "react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { ToggleCard } from "@/components/ui/toggle-card"
import { useDeleteEnvironment } from "../hooks/useEnvironments"
import type { EnvironmentDto } from "../types"

/** Confirmação de apagar, com a opção de apagar também os volumes. */
export function DeleteEnvironmentDialog({ env, onClose }: { env: EnvironmentDto | null; onClose: () => void }) {
    const remove = useDeleteEnvironment()
    const [volumes, setVolumes] = useState(false)
    return (
        <AlertDialog
            open={env !== null}
            onOpenChange={(open) => {
                if (!open) {
                    setVolumes(false)
                    onClose()
                }
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Apagar {env?.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        {env?.deployedOn ? "Os containers são derrubados" : "O ambiente nunca foi implantado"}
                        {env?.source.kind === "central" ? " e a pasta do código é removida." : "; os arquivos do projeto adotado ficam (só os gerados pelo opex saem)."}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {env?.deployedOn && <ToggleCard id="environment-delete-volumes" checked={volumes} onCheckedChange={setVolumes} label="Apagar também os volumes" description="Os dados guardados nos volumes do compose são perdidos" onLabel="Apagar" offLabel="Manter" />}
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => {
                            if (env) remove.mutate({ id: env.id, volumes })
                            setVolumes(false)
                            onClose()
                        }}
                    >
                        Apagar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
