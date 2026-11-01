"use client"

import { memo } from "react"
import { Handle, Position, useStore, type Node, type NodeProps } from "@xyflow/react"
import { Archive, Hash, MoreHorizontal, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AgentIcon } from "./agent-icons"
import { PulseRing } from "./live"

/** Zoom abaixo do qual os rótulos somem (visão muito afastada). */
export const LABEL_MIN_ZOOM = 0.45
export const useZoom = () => useStore((state) => state.transform[2])

const HANDLE_STYLE: React.CSSProperties = { left: "50%", top: "50%", width: 1, height: 1, minWidth: 0, minHeight: 0, opacity: 0, border: 0, transform: "translate(-50%, -50%)", pointerEvents: "none" }

/** Arestas saem e chegam pelo centro do node. */
export function CenterHandles() {
    return (
        <>
            <Handle type="source" position={Position.Right} style={HANDLE_STYLE} isConnectable={false} />
            <Handle type="target" position={Position.Left} style={HANDLE_STYLE} isConnectable={false} />
        </>
    )
}

export type AgentNodeData = { id: string; name: string; app: string; dimmed?: boolean }

export const AgentNode = memo(function AgentNode({ data }: NodeProps<Node<AgentNodeData, "agent">>) {
    const showLabel = useZoom() >= LABEL_MIN_ZOOM
    return (
        <div data-testid={`agent-node-${data.id}`} title={data.id} className={cn("relative flex cursor-pointer items-center gap-2 rounded-full border border-primary/40 bg-card px-3 py-2 shadow-sm transition-opacity hover:border-primary", data.dimmed && "opacity-40")}>
            <PulseRing nodeKey={`agent:${data.id}`} />
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <AgentIcon agent={data.id} className="h-4 w-4" />
            </span>
            {showLabel && (
                <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-medium text-foreground">{data.name}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{data.app}</span>
                </span>
            )}
            <CenterHandles />
        </div>
    )
})

export type ChannelNodeData = { slug: string; name: string; count: number; archived: boolean; hits?: number | null; dimmed?: boolean; onMenu?: (slug: string) => void }

export const ChannelNode = memo(function ChannelNode({ data }: NodeProps<Node<ChannelNodeData, "channel">>) {
    const showLabel = useZoom() >= LABEL_MIN_ZOOM
    return (
        <div
            data-testid={`channel-node-${data.slug}`}
            data-archived={data.archived || undefined}
            className={cn("relative flex min-w-44 cursor-pointer items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm transition-opacity hover:border-primary", data.archived && "border-dashed opacity-60", data.dimmed && "opacity-30")}
        >
            <PulseRing nodeKey={`channel:${data.slug}`} className="rounded-xl" />
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{data.archived ? <Archive className="h-4 w-4" aria-hidden /> : <Hash className="h-4 w-4" aria-hidden />}</span>
            {showLabel && (
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-sm font-medium text-foreground">{data.slug}</span>
                    <span className="truncate text-[10px] text-muted-foreground">
                        {data.count} {data.count === 1 ? "memória" : "memórias"}
                        {typeof data.hits === "number" && <span className="ml-1 font-semibold text-primary">· {data.hits} na busca</span>}
                    </span>
                </span>
            )}
            {data.onMenu && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Ações do canal ${data.slug}`}
                    className="nodrag nopan h-7 w-7 text-muted-foreground"
                    onClick={(event) => {
                        event.stopPropagation()
                        data.onMenu?.(data.slug)
                    }}
                >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                </Button>
            )}
            <CenterHandles />
        </div>
    )
})

export type CenterNodeData = { label: string; detail: string; icon: LucideIcon; pulseKey: string; archived?: boolean }

export const CenterNode = memo(function CenterNode({ data }: NodeProps<Node<CenterNodeData, "center">>) {
    const Icon = data.icon
    return (
        <div data-testid="universe-center" className={cn("relative flex flex-col items-center gap-1", data.archived && "opacity-60")}>
            <span className={cn("relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary bg-primary/20 text-primary shadow-[0_0_32px] shadow-primary/40", data.archived && "border-dashed")}>
                <PulseRing nodeKey={data.pulseKey} />
                <Icon className="h-7 w-7" aria-hidden />
                <CenterHandles />
            </span>
            <span className="max-w-56 truncate rounded-md bg-card/80 px-2 text-sm font-semibold text-foreground">{data.label}</span>
            <span className="text-[10px] text-muted-foreground">{data.detail}</span>
        </div>
    )
})
