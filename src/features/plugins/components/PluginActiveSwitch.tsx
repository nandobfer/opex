"use client"

import { useState } from "react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Switch } from "@/components/ui/switch"
import { useSetPluginActive } from "../hooks/usePlugins"

/**
 * Switch "Ativo" de um plugin (lista e detalhe): ligar é imediato; desligar pede confirmação, porque o
 * plugin sai das telas na hora. Resposta otimista com reversão (`useSetPluginActive`).
 */
export function PluginActiveSwitch({ pluginId, pluginName, active, showLabel = false }: { pluginId: string; pluginName: string; active: boolean; showLabel?: boolean }) {
    const mutation = useSetPluginActive(pluginId)
    const [confirmOff, setConfirmOff] = useState(false)
    const id = `plugin-active-${pluginId}`
    return (
        <div className="flex items-center gap-2">
            {showLabel ? (
                <label htmlFor={id} className="text-xs text-muted-foreground">
                    Ativo
                </label>
            ) : null}
            <Switch id={id} aria-label={`${active ? "Desativar" : "Ativar"} ${pluginName}`} checked={active} disabled={mutation.isPending} onCheckedChange={(checked) => (checked ? mutation.mutate(true) : setConfirmOff(true))} />
            <ConfirmDialog
                open={confirmOff}
                onOpenChange={setConfirmOff}
                title={`Desativar ${pluginName}?`}
                description="O plugin sai das telas na hora e, no dono, as rotas, ferramentas e crons dele são desfeitos. Você pode reativar depois."
                confirmLabel="Desativar"
                variant="destructive"
                pending={mutation.isPending}
                onConfirm={() => {
                    setConfirmOff(false)
                    mutation.mutate(false)
                }}
            />
        </div>
    )
}
