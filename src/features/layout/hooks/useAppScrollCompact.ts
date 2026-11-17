"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { APP_SCROLL_CONTAINER_ID } from "@/hooks/usePageVirtualizer"
import { nextHeaderCompact } from "../mobile-header"

/**
 * Se o cabeçalho do celular está recolhido, pela rolagem do conteúdo da casca
 * (`APP_SCROLL_CONTAINER_ID`, não a janela). Escuta `scroll` em captura no `document`: continua
 * valendo quando o `<main>` é remontado na troca de página e ignora rolagens internas (painéis).
 * A cada troca de rota recalcula pela rolagem real (página nova começa no topo).
 */
export function useAppScrollCompact(enabled: boolean): boolean {
    const pathname = usePathname()
    // O estado vale só para a rota em que foi lido: ao trocar de tela, volta ao topo até a primeira leitura.
    const [state, setState] = useState({ pathname, compact: false })

    useEffect(() => {
        if (!enabled) return
        let frame = 0
        const read = () => {
            frame = 0
            const scrollTop = document.getElementById(APP_SCROLL_CONTAINER_ID)?.scrollTop ?? 0
            setState((previous) => {
                const compact = nextHeaderCompact(previous.pathname === pathname && previous.compact, scrollTop)
                return previous.pathname === pathname && previous.compact === compact ? previous : { pathname, compact }
            })
        }
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(read)
        }
        const onScroll = (event: Event) => {
            if ((event.target as HTMLElement | null)?.id === APP_SCROLL_CONTAINER_ID) schedule()
        }
        schedule()
        document.addEventListener("scroll", onScroll, { capture: true, passive: true })
        return () => {
            if (frame) cancelAnimationFrame(frame)
            document.removeEventListener("scroll", onScroll, { capture: true })
        }
    }, [enabled, pathname])

    const compact = enabled && state.pathname === pathname && state.compact
    return compact
}
