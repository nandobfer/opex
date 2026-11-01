"use client"

import { useMemo, useRef } from "react"

/**
 * Remoções confirmadas nesta tela (excluir ou mover): o universo não avisa "excluída por outra origem"
 * quando a memória aberta sai por uma ação daqui. A marca entra só na **confirmação** (cancelar o
 * diálogo não marca), sai se a ação falhar e é esquecida quando o item deixa o universo.
 */
export interface LocalRemovals {
    mark: (id: string) => void
    forget: (id: string) => void
    has: (id: string) => boolean
}

export function useLocalRemovals(): LocalRemovals {
    const ids = useRef(new Set<string>())
    return useMemo(
        () => ({
            mark: (id: string) => void ids.current.add(id),
            forget: (id: string) => void ids.current.delete(id),
            has: (id: string) => ids.current.has(id),
        }),
        [],
    )
}
