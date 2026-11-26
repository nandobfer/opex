"use client"

import type { LucideIcon } from "lucide-react"
import { ChevronDown, X } from "lucide-react"
import { useCallback, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SearchPicker } from "@/components/ui/search-picker"
import { cn } from "@/lib/utils"

/** Opção do filtro. Em árvore, `parent` e `depth`; `path` é o caminho mostrado na busca. */
export interface CadastroSearchPickerOption {
    value: string
    label: string
    description?: string
    parent?: string | null
    depth?: number
    path?: string[]
}

interface CadastroSearchPickerProps {
    options: readonly CadastroSearchPickerOption[]
    selected: readonly string[]
    onSelect: (values: string[]) => void
    "aria-label": string
    placeholder?: string
    searchPlaceholder?: string
    /** Plural para o resumo ("3 slots"). */
    pluralNoun?: string
    icon?: LucideIcon
    className?: string
    /**
     * Escolhidos no topo da lista, ao vivo (OPE-197, seletores de contato). Padrão `false`: os demais filtros mantêm
     * a ordem recebida.
     */
    pinSelected?: boolean
}

const SEARCH_KEYS = ["label", "value", "description", "path"]

/**
 * Filtro de lista com busca (fuse.js) e seleção múltipla sobre o `SearchPicker` (OPE-172): gatilho com
 * o fundo do card, resumo ("Todos" / o rótulo / "3 slots"), botão de limpar e, com `parent`/`depth`,
 * opções em árvore — sem busca recuadas por nível; com busca, cada resultado no seu caminho.
 */
export function CadastroSearchPicker({ options, selected, onSelect, "aria-label": ariaLabel, placeholder = "Todos", searchPlaceholder = "Buscar...", pluralNoun = "selecionados", icon: Icon, className, pinSelected = false }: CadastroSearchPickerProps) {
    const tree = options.some((option) => option.parent !== undefined)
    const byValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options])
    const isSelected = useCallback((option: CadastroSearchPickerOption) => selected.includes(option.value), [selected])
    const toggle = (value: string) => onSelect(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])
    const summary = selected.length === 0 ? placeholder : selected.length === 1 ? (byValue.get(selected[0]!)?.label ?? selected[0]) : `${selected.length} ${pluralNoun}`

    return (
        <div className={cn("relative w-full", className)}>
            <SearchPicker
                items={options}
                getKey={(option) => option.value}
                getParentKey={tree ? (option) => option.parent ?? null : undefined}
                getDepth={tree ? (option) => option.depth ?? 0 : undefined}
                selectedKeys={selected}
                pinFirst={pinSelected ? isSelected : undefined}
                closeOnPick={false}
                onPick={(option) => toggle(option.value)}
                searchKeys={SEARCH_KEYS}
                matchTriggerWidth
                placeholder={searchPlaceholder}
                searchLabel={`Buscar ${ariaLabel.toLowerCase()}`}
                listLabel={ariaLabel}
                emptyText="Nenhuma opção"
                emptySearchText="Nenhum resultado"
                renderItem={(option, state) => (
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{option.label}</span>
                        {state.searching && option.path && option.path.length > 1 ? (
                            <span className="truncate text-[11px] text-muted-foreground">{option.path.slice(0, -1).join(" › ")}</span>
                        ) : option.description ? (
                            <span className="truncate text-[11px] text-muted-foreground">{option.description}</span>
                        ) : null}
                    </span>
                )}
                trigger={
                    <Button type="button" variant="outline" aria-label={ariaLabel} className={cn("h-10 w-full justify-start bg-transparent px-3 font-normal", selected.length > 0 && "pr-9")}>
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary opacity-50" aria-hidden />}
                            <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>{summary}</span>
                        </span>
                        {selected.length > 0 ? (
                            <Badge variant="secondary" className="ml-2 h-5 shrink-0 border-none bg-primary/10 px-1 py-0 font-mono text-[10px] text-primary">
                                {selected.length}
                            </Badge>
                        ) : (
                            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                        )}
                    </Button>
                }
            />
            {selected.length > 0 && (
                <button type="button" aria-label={`Limpar ${ariaLabel.toLowerCase()}`} onClick={() => onSelect([])} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" aria-hidden />
                </button>
            )}
        </div>
    )
}
