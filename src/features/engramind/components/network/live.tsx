"use client"

import { createContext, useContext, useEffect, useMemo, useRef } from "react"
import { animate, motion, useMotionValue, useTransform } from "framer-motion"
import type { Travel } from "../../hooks/useEngramindConsumption"

/** Pulsos e partículas em viagem da rede (OPE-109), lidos pelos nodes e arestas do React Flow. */
interface NetworkLive {
    pulses: Record<string, number>
    travels: Travel[]
    finish: (id: string) => void
}

const EMPTY: NetworkLive = { pulses: {}, travels: [], finish: () => undefined }
export const NetworkLiveContext = createContext<NetworkLive>(EMPTY)

export function NetworkLiveProvider({ value, children }: { value: NetworkLive; children: React.ReactNode }) {
    return <NetworkLiveContext.Provider value={value}>{children}</NetworkLiveContext.Provider>
}

/** Anel que pulsa uma vez a cada consumo (a chave remonta a animação). */
export function PulseRing({ nodeKey, className }: { nodeKey: string; className?: string }) {
    const count = useContext(NetworkLiveContext).pulses[nodeKey] ?? 0
    if (!count) return null
    return (
        <motion.span
            key={count}
            data-testid={`pulse-${nodeKey}`}
            aria-hidden
            className={`pointer-events-none absolute inset-0 rounded-full border-2 border-primary ${className ?? ""}`}
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
        />
    )
}

/** Partículas que viajam pela aresta `edgeId` (caminho SVG `path`). */
export function TravelDots({ edgeId, path }: { edgeId: string; path: string }) {
    const { travels, finish } = useContext(NetworkLiveContext)
    const mine = useMemo(() => travels.filter((travel) => travel.edge === edgeId), [travels, edgeId])
    if (!mine.length) return null
    return (
        <>
            {mine.map((travel) => (
                <TravelDot key={travel.id} travel={travel} path={path} onDone={() => finish(travel.id)} />
            ))}
        </>
    )
}

function TravelDot({ travel, path, onDone }: { travel: Travel; path: string; onDone: () => void }) {
    const ref = useRef<SVGPathElement>(null)
    const progress = useMotionValue(0)
    const point = (value: number) => {
        const element = ref.current
        if (!element || typeof element.getTotalLength !== "function") return { x: 0, y: 0 }
        const length = element.getTotalLength()
        const at = element.getPointAtLength((travel.reverse ? 1 - value : value) * length)
        return { x: at.x, y: at.y }
    }
    const cx = useTransform(progress, (value) => point(value).x)
    const cy = useTransform(progress, (value) => point(value).y)
    useEffect(() => {
        const controls = animate(progress, 1, { duration: 0.9, delay: travel.delayMs / 1000, ease: "easeInOut", onComplete: onDone })
        return () => controls.stop()
        // A viagem roda uma vez por partícula.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return (
        <g data-testid="travel-dot">
            <path ref={ref} d={path} fill="none" stroke="none" />
            <motion.circle cx={cx} cy={cy} r={travel.tone === "white" ? 2.5 : 4} className={travel.tone === "white" ? "fill-foreground" : "fill-primary"} />
        </g>
    )
}
