"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { Check, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface ActiveItemRowProps {
    label: string
    sublabel?: ReactNode
    /** Item em uso: selo "Em uso" no lugar do botão de ativar. */
    active: boolean
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

/**
 * Linha de uma lista "um item em uso" (contas dos providers do OpenCode, chaves de API dos provedores
 * de IA): nome, selo "Em uso" ou botão de ativar, renomear e remover.
 */
export function ActiveItemRow({ label, sublabel, active, activateLabel, activateDisabled, onActivate, onRename, onRemove, actions, editing, children }: ActiveItemRowProps) {
    return (
        <motion.li layout="position" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="rounded-md border bg-background px-3 py-2">
            {editing ?? (
                <div className="flex flex-wrap items-center gap-2">
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
                    ) : (
                        <Button type="button" size="sm" variant="secondary" disabled={activateDisabled} onClick={onActivate}>
                            {activateLabel}
                        </Button>
                    )}
                    {actions}
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Renomear ${label}`} title="Renomear" onClick={onRename}>
                        <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Remover ${label}`} title="Remover" onClick={onRemove}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                </div>
            )}
            {children}
        </motion.li>
    )
}
