"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, ArrowRight, Copy, FileCode2, FoldVertical, X } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { copyText } from "@/lib/clipboard"
import { ARCHITECT_EDGE_KIND_LABELS, ARCHITECT_NODE_KIND_LABELS, ARCHITECT_NODE_STATUS_LABELS } from "../../constants"
import { neighborsOf } from "../../filters"
import type { ArchitectGraph } from "../../graph"
import { ARCHITECT_NODE_KIND_ICONS } from "../icons"

interface ArchitectNodePanelProps {
    graph: ArchitectGraph
    nodeId: string | null
    showFiles: boolean
    onClose: () => void
    onSelect: (id: string) => void
    onCollapseGroup: (groupId: string) => void
}

/**
 * Painel lateral do nó clicado: descrição, arquivos e vizinhos. Fica numa camada sobre o canvas,
 * fora do viewport transformado (não herda o zoom).
 */
export function ArchitectNodePanel({ graph, nodeId, showFiles, onClose, onSelect, onCollapseGroup }: ArchitectNodePanelProps) {
    const node = nodeId ? graph.nodes.find((item) => item.id === nodeId) : undefined
    const group = node?.groupId ? graph.groups.find((item) => item.id === node.groupId) : undefined
    const neighbors = node ? neighborsOf(graph, node.id) : []
    const Icon = node ? ARCHITECT_NODE_KIND_ICONS[node.kind] : null
    const copy = async (file: string) => ((await copyText(file)) ? toast.success("Caminho copiado") : toast.error("Não foi possível copiar: selecione e copie manualmente."))
    return (
        <AnimatePresence>
            {node && Icon && (
                <motion.aside
                    key={node.id}
                    role="complementary"
                    aria-label={`Detalhes de ${node.label}`}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{ duration: 0.18 }}
                    className="absolute inset-y-2 right-2 z-10 flex w-80 max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-lg border bg-card shadow-lg"
                >
                    <div className="flex items-start gap-2 border-b p-3">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{node.label}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                                <Badge variant="outline" className="text-[10px]">{ARCHITECT_NODE_KIND_LABELS[node.kind]}</Badge>
                                <Badge variant={node.status === "existing" ? "outline" : node.status === "new" ? "default" : "secondary"} className="text-[10px]">{ARCHITECT_NODE_STATUS_LABELS[node.status]}</Badge>
                                {group && <Badge variant="outline" className="text-[10px]">{group.label}</Badge>}
                            </div>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Fechar detalhes">
                            <X className="h-4 w-4" aria-hidden />
                        </Button>
                    </div>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 text-sm">
                        {node.detail ? <p className="whitespace-pre-wrap text-muted-foreground">{node.detail}</p> : <p className="text-muted-foreground">Sem descrição.</p>}
                        {showFiles && node.files.length > 0 && (
                            <section className="space-y-1">
                                <h4 className="text-xs font-medium text-muted-foreground">Arquivos</h4>
                                <ul className="space-y-1">
                                    {node.files.map((file) => (
                                        <li key={file} className="flex items-center gap-1.5">
                                            <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                            <code className="min-w-0 flex-1 truncate font-mono text-xs" title={file}>{file}</code>
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => void copy(file)} aria-label={`Copiar ${file}`}>
                                                <Copy className="h-3 w-3" aria-hidden />
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                        <section className="space-y-1">
                            <h4 className="text-xs font-medium text-muted-foreground">Vizinhos ({neighbors.length})</h4>
                            {neighbors.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Nenhuma ligação.</p>
                            ) : (
                                <ul className="space-y-1">
                                    {neighbors.map(({ node: other, edge, direction }) => (
                                        <li key={`${edge.id}-${direction}`}>
                                            <button type="button" className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs transition-colors hover:bg-muted" onClick={() => onSelect(other.id)}>
                                                {direction === "out" ? <ArrowRight className="h-3 w-3 shrink-0 text-primary" aria-hidden /> : <ArrowLeft className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
                                                <span className="min-w-0 flex-1 truncate">{other.label}</span>
                                                <span className="shrink-0 text-[10px] text-muted-foreground">{edge.label || ARCHITECT_EDGE_KIND_LABELS[edge.kind]}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                    {group && (
                        <div className="border-t p-2">
                            <Button type="button" variant="ghost" size="sm" className="w-full gap-1.5" onClick={() => onCollapseGroup(group.id)}>
                                <FoldVertical className="h-3.5 w-3.5" aria-hidden /> Recolher o grupo {group.label}
                            </Button>
                        </div>
                    )}
                </motion.aside>
            )}
        </AnimatePresence>
    )
}
