"use client"

import { useCallback, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Maximize2, Minimize2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { formatLogLine, type IntegrationLogLine } from "@/lib/integrations/log-format"
import type { DebugStreamMode } from "../hooks/useDebugLogStream"
import { DebugSearchBar } from "./DebugSearchBar"
import { IntegrationConsole, SEARCH_HIGHLIGHT_LIMIT, type ConsoleSearchResults, type IntegrationConsoleHandle, type SearchDirection } from "./IntegrationConsole"
import { RealtimeIndicator } from "./RealtimeIndicator"

/**
 * Terminal de logs de debug compartilhado (integrações e plugins): a barra (título, tempo real,
 * ações extras, Atualizar, Maximizar e as ações do pai), a busca e o terminal. Os dados vêm do hook
 * da fonte (`useIntegrationDebugLogs`, `usePluginDebugLogs`), que escreve no terminal por
 * `useDebugTerminal().onLines`.
 */

export interface DebugTerminal {
    consoleRef: React.RefObject<IntegrationConsoleHandle | null>
    onLines: (lines: IntegrationLogLine[], reset: boolean) => void
    searchResults: ConsoleSearchResults | null
    setSearchResults: (results: ConsoleSearchResults | null) => void
    search: (term: string, direction: SearchDirection) => void
    clearSearch: () => void
}

/** Estado do terminal: escreve as linhas com o rótulo da fonte e controla a busca. */
export function useDebugTerminal(tag: string): DebugTerminal {
    const consoleRef = useRef<IntegrationConsoleHandle>(null)
    const [searchResults, setSearchResults] = useState<ConsoleSearchResults | null>(null)
    const search = useCallback((term: string, direction: SearchDirection) => {
        const found = consoleRef.current?.search(term, direction)
        // Sem ocorrência o addon pode não emitir evento: garante o "0/0".
        if (found === false) setSearchResults({ index: -1, count: 0 })
    }, [])
    const clearSearch = useCallback(() => {
        consoleRef.current?.clearSearch()
        setSearchResults(null)
    }, [])
    const onLines = useCallback(
        (lines: IntegrationLogLine[], reset: boolean) => {
            if (reset) consoleRef.current?.clear()
            consoleRef.current?.writeLines(lines.map((line) => formatLogLine(line, { tag: tag.toUpperCase() })))
        },
        [tag],
    )
    return { consoleRef, onLines, searchResults, setSearchResults, search, clearSearch }
}

export interface DebugLogConsoleProps {
    terminal: DebugTerminal
    logs: { mode: DebugStreamMode; loading: boolean; error: string | null; refresh: () => void | Promise<void> }
    title: ReactNode
    description?: ReactNode
    /** Botões antes do Atualizar (ex.: Testar conexão da integração). */
    extraActions?: ReactNode
    /** Ações após o Atualizar (ex.: Fechar do modal). */
    actions?: ReactNode
    className?: string
    consoleClassName?: string
    maximized?: boolean
    /** Sem ele, o botão Maximizar não aparece. */
    onMaximizedChange?: (maximized: boolean) => void
    placeholder?: string
}

export function DebugLogConsole({ terminal, logs, title, description, extraActions, actions, className, consoleClassName, maximized = false, onMaximizedChange, placeholder = "Aguardando eventos de debug..." }: DebugLogConsoleProps) {
    const { mode, loading, error, refresh } = logs
    return (
        <div className={cn("flex min-h-0 flex-col gap-3", className)}>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate">{title}</div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <RealtimeIndicator mode={mode} />
                    {extraActions}
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => void refresh()} disabled={loading} aria-label="Atualizar">
                                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Atualizar</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    {onMaximizedChange && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMaximizedChange(!maximized)} aria-label={maximized ? "Restaurar" : "Maximizar"} aria-pressed={maximized}>
                                        {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{maximized ? "Restaurar" : "Maximizar"}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    {actions}
                </div>
            </div>
            {description && <div className="-mt-1.5 text-sm text-muted-foreground">{description}</div>}
            <AnimatePresence>
                {error && (
                    <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="text-xs text-destructive">
                        {error}
                    </motion.p>
                )}
            </AnimatePresence>
            <DebugSearchBar onSearch={terminal.search} onClear={terminal.clearSearch} results={terminal.searchResults} highlightLimit={SEARCH_HIGHLIGHT_LIMIT} />
            <IntegrationConsole ref={terminal.consoleRef} className={cn("min-h-[320px] flex-1", consoleClassName)} placeholder={placeholder} onSearchResults={terminal.setSearchResults} />
        </div>
    )
}
