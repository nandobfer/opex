"use client"

import { useEffect, useRef } from "react"
import { useNodesState, type Node } from "@xyflow/react"
import { animate } from "framer-motion"
import { ARCHITECT_LIVE_TWEEN_MS } from "../constants"

/**
 * Reconciliação animada dos nós do canvas quando o layout muda sem remontar (diagrama ao vivo e a
 * troca do rascunho pelo grafo final): quem já estava desliza da posição antiga para a nova (Framer
 * Motion), quem chega nasce na posição do nó de onde veio (`originOf`) e quem sai fica marcado
 * `leaving` durante o deslize e depois é retirado. Com movimento reduzido, vai direto ao final.
 */

type Pos = { x: number; y: number }
type Sized = { width?: number; height?: number }

const lerp = (from: number, to: number, t: number) => from + (to - from) * t

/** Quadro intermediário: posições (e tamanhos dos grupos) interpolados; saindo ficam onde estavam. */
export function interpolateNodes<N extends Node>(from: ReadonlyMap<string, Pos & Sized>, target: readonly N[], leaving: readonly N[], t: number): N[] {
    const moved = target.map((node) => {
        const start = from.get(node.id)
        if (!start) return node
        const size = node.width !== undefined && start.width !== undefined && node.height !== undefined && start.height !== undefined ? { width: lerp(start.width, node.width, t), height: lerp(start.height, node.height, t) } : null
        return {
            ...node,
            position: { x: lerp(start.x, node.position.x, t), y: lerp(start.y, node.position.y, t) },
            ...(size ? { ...size, style: { ...node.style, ...size } } : {}),
        }
    })
    return [...moved, ...leaving.map((node) => ({ ...node, data: { ...node.data, leaving: true } }))]
}

export function useAnimatedLayout<N extends Node>(target: N[], options: { animate: boolean; originOf?: (id: string, current: ReadonlyMap<string, N>) => Pos | null }) {
    const [nodes, setNodes, onNodesChange] = useNodesState<N>(target)
    const current = useRef(nodes)
    const first = useRef(true)
    useEffect(() => {
        current.current = nodes
    }, [nodes])

    useEffect(() => {
        if (first.current) {
            first.current = false
            return
        }
        if (!options.animate) {
            setNodes(target)
            return
        }
        const before = new Map(current.current.filter((node) => !(node.data as { leaving?: boolean }).leaving).map((node) => [node.id, node]))
        const targetIds = new Set(target.map((node) => node.id))
        const leaving = [...before.values()].filter((node) => !targetIds.has(node.id))
        const from = new Map<string, Pos & Sized>()
        for (const node of target) {
            const previous = before.get(node.id)
            if (previous) from.set(node.id, { ...previous.position, width: previous.width, height: previous.height })
            else {
                const origin = options.originOf?.(node.id, before)
                if (origin) from.set(node.id, origin)
            }
        }
        const controls = animate(0, 1, {
            duration: ARCHITECT_LIVE_TWEEN_MS / 1000,
            ease: "easeOut",
            onUpdate: (t) => setNodes(interpolateNodes(from, target, leaving, t)),
            onComplete: () => setNodes(target),
        })
        return () => controls.stop()
        // O alvo novo é o gatilho; `setNodes` é estável.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target, options.animate])

    return { nodes, onNodesChange }
}
