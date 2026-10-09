"use client"

import { cn } from "@/lib/utils"

export function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "?"
    if (parts.length === 1) return parts[0]![0]!.toUpperCase()
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

interface SidebarFooterProps {
    collapsed: boolean
    /** Dono do app (uso pessoal, sem login): `APP_OWNER_NAME`. */
    ownerName: string
    version?: string
}

/** Rodapé do menu: o dono do app e a versão. */
export function SidebarFooter({ collapsed, ownerName, version }: SidebarFooterProps) {
    return (
        <div className="shrink-0 border-t border-sidebar-border p-2">
            <div className={cn("flex items-center gap-2.5 px-2 py-1.5", collapsed && "justify-center px-0")} title={collapsed ? ownerName : undefined}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/25 text-[11px] font-semibold text-sidebar-foreground ring-1 ring-primary/40" aria-hidden={!collapsed}>
                    {initials(ownerName)}
                </span>
                {!collapsed && (
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs font-semibold">{ownerName}</span>
                        {version && <span className="truncate text-[11px] opacity-70">v{version}</span>}
                    </span>
                )}
            </div>
        </div>
    )
}
