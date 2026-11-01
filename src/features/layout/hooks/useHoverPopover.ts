"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"

/** Atraso para fechar depois que o cursor sai do gatilho e do painel (ms). */
export const HOVER_POPOVER_CLOSE_DELAY = 150

type Part = "trigger" | "panel"

/**
 * Painel que abre ao passar o mouse e também por clique, toque ou teclado.
 *
 * Presença do cursor em **dois sinais separados** (gatilho e painel), com eventos de ponteiro nos
 * dois: o fechamento só é agendado quando ambos estão desligados e é cancelado assim que qualquer
 * um liga — sem depender da ordem de "sair do gatilho" e "entrar no painel". Toque não conta como
 * hover (o `pointerenter` do toque abriria e o `click` em seguida fecharia).
 *
 * `openedByHover` diz se a última abertura foi pelo cursor: nesse caso o painel não rouba o foco ao
 * abrir nem devolve o foco ao gatilho ao fechar.
 */
export function useHoverPopover(closeDelay = HOVER_POPOVER_CLOSE_DELAY) {
    const [open, setOpenState] = useState(false)
    const presence = useRef<Record<Part, boolean>>({ trigger: false, panel: false })
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const openedByHover = useRef(false)

    const cancelClose = useCallback(() => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = null
    }, [])

    const setOpen = useCallback(
        (next: boolean) => {
            cancelClose()
            if (!next) presence.current = { trigger: false, panel: false }
            setOpenState(next)
        },
        [cancelClose],
    )

    const pointerHandlers = useCallback(
        (part: Part) => ({
            onPointerEnter: (event: PointerEvent) => {
                if (event.pointerType === "touch") return
                presence.current[part] = true
                cancelClose()
                if (part === "trigger") {
                    setOpenState((current) => {
                        if (!current) openedByHover.current = true
                        return true
                    })
                }
            },
            onPointerLeave: (event: PointerEvent) => {
                if (event.pointerType === "touch") return
                presence.current[part] = false
                if (presence.current.trigger || presence.current.panel) return
                cancelClose()
                timer.current = setTimeout(() => {
                    timer.current = null
                    if (!presence.current.trigger && !presence.current.panel) setOpenState(false)
                }, closeDelay)
            },
        }),
        [cancelClose, closeDelay],
    )

    /** Clique, toque ou Enter/Espaço no gatilho: com o cursor em cima mantém aberto; senão alterna. */
    const toggle = useCallback(() => {
        cancelClose()
        if (presence.current.trigger) {
            openedByHover.current = false
            setOpenState(true)
            return
        }
        setOpenState((current) => {
            if (!current) openedByHover.current = false
            return !current
        })
    }, [cancelClose])

    useEffect(() => cancelClose, [cancelClose])

    return { open, setOpen, toggle, triggerHandlers: pointerHandlers("trigger"), panelHandlers: pointerHandlers("panel"), openedByHover }
}
