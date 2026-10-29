"use client"

import { Loader2, Save, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SettingsActionsProps {
    dirty: boolean
    /** Configuração ainda não salva (padrões): Salvar fica disponível mesmo sem alterações. */
    isDefault: boolean
    saving: boolean
    onUndo: () => void
    onSave: () => void
}

/** Desfazer/Salvar da configuração geral do desenvolvimento agêntico (subabas que editam o formulário). */
export function SettingsActions({ dirty, isDefault, saving, onUndo, onSave }: SettingsActionsProps) {
    return (
        <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || saving} onClick={onUndo}>
                <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
            </Button>
            <Button type="button" className="gap-1.5" disabled={(!dirty && !isDefault) || saving} onClick={onSave}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                Salvar
            </Button>
        </div>
    )
}
