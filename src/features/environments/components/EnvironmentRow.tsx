"use client"

import Link from "next/link"
import { GitBranch } from "lucide-react"
import { cn } from "@/lib/utils"
import type { EnvironmentDto } from "../types"
import { EnvironmentStatusBadge } from "./EnvironmentStatusBadge"

/** Linha de um ambiente na lista do painel lateral (mesmo padrão das tarefas da Central de desenvolvimento). */
export function EnvironmentRow({ environment, href, active }: { environment: EnvironmentDto; href: string; active: boolean }) {
    return (
        <Link
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("flex flex-col gap-1 rounded-md px-2.5 py-1.5 transition-colors", active ? "bg-primary/15" : "hover:bg-muted/50")}
        >
            <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">{environment.name}</span>
                {environment.activeOperationId && <EnvironmentStatusBadge label="Em operação" tone="primary" running />}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <GitBranch className="h-3 w-3 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{environment.branch}</span>
                {environment.dbVersion && <span className="shrink-0" title="Versão do banco registrada no Opex">banco {environment.dbVersion}</span>}
            </span>
        </Link>
    )
}
