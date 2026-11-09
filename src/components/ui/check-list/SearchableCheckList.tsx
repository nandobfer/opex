"use client"

import { useMemo, useState, type ReactNode } from "react"
import Fuse from "fuse.js"
import { AnimatePresence, motion } from "framer-motion"
import { SearchInput } from "@/components/list/SearchInput"
import { VirtualizedRows } from "@/components/list/VirtualizedRows"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

export interface CheckListItem {
    key: string
    label: string
    description?: string | null
    /** Selos/ícones ao lado do nome (ex.: "Nativa", situação). */
    meta?: ReactNode
    icon?: ReactNode
}

interface SearchableCheckListProps {
    items: readonly CheckListItem[]
    /** Chaves liberadas (inclusive as que não estão mais na lista). */
    value: readonly string[]
    onChange: (next: string[]) => void
    searchPlaceholder: string
    emptyText: string
    /** Rótulo das chaves salvas que não estão na lista (padrão "(não encontrada)"). */
    missingLabel?: string
    /** Busca só com mais itens que isto (padrão 6). */
    searchAbove?: number
    ariaLabel: string
}

const SEARCH_KEYS = ["label", "key", "description"]

function Row({ label, description, meta, icon, checked, missing, onToggle }: { label: string; description?: string | null; meta?: ReactNode; icon?: ReactNode; checked: boolean; missing?: string; onToggle: (checked: boolean) => void }) {
    return (
        <div className={cn("flex items-center justify-between gap-3 rounded-md border p-2", missing && "border-dashed opacity-80")}>
            <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm">
                    {icon}
                    <code className="truncate">{label}</code>
                    {missing ? <span className="text-xs text-warning">{missing}</span> : null}
                    {meta}
                </span>
                {description ? <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{description}</span> : null}
            </span>
            <Switch aria-label={`Liberar ${label}`} checked={checked} onCheckedChange={onToggle} />
        </div>
    )
}

/**
 * Lista de liga/desliga com busca (OPE-153): skills e MCPs liberados a um agente. As chaves salvas que
 * sumiram da origem aparecem marcadas (ex.: "(não encontrada)") para o dono desligar, sem impedir o
 * salvamento. Virtualiza acima de 50 itens.
 */
export function SearchableCheckList({ items, value, onChange, searchPlaceholder, emptyText, missingLabel = "(não encontrada)", searchAbove = 6, ariaLabel }: SearchableCheckListProps) {
    const [term, setTerm] = useState("")
    const selected = useMemo(() => new Set(value), [value])
    const known = useMemo(() => new Set(items.map((item) => item.key)), [items])
    const missing = value.filter((key) => !known.has(key))
    const fuse = useMemo(() => new Fuse([...items], { keys: SEARCH_KEYS, threshold: 0.35, ignoreLocation: true }), [items])
    const visible = term.trim() ? fuse.search(term.trim()).map((result) => result.item) : items
    const toggle = (key: string, checked: boolean) => onChange(checked ? [...value.filter((item) => item !== key), key] : value.filter((item) => item !== key))

    return (
        <div className="space-y-2">
            {items.length > searchAbove ? <SearchInput value={term} onChange={setTerm} placeholder={searchPlaceholder} label={searchPlaceholder} /> : null}
            <AnimatePresence initial={false}>
                {missing.map((key) => (
                    <motion.div key={`missing-${key}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
                        <Row label={key} checked missing={missingLabel} onToggle={(checked) => toggle(key, checked)} />
                    </motion.div>
                ))}
            </AnimatePresence>
            {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{emptyText}</p>
            ) : visible.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nada encontrado com essa busca.</p>
            ) : (
                <div role="list" aria-label={ariaLabel}>
                    <VirtualizedRows
                        rows={visible}
                        rowKey={(item) => item.key}
                        rowClassName="pb-2 last:pb-0"
                        estimateSize={52}
                        renderRow={(item) => <Row label={item.label} description={item.description} meta={item.meta} icon={item.icon} checked={selected.has(item.key)} onToggle={(checked) => toggle(item.key, checked)} />}
                    />
                </div>
            )}
        </div>
    )
}
