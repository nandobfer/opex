"use client"

import { useEffect, useRef, useState } from "react"
import { dialogPanelMotion } from "@/components/motion/dialog-panel-motion"

const CLOSE_ANIMATION_MS = 250

/**
 * Mesma mecânica dos diálogos copiados do Smart Desk: o diálogo fica montado por 250 ms após
 * fechar para o painel (`dialogPanelMotion`) animar a saída.
 */
export function useDialogPresence(open: boolean) {
    const [isVisible, setIsVisible] = useState(open)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current)
        if (open) {
            timer.current = setTimeout(() => setIsVisible(true), 0)
        } else {
            timer.current = setTimeout(() => setIsVisible(false), CLOSE_ANIMATION_MS)
        }
        return () => {
            if (timer.current) clearTimeout(timer.current)
        }
    }, [open])

    return {
        isVisible: isVisible || open,
        panelProps: {
            initial: dialogPanelMotion.initial,
            animate: open ? dialogPanelMotion.animate : dialogPanelMotion.exit,
            transition: dialogPanelMotion.transition,
        },
    }
}
