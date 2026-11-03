"use client"

import { getNodesBounds, getViewportForBounds, type Node } from "@xyflow/react"

/** PNG do diagrama inteiro (não só a parte visível), como recomenda a documentação do React Flow. */
const IMAGE_WIDTH = 1920
const IMAGE_HEIGHT = 1080

export async function downloadDiagramImage(container: HTMLElement, nodes: Node[], fileName: string): Promise<void> {
    const viewportElement = container.querySelector<HTMLElement>(".react-flow__viewport")
    if (!viewportElement || !nodes.length) throw new Error("O diagrama ainda não foi desenhado")
    const { toPng } = await import("html-to-image")
    const bounds = getNodesBounds(nodes)
    const viewport = getViewportForBounds(bounds, IMAGE_WIDTH, IMAGE_HEIGHT, 0.1, 2, 0.08)
    const background = getComputedStyle(document.documentElement).getPropertyValue("--background").trim()
    const dataUrl = await toPng(viewportElement, {
        backgroundColor: background ? `hsl(${background})` : undefined,
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        style: { width: `${IMAGE_WIDTH}px`, height: `${IMAGE_HEIGHT}px`, transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` },
    })
    const link = document.createElement("a")
    link.download = fileName
    link.href = dataUrl
    link.click()
}
