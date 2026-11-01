"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** Atraso para fechar o card ao sair da partícula e do card. */
export const HOVER_CLOSE_DELAY_MS = 300

/**
 * Hover da partícula que vira card, com dois sinais de presença (cursor na partícula e no card): o
 * fechamento, com atraso, só é agendado quando os dois estão desligados e é cancelado quando qualquer
 * um liga. A ordem dos eventos não importa (o navegador avisa "entrei no card" antes de "saí da
 * partícula").
 */
export function useHoverPresence(): { hovered: string | null; hover: (id: string | null) => void; hoverCard: (id: string | null) => void } {
    const [hovered, setHovered] = useState<string | null>(null)
    const presence = useRef<{ particle: string | null; card: string | null }>({ particle: null, card: null })
    const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => void (leaveTimer.current && clearTimeout(leaveTimer.current)), [])
    const setPresence = useCallback((source: "particle" | "card", id: string | null) => {
        presence.current[source] = id
        if (leaveTimer.current) clearTimeout(leaveTimer.current)
        leaveTimer.current = null
        const present = presence.current.card ?? presence.current.particle
        if (present !== null) return setHovered(present)
        leaveTimer.current = setTimeout(() => setHovered(null), HOVER_CLOSE_DELAY_MS)
    }, [])
    const hover = useCallback((id: string | null) => setPresence("particle", id), [setPresence])
    const hoverCard = useCallback((id: string | null) => setPresence("card", id), [setPresence])
    return { hovered, hover, hoverCard }
}
