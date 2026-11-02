"use client"

import { useEffect, useState } from "react"

/**
 * Campo de busca com espera de digitação: o valor local muda na hora (o campo responde) e só chega a
 * `onChange` depois de `delayMs` sem digitar. Mudanças externas (Limpar, remover chip, voltar no
 * navegador) substituem o valor local.
 */
export function useDebouncedSearch(external: string, onChange: ((value: string) => void) | undefined, delayMs: number): [string, (value: string) => void] {
    const [local, setLocal] = useState(external)
    const [lastExternal, setLastExternal] = useState(external)
    if (lastExternal !== external) {
        setLastExternal(external)
        setLocal(external)
    }
    useEffect(() => {
        if (!onChange || local === external) return
        const timer = setTimeout(() => onChange(local), delayMs)
        return () => clearTimeout(timer)
    }, [local, external, onChange, delayMs])
    return [local, setLocal]
}
