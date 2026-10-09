"use client"

import type { ReactNode } from "react"
import { Construction } from "lucide-react"
import { cn } from "@/lib/utils"

interface InDevelopmentProps {
    title: string
    /** Por que ainda não existe (ex.: "Depende da integração Go! Sipal"). */
    dependency?: string
    className?: string
    children?: ReactNode
}

/**
 * Bloco "Em desenvolvimento": recurso fora do escopo atual. Nunca contém dados simulados nem
 * controles que pareçam funcionar.
 */
export function InDevelopment({ title, dependency, className, children }: InDevelopmentProps) {
    return (
        <div
            className={cn("flex items-start gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4", className)}
            aria-disabled="true"
        >
            <Construction className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{title}</p>
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning ring-1 ring-warning/30">
                        Em desenvolvimento
                    </span>
                </div>
                {dependency && <p className="text-xs text-muted-foreground">{dependency}</p>}
                {children}
            </div>
        </div>
    )
}
