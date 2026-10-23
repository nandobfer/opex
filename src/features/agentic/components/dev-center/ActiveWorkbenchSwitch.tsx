"use client"

import { Switch } from "@/components/ui/switch"

interface ActiveWorkbenchSwitchProps {
    checked: boolean
    onChange: (checked: boolean) => void
}

const ID = "dev-center-active-only"

/** Chave "Só mesas ativas" da lista de tarefas da central (primeiro filtro, na linha inteira). */
export function ActiveWorkbenchSwitch({ checked, onChange }: ActiveWorkbenchSwitchProps) {
    return (
        <div className="flex w-full items-center justify-between gap-3 rounded-md border border-input px-3 py-1.5">
            <label htmlFor={ID} className="cursor-pointer text-sm">
                Só mesas ativas
                <span className="block text-[11px] text-muted-foreground">Com mesa aberta e não concluída</span>
            </label>
            <Switch id={ID} checked={checked} onCheckedChange={onChange} />
        </div>
    )
}
