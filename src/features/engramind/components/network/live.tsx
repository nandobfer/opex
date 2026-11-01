"use client"

import { createContext, useContext, useMemo } from "react"
import { motion } from "framer-motion"
import { PathTraveler } from "@/components/flow/path-traveler"
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
    return <PathTraveler path={path} reverse={travel.reverse} delayMs={travel.delayMs} radius={travel.tone === "white" ? 2.5 : 4} className={travel.tone === "white" ? "fill-foreground" : "fill-primary"} onDone={onDone} />
}
