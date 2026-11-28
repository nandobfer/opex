"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AGENTIC_CENTRALS_HREF } from "./steps-meta"

/** Cabeçalho das páginas do bootstrap: volta às centrais, título, subtítulo e ações. */
export function BootstrapPageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
    return (
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 space-y-1">
                <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                    <Link href={AGENTIC_CENTRALS_HREF}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Centrais de desenvolvimento
                    </Link>
                </Button>
                <h1 className="text-xl font-semibold md:text-2xl">{title}</h1>
                {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    )
}
