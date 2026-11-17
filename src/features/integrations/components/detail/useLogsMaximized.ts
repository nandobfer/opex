"use client"

import { useEffect, useRef, useState } from "react"
import { useMaximizedFrame } from "@/hooks/useMaximizedFrame"
import { isSearchEscape } from "../DebugSearchBar"

/** Estado "maximizado" do painel de logs: moldura sobre `[data-dashboard-content]` e Esc para restaurar. */
/** `active`: coluna de logs aberta ao lado do formulário. */
export function useLogsMaximized(active: boolean) {
    const logsCardRef = useRef<HTMLDivElement>(null)
    const [logsMaximized, setLogsMaximized] = useState(false)
    // Fechar a coluna (ou desligar o debug) tira o painel: volta a "restaurado" (ajuste durante o render, sem efeito).
    if (!active && logsMaximized) setLogsMaximized(false)
    useMaximizedFrame(logsCardRef, logsMaximized && active)
    useEffect(() => {
        if (!logsMaximized) return
        const onKeyDown = (event: KeyboardEvent) => {
            // Esc com texto na busca é da busca (limpa); o seguinte restaura.
            if (event.key !== "Escape" || event.defaultPrevented || isSearchEscape(event)) return
            setLogsMaximized(false)
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [logsMaximized])

    return { logsCardRef, logsMaximized, setLogsMaximized }
}
