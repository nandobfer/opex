import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, Settings2, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AgentPageHeaderProps {
    icon: LucideIcon
    title: string
    description: string
    /** Atalho "Configurar" (aba do agente em Integrações › Inteligência Artificial). */
    settingsHref?: string
    /** "Configurar" sem navegar (ex.: abre o editor na própria página); vence o `settingsHref`. */
    onSettings?: () => void
    /** Ações extras à direita do "Configurar" (ex.: "Revisar PR"). */
    children?: ReactNode
    /** Seta de voltar antes do ícone (ex.: a página de um agente rotineiro volta para a lista, OPE-160). */
    backHref?: string
    /** Rótulo acessível da seta de voltar. */
    backLabel?: string
}

/**
 * Cabeçalho das páginas dos agentes: ícone, título e, na mesma linha do título, "Configurar" e as ações
 * (sempre juntas, sem quebrar entre si); a descrição fica abaixo, na largura inteira. As ações têm
 * margem vertical negativa para a linha do título manter a altura do texto: a distância entre o título
 * e a descrição é a mesma com ou sem botões (OPE-130, D19).
 */
export function AgentPageHeader({ icon: Icon, title, description, settingsHref, onSettings, children, backHref, backLabel = "Voltar" }: AgentPageHeaderProps) {
    const settingsLabel = (
        <>
            <Settings2 className="h-4 w-4" aria-hidden /> Configurar
        </>
    )
    return (
        <header className="flex items-center gap-3">
            {backHref && (
                <Button asChild variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground">
                    <Link href={backHref} aria-label={backLabel} title={backLabel} data-testid="agent-page-back">
                        <ArrowLeft className="h-5 w-5" aria-hidden />
                    </Link>
                </Button>
            )}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <h1 className="min-w-0 text-lg font-semibold md:text-2xl">{title}</h1>
                    <div className="-my-1 flex shrink-0 flex-nowrap items-center gap-2 md:-my-0.5" data-testid="agent-page-actions">
                        {onSettings ? (
                            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={onSettings}>
                                {settingsLabel}
                            </Button>
                        ) : settingsHref ? (
                            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
                                <Link href={settingsHref}>{settingsLabel}</Link>
                            </Button>
                        ) : null}
                        {children}
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
        </header>
    )
}
