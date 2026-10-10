"use client"

import { useCallback, useState } from "react"

/**
 * Abas com estado **local** (não vão à URL), com o mesmo formato de retorno de
 * `useIntegrationTab` para reusar `IntegrationTabs` (troca animada e "Descartar alterações?").
 *
 * Use quando a página já reserva `?aba` para outro nível de abas — é o caso da aba
 * "Desenvolvimento agêntico" (`AgenticTab`), que tem abas internas dentro de `AiEditorForm`.
 * A troca de aba com alterações não salvas abre a confirmação (`pendingTab` até confirmar).
 */
export function useLocalTabs<T extends string>(fallback: T, hasChanges: boolean, discard: () => void) {
    const [tab, setTab] = useState<T>(fallback)
    const [pendingTab, setPendingTab] = useState<T | null>(null)

    const requestTab = useCallback(
        (next: T) => {
            if (next === tab) return
            if (hasChanges) setPendingTab(next)
            else setTab(next)
        },
        [hasChanges, tab],
    )

    const confirmDiscard = useCallback(() => {
        if (!pendingTab) return
        discard()
        setTab(pendingTab)
        setPendingTab(null)
    }, [discard, pendingTab])

    return { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard: () => setPendingTab(null) }
}
