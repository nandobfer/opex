"use client"

import type { ReactNode } from "react"
import { MoreHorizontal, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

export interface ResourceRowAction {
    key: string
    label: string
    icon: LucideIcon
    onSelect: () => void
    /** Ação destrutiva: vai depois de um separador, em vermelho. */
    destructive?: boolean
}

interface ResourceRowFrameProps {
    name: string
    enabled: boolean
    /** Selos ao lado do nome (origem, situação, versão, marcas). */
    badges?: ReactNode
    description?: string | null
    /** Linhas extras abaixo da descrição (ex.: erro). */
    extra?: ReactNode
    switchDisabled?: boolean
    onToggle: (enabled: boolean) => void
    actions: readonly ResourceRowAction[]
    menuDisabled?: boolean
}

/** Linha de recurso (OPE-153, extraída da aba do OpenCode): nome, selos, descrição, liga/desliga e menu de ações. */
export function ResourceRowFrame({ name, enabled, badges, description, extra, switchDisabled, onToggle, actions, menuDisabled }: ResourceRowFrameProps) {
    const regular = actions.filter((action) => !action.destructive)
    const destructive = actions.filter((action) => action.destructive)
    return (
        <div className={cn("flex items-start gap-3 px-4 py-3 transition-colors", !enabled && "opacity-70")}>
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-sm font-medium text-foreground">{name}</span>
                    {badges}
                </div>
                {description ? <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p> : null}
                {extra}
            </div>
            <div className="flex shrink-0 items-center gap-1">
                <Switch checked={enabled} disabled={switchDisabled} onCheckedChange={onToggle} aria-label={enabled ? `Desligar ${name}` : `Ligar ${name}`} />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Ações de ${name}`} disabled={menuDisabled || actions.length === 0}>
                            <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {regular.map(({ key, label, icon: Icon, onSelect }) => (
                            <DropdownMenuItem key={key} onSelect={onSelect}>
                                <Icon className="mr-2 h-4 w-4" aria-hidden /> {label}
                            </DropdownMenuItem>
                        ))}
                        {destructive.length ? (
                            <>
                                {regular.length ? <DropdownMenuSeparator /> : null}
                                {destructive.map(({ key, label, icon: Icon, onSelect }) => (
                                    <DropdownMenuItem key={key} className="text-destructive focus:text-destructive" onSelect={onSelect}>
                                        <Icon className="mr-2 h-4 w-4" aria-hidden /> {label}
                                    </DropdownMenuItem>
                                ))}
                            </>
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}

/** Versão instalada → disponível (amarela quando há atualização). */
export function ResourceVersionText({ installed, available, outdated }: { installed: string | null; available: string | null; outdated: boolean }) {
    return (
        <span className={cn("font-mono text-[11px]", outdated ? "text-warning" : "text-muted-foreground")} title="Instalada → disponível">
            {installed ?? "última"}
            {available && available !== installed ? ` → ${available}` : ""}
        </span>
    )
}
