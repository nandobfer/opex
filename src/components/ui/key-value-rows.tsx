"use client"

import { useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export interface KeyValueRow {
    key: string
    value: string
}

interface Props<T extends KeyValueRow> {
    rows: readonly T[]
    onChange: (rows: T[]) => void
    /** Nome do item nos rótulos acessíveis ("variável" → "Nome da variável 1"). */
    itemLabel: string
    keyPlaceholder?: string
    valuePlaceholder?: (row: T, index: number) => string
    /** Linha alterada no valor (ex.: tirar a marca "manter o salvo"). */
    onValueEdit?: (row: T, value: string) => T
    /** Texto abaixo da linha. */
    hint?: (row: T, index: number) => ReactNode
    /** Rótulo do gênero do item: "Remover a variável 1" / "Remover o label 1". */
    article?: "a" | "o"
}

/**
 * Chaves estáveis das linhas de uma lista sem id (para as animações de entrada e saída): linhas novas no
 * fim ganham chaves novas; `removeAt` tira a chave da linha removida; uma lista menor vinda de fora refaz todas.
 */
export function useRowIds(length: number): {
    ids: number[]
    removeAt: (index: number) => void
} {
    const [state, setState] = useState(() => ({
        ids: Array.from({ length }, (_, index) => index + 1),
        next: length + 1,
    }))
    let current = state
    if (state.ids.length !== length) {
        const grow = state.ids.length < length
        const fresh = grow ? length - state.ids.length : length
        current = {
            ids: [...(grow ? state.ids : []), ...Array.from({ length: fresh }, (_, index) => state.next + index)],
            next: state.next + fresh,
        }
        setState(current)
    }
    return {
        ids: current.ids,
        removeAt: (index) =>
            setState((previous) => ({
                ...previous,
                ids: previous.ids.filter((_, position) => position !== index),
            })),
    }
}

/** Classe da linha (o skeleton usa a mesma). */
export const KEY_VALUE_ROW = "flex gap-2"
const FIELD = "flex-1 font-mono"

/**
 * Linhas de nome e valor (variáveis, labels, environment), controladas, com entrada e saída animadas.
 * Os ids das linhas acompanham adições e remoções; uma troca externa da lista (ex.: importar) refaz os ids.
 */
export function KeyValueRows<T extends KeyValueRow>({ rows, onChange, itemLabel, keyPlaceholder = "NOME", valuePlaceholder, onValueEdit, hint, article = "a" }: Props<T>) {
    const ids = useRowIds(rows.length)
    const update = (index: number, row: T) => onChange(rows.map((item, position) => (position === index ? row : item)))
    const remove = (index: number) => {
        ids.removeAt(index)
        onChange(rows.filter((_, position) => position !== index))
    }

    return (
        <AnimatePresence initial={false}>
            {rows.map((row, index) => (
                <motion.div key={ids.ids[index]} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-1">
                    <div className={KEY_VALUE_ROW}>
                        <Input aria-label={`Nome d${article} ${itemLabel} ${index + 1}`} className={FIELD} placeholder={keyPlaceholder} value={row.key} onChange={(event) => update(index, { ...row, key: event.target.value })} />
                        <Input
                            aria-label={`Valor d${article} ${itemLabel} ${index + 1}`}
                            autoComplete="off"
                            spellCheck={false}
                            className={FIELD}
                            placeholder={valuePlaceholder?.(row, index) ?? "valor"}
                            value={row.value}
                            onChange={(event) => update(index, onValueEdit ? onValueEdit({ ...row, value: event.target.value }, event.target.value) : { ...row, value: event.target.value })}
                        />
                        <Button type="button" variant="ghost" size="icon" aria-label={`Remover ${article} ${itemLabel} ${index + 1}`} onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                    </div>
                    {hint?.(row, index)}
                </motion.div>
            ))}
        </AnimatePresence>
    )
}
