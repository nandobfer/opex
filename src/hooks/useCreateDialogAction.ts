"use client"

import { useCallback, useSyncExternalStore } from "react"

const CREATE_DIALOG_ACTION_EVENT = "opex:create-dialog-action-change"

function subscribe(onStoreChange: () => void): () => void {
    window.addEventListener("popstate", onStoreChange)
    window.addEventListener(CREATE_DIALOG_ACTION_EVENT, onStoreChange)

    return () => {
        window.removeEventListener("popstate", onStoreChange)
        window.removeEventListener(CREATE_DIALOG_ACTION_EVENT, onStoreChange)
    }
}

function getSnapshot(): string {
    return window.location.search
}

function getServerSnapshot(): string {
    return ""
}

export function hasCreateDialogAction(search: string): boolean {
    return new URLSearchParams(search).get("action") === "create"
}

export function createDialogActionUrl(
    pathname: string,
    search: string,
    hash: string,
    active: boolean,
): string {
    const params = new URLSearchParams(search)

    if (active) params.set("action", "create")
    else if (params.get("action") === "create") params.delete("action")

    const nextSearch = params.toString()
    return `${pathname}${nextSearch ? `?${nextSearch}` : ""}${hash}`
}

/**
 * Sincroniza dialogs de criação dos cadastros com `?action=create` sem depender de
 * `useSearchParams`, permitindo que listas usadas fora de um Suspense preservem SSR.
 */
export function useCreateDialogAction() {
    const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
    const isCreateRequested = hasCreateDialogAction(search)

    const setCreateRequested = useCallback((active: boolean) => {
        const nextUrl = createDialogActionUrl(
            window.location.pathname,
            window.location.search,
            window.location.hash,
            active,
        )

        window.history.replaceState(window.history.state, "", nextUrl)
        window.dispatchEvent(new Event(CREATE_DIALOG_ACTION_EVENT))
    }, [])

    return {
        isCreateRequested,
        requestCreate: useCallback(() => setCreateRequested(true), [setCreateRequested]),
        clearCreateRequest: useCallback(() => setCreateRequested(false), [setCreateRequested]),
    }
}
