"use client"

import { useCallback, useMemo, useRef, useState } from "react"

export type SelectionState = boolean | "mixed"

/**
 * Seleção de tarefas compartilhada entre tabela e kanban. Só vale para as tarefas visíveis: o que
 * sai do filtro (ou some do quadro) deixa de estar selecionado. Não é salva no navegador.
 */
export function useTaskSelection(visibleIds: readonly string[]) {
    const [raw, setRaw] = useState<ReadonlySet<string>>(() => new Set())
    const anchor = useRef<string | null>(null)

    const visible = useMemo(() => new Set(visibleIds), [visibleIds])
    const selected = useMemo(() => {
        const next = new Set<string>()
        for (const id of raw) if (visible.has(id)) next.add(id)
        return next as ReadonlySet<string>
    }, [raw, visible])
    // Descarta (na própria renderização) o que deixou de estar visível.
    if (selected.size !== raw.size) setRaw(selected)

    /**
     * Marca/desmarca um item. Com `shift` e uma ordem (`ordered`), aplica o novo estado a todo o
     * intervalo entre o último item clicado e este.
     */
    const toggle = useCallback(
        (id: string, options: { shift?: boolean; ordered?: readonly string[] } = {}) => {
            // Lido agora: o atualizador do estado roda depois (e o âncora já terá mudado).
            const previousAnchor = anchor.current
            setRaw((prev) => {
                const next = new Set(prev)
                const checked = !prev.has(id)
                const from = previousAnchor && options.shift && options.ordered ? options.ordered.indexOf(previousAnchor) : -1
                const to = options.ordered ? options.ordered.indexOf(id) : -1
                const range = from !== -1 && to !== -1 ? options.ordered!.slice(Math.min(from, to), Math.max(from, to) + 1) : [id]
                for (const item of range) {
                    if (checked) next.add(item)
                    else next.delete(item)
                }
                return next
            })
            anchor.current = id
        },
        [],
    )

    const setMany = useCallback((ids: readonly string[], checked: boolean) => {
        setRaw((prev) => {
            const next = new Set(prev)
            for (const id of ids) {
                if (checked) next.add(id)
                else next.delete(id)
            }
            return next
        })
    }, [])

    const remove = useCallback((ids: readonly string[]) => setMany(ids, false), [setMany])

    const clear = useCallback(() => {
        anchor.current = null
        setRaw(new Set())
    }, [])

    const stateOf = useCallback(
        (ids: readonly string[]): SelectionState => {
            let count = 0
            for (const id of ids) if (selected.has(id)) count++
            return count === 0 ? false : count === ids.length ? true : "mixed"
        },
        [selected],
    )

    return { selected, toggle, setMany, remove, clear, stateOf }
}

export type TaskSelection = ReturnType<typeof useTaskSelection>
