"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Bot, Brain, ChevronDown, GraduationCap, Pencil, Pin, PinOff, Trash2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Badge } from "@/components/ui/badge"
import { IconAction } from "@/components/ui/icon-action"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { listItem } from "@/components/motion/presets"
import { cn } from "@/lib/utils"
import { MEMORY_CONSUMERS } from "../../agents"
import type { MemoryTextLimits } from "../../memory-text"
import type { MemoryDto } from "../../types"
import { MemoryEditor } from "./MemoryEditor"

const expand = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/** Classes compartilhadas com o skeleton da lista (mesma altura e espaçamento da linha). */
export const MEMORY_ROW_CLASS = "px-3 py-2"

interface MemoryRowProps {
    memory: MemoryDto
    canEdit: boolean
    open: boolean
    editing: boolean
    limits?: MemoryTextLimits
    categories: { key: string; label: string }[]
    onToggle: () => void
    onEdit: () => void
    onCancelEdit: () => void
    onSave: (values: { texto: string; categoria: string }) => void
    onPin: (fixada: boolean) => void
    onActive: (ativa: boolean) => void
    onDelete: () => void
}

const isAgentOrigin = (memory: MemoryDto) => Boolean(memory.origin && (MEMORY_CONSUMERS as readonly string[]).includes(memory.origin.source))

/**
 * Uma memória: resumo (do Redator; a primeira frase enquanto ele não responde), categoria, selos
 * "Fixada" e da origem; clicar expande o texto. Ações: fixar/desafixar, Ativo/Inativo (inativa fica
 * esmaecida, depois das ativas), editar e excluir de vez.
 */
export function MemoryRow({ memory, canEdit, open, editing, limits, categories, onToggle, onEdit, onCancelEdit, onSave, onPin, onActive, onDelete }: MemoryRowProps) {
    const unconfirmed = memory.id.startsWith("pendente-")
    const categoryLabel = categories.find((item) => item.key === memory.categoria)?.label ?? memory.categoria
    return (
        <motion.li layout="position" variants={listItem} initial="hidden" animate="visible" exit="exit" className={cn(MEMORY_ROW_CLASS, !memory.ativa && "opacity-60")} data-testid="memory-row" data-active={memory.ativa ? "true" : "false"}>
            <div className="flex items-start gap-2">
                <button type="button" className="flex min-w-0 flex-1 items-start gap-2 py-1 text-left" aria-expanded={open} onClick={onToggle}>
                    {isAgentOrigin(memory) ? <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-label="Gravada pelo agente" /> : <Brain className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="min-w-0 break-words text-sm" data-testid="memory-summary">
                            {memory.resumo}
                        </span>
                        {memory.resumoPendente && (
                            <span className="flex items-center gap-2" aria-label="O Redator está resumindo a memória">
                                <Skeleton className="h-3 w-1/2" />
                            </span>
                        )}
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                        {memory.fixada && (
                            <Badge variant="secondary" className="gap-1 text-[10px]" data-testid="memory-pinned">
                                <Pin className="h-3 w-3" aria-hidden /> Fixada
                            </Badge>
                        )}
                        {memory.categoria && (
                            <Badge variant="outline" className="text-[10px]" data-testid="memory-category">
                                {categoryLabel}
                            </Badge>
                        )}
                        {memory.origin && (
                            <Badge variant="secondary" className="gap-1 text-[10px]" title={`Gravada por ${memory.origin.label}`}>
                                {isAgentOrigin(memory) ? <Bot className="h-3 w-3" aria-hidden /> : <GraduationCap className="h-3 w-3" aria-hidden />} {memory.origin.label}
                            </Badge>
                        )}
                    </span>
                    <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="mt-0.5 shrink-0 text-muted-foreground">
                        <ChevronDown className="h-4 w-4" aria-hidden />
                    </motion.span>
                </button>
                {canEdit && !unconfirmed && (
                    <div className="flex shrink-0 items-center gap-0.5">
                        <Switch checked={memory.ativa} onCheckedChange={onActive} className="scale-75" aria-label={memory.ativa ? "Inativar memória" : "Ativar memória"} title={memory.ativa ? "Ativa: clique para inativar" : "Inativa: clique para ativar"} />
                        <IconAction icon={memory.fixada ? PinOff : Pin} label={memory.fixada ? "Desafixar memória" : "Fixar memória"} onClick={() => onPin(!memory.fixada)} />
                        <IconAction icon={Pencil} label="Editar memória" onClick={onEdit} />
                        <IconAction icon={Trash2} label="Excluir memória" tone="danger" onClick={onDelete} />
                    </div>
                )}
            </div>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div key="body" {...expand} className="overflow-hidden">
                        <div className="pt-2">
                            {editing ? (
                                <MemoryEditor label="Editar memória" initial={{ texto: memory.texto, categoria: memory.categoria }} limits={limits} categories={categories} onCancel={onCancelEdit} onSave={onSave} />
                            ) : (
                                <>
                                    <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm">{memory.texto}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {memory.autor ?? "—"} · {formatDistanceToNow(new Date(memory.atualizadaEm), { addSuffix: true, locale: ptBR })}
                                        {!memory.ativa && " · inativa (fora do contexto)"}
                                    </p>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.li>
    )
}
