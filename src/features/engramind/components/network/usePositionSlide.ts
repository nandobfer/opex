"use client"

import { useLayoutEffect, useRef } from "react"
import { animate, useMotionValue } from "framer-motion"
import type { Point } from "../../network/network-math"

/**
 * O node mudou de posição (órbita recalculada, troca de distribuição): desliza da posição antiga para a
 * nova (deslocamento animado até zero). Com movimento reduzido, a troca é instantânea.
 */
export function usePositionSlide(point: Point, reduced: boolean, duration = 0.45) {
    const x = useMotionValue(0)
    const y = useMotionValue(0)
    const previous = useRef(point)
    useLayoutEffect(() => {
        const before = previous.current
        previous.current = point
        if (reduced || (before.x === point.x && before.y === point.y)) return
        x.set(before.x - point.x + x.get())
        y.set(before.y - point.y + y.get())
        const controls = [animate(x, 0, { duration, ease: "easeInOut" }), animate(y, 0, { duration, ease: "easeInOut" })]
        return () => controls.forEach((control) => control.stop())
    }, [point, reduced, x, y, duration])
    return { x, y }
}
