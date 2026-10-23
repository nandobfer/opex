"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

/** Linha lógica clicada no `Markdown` (números do texto-fonte, 1 = primeira). */
export interface MarkdownLineContext {
    line: number
    endLine: number
    /** Texto para citar: sem marcadores de bloco (linha de código fica como está). */
    text: string
    /** A linha é de um bloco de código. */
    code: boolean
}

/**
 * Ação opcional no fim de cada linha lógica do `Markdown`: botão que aparece no hover/foco (e fica
 * fixo quando há badge). `renderPopover` abre um popover no botão; senão o clique chama `onSelect`.
 */
export interface MarkdownLineAction {
    icon: LucideIcon
    /** Nome acessível do botão (pt-BR). */
    label: string
    /** Badge numérico da linha (0 esconde). */
    count?: (line: number) => number
    onSelect?: (context: MarkdownLineContext) => void
    renderPopover?: (context: MarkdownLineContext & { close: () => void }) => ReactNode
    /** Prefixo do `data-md-anchor` (`{anchorId}:{linha}`), usado para rolar até a linha. */
    anchorId?: string
    /** Destaca a linha com um flash (troque `key` para repetir). */
    flash?: { line: number; key: number } | null
}

/**
 * Ação herdada pelos `Markdown` da subárvore (ex.: citar a linha no campo do agente em todas as
 * mensagens da timeline). A prop `lineAction` do componente tem precedência; `null` desliga.
 */
export const MarkdownLineActionContext = createContext<MarkdownLineAction | null>(null)

export function MarkdownLineActionProvider({ action, children }: { action: MarkdownLineAction | null; children: ReactNode }) {
    return <MarkdownLineActionContext.Provider value={action}>{children}</MarkdownLineActionContext.Provider>
}

export const useInheritedLineAction = () => useContext(MarkdownLineActionContext)
