"use client"

import { memo } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { motion } from "framer-motion"
import { ChevronDown, ChevronRight, FileCode2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { ARCHITECT_GROUP_LAYER_LABELS, ARCHITECT_NODE_KIND_LABELS, ARCHITECT_NODE_STATUS_LABELS } from "../../constants"
import type { ArchitectGroup, ArchitectNode as GraphNode } from "../../graph"
import { ARCHITECT_NODE_KIND_ICONS } from "../icons"
import { enterDelay, isDimmed, useDiagramHighlight } from "./diagram-context"

/** Nós do canvas do Agente Arquiteto (componentes React com os tokens do tema escuro). */

/** `leaving`: o nó saiu do grafo e some durante o deslize do layout ao vivo. */
type Common = { rank: number; leaving?: boolean }
export type ItemNode = Node<{ node: GraphNode } & Common, "item">
/**
 * Tipo do nó de grupo: NUNCA "group" — é um tipo reservado do React Flow, que pinta a classe
 * `.react-flow__node-group` de cinza translúcido (com padding e borda) por trás do nosso visual.
 */
export const ARCHITECT_GROUP_NODE_TYPE = "architect-group"
export type GroupNode = Node<{ group: ArchitectGroup; count: number } & Common, typeof ARCHITECT_GROUP_NODE_TYPE>
export type CollapsedNode = Node<{ groupId: string; label: string; count: number } & Common, "collapsed">
export type DiagramNode = ItemNode | GroupNode | CollapsedNode

const HANDLE = "!h-1.5 !w-1.5 !border-0 !bg-transparent"

function Handles() {
    return (
        <>
            <Handle type="target" position={Position.Left} className={HANDLE} isConnectable={false} />
            <Handle type="source" position={Position.Right} className={HANDLE} isConnectable={false} />
        </>
    )
}

function StatusBadge({ status }: { status: GraphNode["status"] }) {
    if (status === "existing") return null
    return (
        <Badge variant={status === "new" ? "default" : "secondary"} className="h-4 shrink-0 px-1.5 text-[10px]">
            {ARCHITECT_NODE_STATUS_LABELS[status]}
        </Badge>
    )
}

function ItemNodeView({ id, data }: NodeProps<ItemNode>) {
    const highlight = useDiagramHighlight()
    const { node } = data
    const Icon = ARCHITECT_NODE_KIND_ICONS[node.kind]
    const dimmed = isDimmed(highlight, id)
    return (
        <motion.div
            data-testid={`architect-node-${id}`}
            data-dimmed={dimmed ? "true" : "false"}
            data-leaving={data.leaving ? "true" : undefined}
            initial={highlight.reducedMotion ? false : { opacity: 0, scale: highlight.live ? 0.6 : 0.92 }}
            animate={data.leaving ? { opacity: 0, scale: 0.85 } : { opacity: dimmed ? 0.25 : 1, scale: 1 }}
            transition={{ duration: 0.2, delay: highlight.live ? 0 : enterDelay(data.rank, highlight.reducedMotion) }}
            className={cn(
                "flex h-[68px] w-[220px] flex-col justify-center gap-1 rounded-lg border bg-card px-3 py-2 text-card-foreground shadow-sm",
                node.kind === "objective" && "border-primary bg-primary/10",
                node.status === "new" && node.kind !== "objective" && "border-primary/70",
                node.status === "changed" && "border-dashed border-primary/60",
                highlight.selectedId === id && "ring-2 ring-primary",
            )}
        >
            <Handles />
            <div className="flex min-w-0 items-center gap-1.5">
                <Icon className={cn("h-3.5 w-3.5 shrink-0", node.kind === "risk" ? "text-destructive" : "text-primary")} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-xs font-medium" title={node.label}>
                    {node.label}
                </span>
                <StatusBadge status={node.status} />
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                <span>{ARCHITECT_NODE_KIND_LABELS[node.kind]}</span>
                {highlight.showFiles && node.files.length > 0 && (
                    <span className="flex min-w-0 items-center gap-0.5 truncate font-mono" title={node.files.join("\n")}>
                        <FileCode2 className="h-3 w-3 shrink-0" aria-hidden />
                        {node.files.length === 1 ? node.files[0] : `${node.files.length} arquivos`}
                    </span>
                )}
            </div>
        </motion.div>
    )
}

function GroupNodeView({ data }: NodeProps<GroupNode>) {
    const highlight = useDiagramHighlight()
    const { group } = data
    return (
        <motion.div
            data-testid={`architect-group-${group.id}`}
            initial={highlight.reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: data.leaving ? 0 : highlight.focusedId ? 0.6 : 1 }}
            transition={{ duration: 0.2, delay: highlight.live ? 0 : enterDelay(data.rank, highlight.reducedMotion) }}
            className="h-full w-full rounded-xl border border-dashed border-primary/25 bg-primary/[0.03]"
        >
            <div className="flex items-center gap-1.5 px-3 pt-2">
                <button
                    type="button"
                    className="nodrag flex items-center gap-1 rounded text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => highlight.onToggleGroup(group.id)}
                    aria-label={`Recolher o grupo ${group.label}`}
                >
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    {group.label}
                </button>
                <span className="text-[10px] text-muted-foreground">
                    {ARCHITECT_GROUP_LAYER_LABELS[group.layer]} · {data.count}
                </span>
            </div>
        </motion.div>
    )
}

function CollapsedNodeView({ id, data }: NodeProps<CollapsedNode>) {
    const highlight = useDiagramHighlight()
    const dimmed = isDimmed(highlight, id)
    return (
        <motion.div
            data-testid={`architect-collapsed-${data.groupId}`}
            initial={highlight.reducedMotion ? false : { opacity: 0, scale: 0.92 }}
            animate={data.leaving ? { opacity: 0, scale: 0.85 } : { opacity: dimmed ? 0.25 : 1, scale: 1 }}
            transition={{ duration: 0.2, delay: highlight.live ? 0 : enterDelay(data.rank, highlight.reducedMotion) }}
            className="flex h-[68px] w-[220px] items-center gap-2 rounded-xl border border-dashed border-primary/50 bg-primary/5 px-3"
        >
            <Handles />
            <button type="button" className="nodrag flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium" onClick={() => highlight.onToggleGroup(data.groupId)} aria-label={`Expandir o grupo ${data.label}`}>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{data.label}</span>
            </button>
            <Badge variant="outline" className="shrink-0 text-[10px]">
                {data.count} nós
            </Badge>
        </motion.div>
    )
}

export const ARCHITECT_NODE_TYPES = {
    item: memo(ItemNodeView),
    [ARCHITECT_GROUP_NODE_TYPE]: memo(GroupNodeView),
    collapsed: memo(CollapsedNodeView),
}
