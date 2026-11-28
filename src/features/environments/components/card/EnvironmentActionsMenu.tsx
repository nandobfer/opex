"use client"

import { MoreHorizontal, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export interface EnvironmentMenuAction {
    key: string
    label: string
    icon: LucideIcon
    onSelect: () => void
    disabled?: boolean
    /** Por que está desligado (aparece abaixo do rótulo). */
    reason?: string | null
    /** Ação destrutiva: depois de um separador, em vermelho. */
    destructive?: boolean
    /** Começa um grupo novo (separador antes). */
    group?: boolean
}

/** Menu "⋯" das ações do card de ambiente (dono e portal). */
export function EnvironmentActionsMenu({ name, actions, disabled }: { name: string; actions: readonly EnvironmentMenuAction[]; disabled?: boolean }) {
    const regular = actions.filter((action) => !action.destructive)
    const destructive = actions.filter((action) => action.destructive)
    const item = ({ key, label, icon: Icon, onSelect, disabled: off, reason, destructive: danger }: EnvironmentMenuAction) => (
        <DropdownMenuItem key={key} disabled={off} className={danger ? "text-destructive focus:text-destructive" : undefined} onSelect={onSelect}>
            <Icon className="mr-2 h-4 w-4 shrink-0" aria-hidden />
            <span className="flex min-w-0 flex-col">
                <span>{label}</span>
                {off && reason ? <span className="text-[11px] text-muted-foreground">{reason}</span> : null}
            </span>
        </DropdownMenuItem>
    )
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Mais ações de ${name}`} title="Mais ações" disabled={disabled || actions.length === 0}>
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
                {regular.map((action, index) => (
                    <div key={action.key}>
                        {action.group && index > 0 ? <DropdownMenuSeparator /> : null}
                        {item(action)}
                    </div>
                ))}
                {destructive.length ? (
                    <>
                        {regular.length ? <DropdownMenuSeparator /> : null}
                        {destructive.map(item)}
                    </>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
