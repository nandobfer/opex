"use client"

import type { MouseEvent, ReactNode } from "react"
import { motion } from "framer-motion"
import { Check, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Dimensões de um card no skeleton das listas (mesma altura do card com nome e sublabel). */
export const ACTIVE_ITEM_ROW_SKELETON_CLASS = "h-[62px] w-full rounded-lg"

interface ActiveItemRowProps {
    label: string
    sublabel?: ReactNode
    /** Item em uso: selo "Em uso", destaque e card sem ação de ativar. */
    active: boolean
    /** Rótulo acessível do card clicável, com o nome do item (ex.: "Usar a conta Pessoal"). */
    activateLabel: string
    activateDisabled?: boolean
    onActivate: () => void
    onRename: () => void
    onRemove: () => void
    /** Ações extras antes de renomear (ex.: substituir o segredo). */
    actions?: ReactNode
    /** Conteúdo no lugar da linha (ex.: o `InlineRenameField` durante a edição). */
    editing?: ReactNode
    /** Avisos abaixo da linha e diálogos do item. */
    children?: ReactNode
}

const stop = (event: MouseEvent) => event.stopPropagation()

/**
 * Card de uma lista "um item em uso" (contas dos providers do OpenCode, chaves de API dos provedores
 * de IA). O card inteiro ativa o item: um `<button>` real cobre o card (Tab + Enter/Espaço nativos) e
 * as ações ficam numa camada acima dele, sem botão dentro de botão. As ações aparecem no hover ou no
 * foco do card (sempre visíveis em telas de toque) e continuam no DOM para o teclado.
 */
export function ActiveItemRow({ label, sublabel, active, activateLabel, activateDisabled, onActivate, onRename, onRemove, actions, editing, children }: ActiveItemRowProps) {
    const clickable = !active && !editing
    return (
        <motion.li
            layout="position"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            aria-busy={clickable && activateDisabled ? true : undefined}
            data-active={active ? "true" : undefined}
            className={cn(
                "group relative rounded-lg border bg-card px-3.5 py-3 transition-colors",
                active ? "border-primary/60 bg-primary/5" : clickable && "hover:border-primary/40 hover:bg-accent/40 focus-within:border-primary/40",
                clickable && activateDisabled && "opacity-70",
            )}
        >
            {active ? <span className="absolute inset-y-2.5 left-0 w-0.5 rounded-full bg-primary" aria-hidden /> : null}
            {clickable ? (
                <button
                    type="button"
                    aria-label={activateLabel}
                    title={activateLabel}
                    disabled={activateDisabled}
                    onClick={onActivate}
                    className="absolute inset-0 cursor-pointer rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-progress"
                />
            ) : null}
            {editing ?? (
                <div className="pointer-events-none relative flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{label}</span>
                        {sublabel ? <span className="block text-[11px] text-muted-foreground">{sublabel}</span> : null}
                    </span>
                    {active ? (
                        <motion.span key="active" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.18 }}>
                            <Badge className="gap-1">
                                <Check className="h-3 w-3" aria-hidden />
                                Em uso
                            </Badge>
                        </motion.span>
                    ) : null}
                    <div
                        data-slot="item-actions"
                        onClick={stop}
                        className="pointer-events-auto relative z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                    >
                        {actions}
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Renomear ${label}`} title="Renomear" onClick={onRename}>
                            <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Remover ${label}`} title="Remover" onClick={onRemove}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                    </div>
                </div>
            )}
            <div className="pointer-events-none relative">{children}</div>
        </motion.li>
    )
}
