"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const STORAGE_KEY = "opex-sidebar-closed-sections"

function readClosed(): string[] {
    try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []
    } catch {
        return []
    }
}

/**
 * Seções do menu abertas/fechadas (todas abertas por padrão), salvas no navegador. Storage indisponível só deixa de lembrar a escolha.
 *
 * `activeSectionId`: seção da página atual — abre ao navegar para ela (o item ativo nunca fica
 * escondido), sem alterar a preferência salva.
 */
export function useNavSectionsState(activeSectionId?: string) {
    const [closed, setClosed] = useState<string[]>([])
    const activeRef = useRef(activeSectionId)

    useEffect(() => {
        activeRef.current = activeSectionId
        if (activeSectionId) queueMicrotask(() => setClosed((current) => current.filter((id) => id !== activeSectionId)))
    }, [activeSectionId])

    useEffect(() => {
        queueMicrotask(() => setClosed(readClosed().filter((id) => id !== activeRef.current)))
    }, [])

    const toggle = useCallback((id: string) => {
        setClosed((current) => {
            const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
            } catch {
                // Preferência visual: sem storage, a escolha vale só nesta sessão.
            }
            return next
        })
    }, [])

    const isOpen = useCallback((id: string) => !closed.includes(id), [closed])

    return { isOpen, toggle }
}
