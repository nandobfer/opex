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
 *
 * `pinOnClick` (detalhe de memória nos avisos da mesa, OPE-139): o clique **fixa** o painel — sair do
 * gatilho e do painel deixa de fechar; fecha pelo `setOpen(false)` (Esc, clique fora, botão de fechar)
 * ou por outro clique no gatilho. Sem a opção, o comportamento é o dos menus da barra lateral.
 */
export function useHoverPopover(closeDelay = HOVER_POPOVER_CLOSE_DELAY, options: { pinOnClick?: boolean } = {}) {
    const pinOnClick = options.pinOnClick === true
    const [open, setOpenState] = useState(false)
    const [pinned, setPinnedState] = useState(false)
    const pinnedRef = useRef(false)
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
            if (!next) {
                presence.current = { trigger: false, panel: false }
                pinnedRef.current = false
                setPinnedState(false)
            }
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
                if (pinnedRef.current || presence.current.trigger || presence.current.panel) return
                cancelClose()
                timer.current = setTimeout(() => {
                    timer.current = null
                    if (!pinnedRef.current && !presence.current.trigger && !presence.current.panel) setOpenState(false)
                }, closeDelay)
            },
        }),
        [cancelClose, closeDelay],
    )

    /** Clique, toque ou Enter/Espaço no gatilho: com o cursor em cima mantém aberto; senão alterna. */
    const toggle = useCallback(() => {
        cancelClose()
        if (pinOnClick) {
            // Fixado: o clique solta e fecha; senão fixa (abrindo, se o cursor ainda não tinha aberto).
            const next = !pinnedRef.current
            pinnedRef.current = next
            setPinnedState(next)
            openedByHover.current = false
            setOpenState(next)
            return
        }
        if (presence.current.trigger) {
            openedByHover.current = false
            setOpenState(true)
            return
        }
        setOpenState((current) => {
            if (!current) openedByHover.current = false
            return !current
        })
    }, [cancelClose, pinOnClick])

    /**
     * Abre pelo teclado (ex.: seta → no gatilho): o painel recebe o foco no primeiro link e o devolve
     * ao gatilho ao fechar. Devolve `true` quando já estava aberto (pelo cursor): nesse caso o foco
     * inicial do Radix não roda de novo e quem chamou move o foco para o painel.
     */
    const openFromKeyboard = useCallback((): boolean => {
        cancelClose()
        openedByHover.current = false
        if (open) return true
        setOpenState(true)
        return false
    }, [cancelClose, open])

    useEffect(() => cancelClose, [cancelClose])

    return { open, pinned, setOpen, toggle, openFromKeyboard, triggerHandlers: pointerHandlers("trigger"), panelHandlers: pointerHandlers("panel"), openedByHover }
}
