import type { ReactNode } from "react"
import Link from "next/link"
import { Settings2, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AgentPageHeaderProps {
    icon: LucideIcon
    title: string
    description: string
    /** Atalho "Configurar" (aba do agente em Integrações › Inteligência Artificial). */
    settingsHref: string
    /** Ações extras à direita do "Configurar" (ex.: "Revisar PR"). */
    children?: ReactNode
}

/** Cabeçalho das páginas dos agentes (Revisor, Adversário, Mentor): ícone, título, descrição e Configurar. */
export function AgentPageHeader({ icon: Icon, title, description, settingsHref, children }: AgentPageHeaderProps) {
    return (
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                    <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                    <h1 className="text-lg font-semibold md:text-2xl">{title}</h1>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
                    <Link href={settingsHref}>
                        <Settings2 className="h-4 w-4" aria-hidden /> Configurar
                    </Link>
                </Button>
                {children}
            </div>
        </header>
    )
}
