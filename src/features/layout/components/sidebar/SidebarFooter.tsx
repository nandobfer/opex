"use client"

import { cn } from "@/lib/utils"
import { LogoutButton } from "@/features/auth/components/LogoutButton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SIDEBAR_FOCUS_RING } from "./sidebar-styles"

export function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "?"
    if (parts.length === 1) return parts[0]![0]!.toUpperCase()
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

interface SidebarFooterProps {
    collapsed: boolean
    /** Dono do app (uso pessoal): `APP_OWNER_NAME`. */
    ownerName: string
    version?: string
}

/**
 * Rodapé do menu. No desktop (recolhido) mostra só o avatar do dono, que abre um popover com a ação
 * **Sair** (`LogoutButton`, de `src/features/auth/`). Na gaveta (mobile, expandida) mantém o dono, a
 * versão e a ação "Sair" inline, como antes.
 */
export function SidebarFooter({ collapsed, ownerName, version }: SidebarFooterProps) {
    if (collapsed) {
        return (
            <div className="flex shrink-0 justify-center border-t border-sidebar-border p-2">
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            aria-label={ownerName}
                            title={ownerName}
                            className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-full bg-primary/25 text-[11px] font-semibold text-sidebar-foreground ring-1 ring-primary/40 transition-colors hover:bg-primary/40",
                                SIDEBAR_FOCUS_RING,
                            )}
                        >
                            {initials(ownerName)}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent side="right" align="start" className="w-56 p-1">
                        <div className="px-2 py-1.5">
                            <p className="truncate text-sm font-semibold">{ownerName}</p>
                        </div>
                        <LogoutButton />
                    </PopoverContent>
                </Popover>
            </div>
        )
    }

    return (
        <div className="shrink-0 border-t border-sidebar-border p-2">
            <div className="flex items-center gap-2.5 px-2 py-1.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/25 text-[11px] font-semibold text-sidebar-foreground ring-1 ring-primary/40" aria-hidden>
                    {initials(ownerName)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs font-semibold">{ownerName}</span>
                    {version && <span className="truncate text-[11px] opacity-70">v{version}</span>}
                </span>
            </div>
            <LogoutButton className="mt-1" />
        </div>
    )
}
