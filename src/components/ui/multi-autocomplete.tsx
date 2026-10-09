"use client"

import { useId, useMemo, useState, type ReactNode } from "react"
import Fuse from "fuse.js"
import { ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { AutocompleteList, optionId, useListNavigation, type AutocompleteOption } from "./autocomplete-list"
import { ChipList } from "./removable-chip"

export type { AutocompleteOption } from "./autocomplete-list"

const MAX_VISIBLE = 100

interface MultiAutocompleteProps {
    options: readonly AutocompleteOption[]
    value: readonly string[]
    onChange: (value: string[]) => void
    id?: string
    placeholder?: string
    emptyText?: string
    disabled?: boolean
    loading?: boolean
    /** Texto do chip (padrão: o `label` da opção). */
    chipLabel?: (option: AutocompleteOption) => ReactNode
    /** Permite "Selecionar todas" no cabeçalho de cada grupo. */
    selectableGroups?: boolean
    /** Tira da lista as opções já escolhidas (ficam só nos chips). */
    hideSelected?: boolean
    className?: string
    "aria-label"?: string
    "aria-describedby"?: string
}

/**
 * Escolha múltipla em lista longa: digita para filtrar (fuse.js, tolera erro de digitação),
 * escolhe com clique ou Enter e os escolhidos viram chips ABAIXO do campo, cada um com "X".
 * Backspace no campo vazio remove o último. Largura total.
 */
export function MultiAutocomplete({
    options,
    value,
    onChange,
    id,
    placeholder = "Digite para buscar…",
    emptyText = "Nenhum resultado",
    disabled,
    loading,
    chipLabel,
    selectableGroups,
    hideSelected,
    className,
    ...aria
}: MultiAutocompleteProps) {
    const autoId = useId()
    const inputId = id ?? `${autoId}-input`
    const listId = `${autoId}-list`
    const [term, setTerm] = useState("")
    const pickable = useMemo(() => (hideSelected ? options.filter((option) => !value.includes(option.value)) : options), [hideSelected, options, value])
    const fuse = useMemo(() => new Fuse(pickable as AutocompleteOption[], { keys: ["label", "value", "description", "group"], threshold: 0.35, ignoreLocation: true }), [pickable])
    const filtered = useMemo(() => (term.trim() ? fuse.search(term.trim()).map((result) => result.item) : [...pickable]).slice(0, MAX_VISIBLE), [fuse, pickable, term])
    const nav = useListNavigation(filtered.length)
    const byValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options])

    const toggle = (option: AutocompleteOption) => {
        onChange(value.includes(option.value) ? value.filter((item) => item !== option.value) : [...value, option.value])
        setTerm("")
    }
    const selectGroup = (group: string) => {
        const ids = options.filter((option) => option.group === group).map((option) => option.value)
        onChange([...new Set([...value, ...ids])])
    }
    const chips = value.map((item) => {
        const option = byValue.get(item)
        return { value: item, label: option ? (chipLabel?.(option) ?? option.label) : item, text: option?.label ?? item }
    })

    return (
        <div className={cn("space-y-2", className)}>
            <div
                className="relative"
                onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) nav.setOpen(false)
                }}
            >
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                    id={inputId}
                    type="text"
                    role="combobox"
                    autoComplete="off"
                    aria-expanded={nav.open}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={nav.open && nav.activeIndex >= 0 ? optionId(listId, nav.activeIndex) : undefined}
                    aria-label={aria["aria-label"]}
                    aria-describedby={aria["aria-describedby"]}
                    disabled={disabled}
                    value={term}
                    placeholder={loading ? "Carregando…" : placeholder}
                    onFocus={() => nav.setOpen(true)}
                    onClick={() => nav.setOpen(true)}
                    onChange={(event) => {
                        setTerm(event.target.value)
                        nav.setOpen(true)
                        nav.setActiveIndex(event.target.value.trim() ? 0 : -1)
                    }}
                    onKeyDown={(event) =>
                        nav.onKeyDown(event, {
                            onEnter: (index) => {
                                const option = filtered[index]
                                if (option) toggle(option)
                            },
                            onBackspaceEmpty: () => value.length && onChange(value.slice(0, -1)),
                        })
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-9 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                />
                <ChevronDown className={cn("pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-transform", nav.open && "rotate-180")} aria-hidden />
                <AutocompleteList
                    id={listId}
                    open={nav.open && !disabled}
                    options={filtered}
                    activeIndex={nav.activeIndex}
                    selected={value}
                    emptyText={emptyText}
                    onPick={toggle}
                    onHover={nav.setActiveIndex}
                    groupAction={
                        selectableGroups
                            ? (group) => (
                                  <button type="button" onClick={() => selectGroup(group)} className="font-medium text-primary hover:underline">
                                      Selecionar todas
                                  </button>
                              )
                            : undefined
                    }
                />
            </div>
            {value.length > 0 && (
            <div className="flex flex-wrap items-start justify-between gap-2">
                <ChipList items={chips} onRemove={(item) => onChange(value.filter((current) => current !== item))} disabled={disabled} aria-label="Selecionados" className="flex-1" />
                {value.length > 1 && !disabled && (
                    <button type="button" onClick={() => onChange([])} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                        Remover todos ({value.length})
                    </button>
                )}
            </div>
            )}
        </div>
    )
}
