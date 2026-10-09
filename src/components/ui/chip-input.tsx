"use client"

import { useId, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { normalizeText } from "@/lib/text"
import { cn } from "@/lib/utils"
import { AutocompleteList, optionId, useListNavigation, type AutocompleteOption } from "./autocomplete-list"
import { ChipList } from "./removable-chip"

interface ChipInputProps {
    value: readonly string[]
    onChange: (value: string[]) => void
    id?: string
    placeholder?: string
    disabled?: boolean
    /** Sugestões para o texto digitado (ex.: vindas do servidor). O `value` da opção é adicionado. */
    suggestions?: readonly AutocompleteOption[]
    /** Avisa o texto digitado, para buscar sugestões. */
    onQueryChange?: (query: string) => void
    suggestionsFooter?: string
    max?: number
    className?: string
    "aria-label"?: string
    "aria-describedby"?: string
}

/** Divide o texto colado ("A, B; C") em valores, sem vazios. */
export const splitValues = (text: string) => text.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean)

/**
 * Valores livres: digita e Enter (ou "Adicionar") vira um chip ABAIXO do campo, com "X" para
 * remover. Repetidos são ignorados sem considerar acento/caixa. Sugestões opcionais.
 */
export function ChipInput({ value, onChange, id, placeholder, disabled, suggestions = [], onQueryChange, suggestionsFooter, max, className, ...aria }: ChipInputProps) {
    const autoId = useId()
    const inputId = id ?? `${autoId}-input`
    const listId = `${autoId}-list`
    const [text, setText] = useState("")
    const visible = text.trim().length >= 2 ? suggestions.filter((option) => !value.some((item) => normalizeText(item) === normalizeText(option.value))) : []
    const nav = useListNavigation(visible.length)
    const full = max !== undefined && value.length >= max

    const add = (items: string[]) => {
        const next = [...value]
        for (const item of items) {
            if (max !== undefined && next.length >= max) break
            if (!next.some((current) => normalizeText(current) === normalizeText(item))) next.push(item)
        }
        if (next.length !== value.length) onChange(next)
        setText("")
        onQueryChange?.("")
        nav.setActiveIndex(-1)
    }

    return (
        <div className={cn("space-y-2", className)}>
            <div
                className="relative flex gap-2"
                onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) nav.setOpen(false)
                }}
            >
                <input
                    id={inputId}
                    type="text"
                    role="combobox"
                    autoComplete="off"
                    aria-expanded={nav.open && visible.length > 0}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={nav.open && nav.activeIndex >= 0 ? optionId(listId, nav.activeIndex) : undefined}
                    aria-label={aria["aria-label"]}
                    aria-describedby={aria["aria-describedby"]}
                    disabled={disabled || full}
                    value={text}
                    placeholder={full ? "Limite atingido" : placeholder}
                    onChange={(event) => {
                        setText(event.target.value)
                        onQueryChange?.(event.target.value)
                        nav.setOpen(true)
                        nav.setActiveIndex(-1)
                    }}
                    onPaste={(event) => {
                        const pasted = splitValues(event.clipboardData.getData("text"))
                        if (pasted.length > 1) {
                            event.preventDefault()
                            add(pasted)
                        }
                    }}
                    onKeyDown={(event) =>
                        nav.onKeyDown(event, {
                            onEnter: (index) => {
                                const option = visible[index]
                                add(option ? [option.value] : splitValues(text))
                            },
                            onBackspaceEmpty: () => value.length && onChange(value.slice(0, -1)),
                        })
                    }
                    className="flex h-9 w-full min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                />
                <Button type="button" variant="outline" onClick={() => add(splitValues(text))} disabled={disabled || full || !text.trim()}>
                    <Plus className="h-4 w-4" aria-hidden /> Adicionar
                </Button>
                <AutocompleteList
                    id={listId}
                    open={nav.open && !disabled && visible.length > 0}
                    options={visible}
                    activeIndex={nav.activeIndex}
                    footer={suggestionsFooter}
                    onPick={(option) => add([option.value])}
                    onHover={nav.setActiveIndex}
                />
            </div>
            <ChipList items={value.map((item) => ({ value: item, label: item }))} onRemove={(item) => onChange(value.filter((current) => current !== item))} disabled={disabled} aria-label="Adicionados" />
        </div>
    )
}
