"use client"

import { useRef, type CSSProperties } from "react"
import { useFillViewportHeight } from "@/features/integrations/hooks/useScrollViewportHeight"
import { INBOX_HEIGHT, INBOX_MEASURED_HEIGHT, INBOX_MIN_HEIGHT_PX } from "./chat-layout"

/** Tempo para a entrada animada da aba (≈200 ms) terminar antes da medida final. */
const SETTLE_MS = 350

/**
 * Altura do card da aba Conversas (OPE-207): o restante da área visível do `<main>` a partir do topo do card, seja qual
 * for o que fica acima (cabeçalho da página do agente ou de Integrações › IA). Usada pelo inbox, pelo skeleton e pelo
 * erro, para os três terem a mesma altura.
 */
export function useInboxHeight<T extends HTMLElement = HTMLDivElement>() {
    const ref = useRef<T>(null)
    const height = useFillViewportHeight(ref, true, INBOX_MIN_HEIGHT_PX, SETTLE_MS)
    const style: CSSProperties | undefined = height === undefined ? undefined : { height }
    return { ref, style, className: height === undefined ? INBOX_HEIGHT : INBOX_MEASURED_HEIGHT }
}
