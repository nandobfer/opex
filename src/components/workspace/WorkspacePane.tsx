"use client"

import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface WorkspacePaneProps {
    /** Título do painel (ex.: "Tarefas", "Ambientes"). */
    title: string
    /** Contador discreto ao lado do título. */
    count?: number
    /** Ações da linha do título, à direita (ex.: atalho de configuração). */
    actions?: ReactNode
    /** Controles abaixo do título (seletor de escopo, filtros, busca), antes do corpo. */
    header?: ReactNode
    /** Corpo do painel: lista ou estados de carregamento/vazio/erro. */
    children: ReactNode
    ariaLabel: string
    testId?: string
    className?: string
}

/**
 * Painel lateral da casca de duas colunas (`WorkspaceShell`): título com contador, ações à direita,
 * separador e os controles; o corpo ocupa o restante. Largura fixa a partir de `lg`; no celular o
 * painel ocupa a coluna inteira. Classe extra para a tela controlar visibilidade/altura no celular.
 */
export function WorkspacePane({ title, count, actions, header, children, ariaLabel, testId, className }: WorkspacePaneProps) {
    return (
        <Card
            role="region"
            aria-label={ariaLabel}
            data-testid={testId}
            className={cn("flex min-h-[420px] w-full flex-col overflow-hidden lg:min-h-0 lg:w-[340px] lg:shrink-0", className)}
        >
            <div className="space-y-2 border-b p-3">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">
                        {title}
                        {count !== undefined && <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{count}</span>}
                    </h2>
                    {actions}
                </div>
                <div role="separator" aria-hidden className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
                {header}
            </div>
            {children}
        </Card>
    )
}
