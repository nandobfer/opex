"use client"

import { useEffect, useRef } from "react"
import { animate, motion, useMotionValue, useTransform } from "framer-motion"

/**
 * Partícula que percorre um caminho SVG uma vez (Framer Motion) e avisa ao chegar. Usada nas redes do
 * Engramind (memórias viajando) e nos diagramas do Agente Arquiteto (pulso da aresta que nasce).
 */
export function PathTraveler({ path, reverse = false, delayMs = 0, durationMs = 900, radius = 4, className = "fill-primary", testId = "travel-dot", onDone }: { path: string; reverse?: boolean; delayMs?: number; durationMs?: number; radius?: number; className?: string; testId?: string; onDone?: () => void }) {
    const ref = useRef<SVGPathElement>(null)
    const progress = useMotionValue(0)
    const point = (value: number) => {
        const element = ref.current
        if (!element || typeof element.getTotalLength !== "function") return { x: 0, y: 0 }
        const length = element.getTotalLength()
        const at = element.getPointAtLength((reverse ? 1 - value : value) * length)
        return { x: at.x, y: at.y }
    }
    const cx = useTransform(progress, (value) => point(value).x)
    const cy = useTransform(progress, (value) => point(value).y)
    useEffect(() => {
        const controls = animate(progress, 1, { duration: durationMs / 1000, delay: delayMs / 1000, ease: "easeInOut", onComplete: onDone })
        return () => controls.stop()
        // A viagem roda uma vez por partícula.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return (
        <g data-testid={testId}>
            <path ref={ref} d={path} fill="none" stroke="none" />
            <motion.circle cx={cx} cy={cy} r={radius} className={className} />
        </g>
    )
}
