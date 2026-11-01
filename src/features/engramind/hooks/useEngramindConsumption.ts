"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useReducedMotion } from "framer-motion"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { ENGRAMIND_CONSUMPTION_EVENT } from "../constants"
import type { ConsumptionEvent, MemoryUsageMap } from "../network/types"
import { areaKey } from "./useEngramind"
import { MEMORY_USAGE_KEY } from "./useEngramindNetwork"

/** O Engramind grava os contadores em lote a cada 5 s: a releitura espera um pouco mais. */
export const CONSUMPTION_REFRESH_DELAY_MS = 6_000

export function isConsumptionEvent(value: unknown): value is ConsumptionEvent {
    const event = value as Partial<ConsumptionEvent> | null
    return Boolean(event && typeof event.agent === "string" && (event.kind === "context" || event.kind === "search") && Array.isArray(event.channels) && Array.isArray(event.memoryIds))
}

/**
 * Tempo real do consumo de memórias (`engramind-consumption` em `private-app`, OPE-109). A tela anima
 * na hora com o `handler` (estado local: brilho cheio e tamanho um pouco maior) e marca o uso no
 * cache; os contadores reais são relidos depois do lote do Engramind.
 */
export function useEngramindConsumption(handler: (event: ConsumptionEvent) => void): void {
    const queryClient = useQueryClient()
    const handlerRef = useRef(handler)
    useEffect(() => {
        handlerRef.current = handler
    }, [handler])
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        let timer: ReturnType<typeof setTimeout> | null = null
        const onEvent = (payload: unknown) => {
            if (!isConsumptionEvent(payload)) return
            const at = new Date().toISOString()
            queryClient.setQueryData<MemoryUsageMap>(MEMORY_USAGE_KEY, (previous) => {
                const next = { ...(previous ?? {}) }
                for (const id of payload.memoryIds) next[id] = { lastUsedAt: at, liveCount: (next[id]?.liveCount ?? 0) + 1 }
                return next
            })
            handlerRef.current(payload)
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => {
                void queryClient.invalidateQueries({ queryKey: areaKey("memories") })
                void queryClient.invalidateQueries({ queryKey: MEMORY_USAGE_KEY })
            }, CONSUMPTION_REFRESH_DELAY_MS)
        }
        channel.bind(ENGRAMIND_CONSUMPTION_EVENT, onEvent)
        return () => {
            if (timer) clearTimeout(timer)
            channel.unbind(ENGRAMIND_CONSUMPTION_EVENT, onEvent)
            releaseChannel(name)
        }
    }, [queryClient])
}

export interface Travel {
    id: string
    /** Aresta por onde a partícula viaja. */
    edge: string
    /** `true`: do alvo para a origem da aresta. */
    reverse: boolean
    tone: "primary" | "white"
    delayMs: number
}

let travelSeq = 0

/**
 * Efeitos locais da rede: pulsos por node (contador que remonta o anel), partículas viajando pelas
 * arestas e o leve aumento de tamanho das memórias consumidas (zerado quando o Engramind relê os
 * números). Movimento reduzido: sem pulsos nem viagens; o aumento e o brilho continuam.
 */
export function useLiveEffects(resetKey: unknown) {
    const reducedMotion = useReducedMotion()
    const [pulses, setPulses] = useState<Record<string, number>>({})
    const [travels, setTravels] = useState<Travel[]>([])
    const [bumps, setBumps] = useState<Record<string, number>>({})
    const [liveCount, setLiveCount] = useState(0)
    const timers = useRef<ReturnType<typeof setTimeout>[]>([])

    useEffect(() => setBumps({}), [resetKey])
    useEffect(() => () => timers.current.forEach(clearTimeout), [])

    const pulse = useCallback(
        (keys: readonly string[], delayMs = 0) => {
            if (reducedMotion || !keys.length) return
            const run = () => setPulses((previous) => Object.fromEntries([...Object.entries(previous), ...keys.map((key) => [key, (previous[key] ?? 0) + 1] as const)]))
            if (delayMs > 0) timers.current.push(setTimeout(run, delayMs))
            else run()
        },
        [reducedMotion],
    )
    const travel = useCallback(
        (items: readonly Omit<Travel, "id">[]) => {
            if (reducedMotion || !items.length) return
            setTravels((previous) => [...previous, ...items.map((item) => ({ ...item, id: `t${(travelSeq += 1)}` }))].slice(-60))
        },
        [reducedMotion],
    )
    const finish = useCallback((id: string) => setTravels((previous) => previous.filter((item) => item.id !== id)), [])
    const bump = useCallback((ids: readonly string[]) => {
        if (!ids.length) return
        setBumps((previous) => {
            const next = { ...previous }
            for (const id of ids) next[id] = (next[id] ?? 0) + 1
            return next
        })
    }, [])
    const countEvent = useCallback(() => setLiveCount((count) => count + 1), [])
    return { pulses, travels, bumps, liveCount, pulse, travel, finish, bump, countEvent, reducedMotion: Boolean(reducedMotion) }
}

export type LiveEffects = ReturnType<typeof useLiveEffects>
