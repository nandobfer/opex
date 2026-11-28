"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

/** Link interno do app que o guarda intercepta (mesma origem, sem modificador nem nova aba). */
function internalHref(event: MouseEvent): string | null {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
    const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.dataset.guardSkip !== undefined) return null
    const href = anchor.getAttribute("href") ?? ""
    if (!href.startsWith("/") || href.startsWith("//")) return null
    return href
}

/**
 * Guarda de alterações não salvas de uma página de formulário. Com alterações, pede "Descartar
 * alterações?" antes de sair pelo voltar/Cancelar (`guard`), por um link interno do app (captura do
 * clique) e ao fechar ou recarregar a aba (`beforeunload`). Os botões voltar/avançar do navegador não
 * passam pelo guarda (o App Router não oferece interceptação).
 */
export function useUnsavedChangesGuard(dirty: boolean): { guard: (action: () => void) => void; dialog: ReactNode } {
    const router = useRouter()
    const [pending, setPending] = useState<(() => void) | null>(null)
    const dirtyRef = useRef(dirty)
    useEffect(() => {
        dirtyRef.current = dirty
    }, [dirty])

    useEffect(() => {
        if (!dirty) return
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            event.returnValue = ""
        }
        window.addEventListener("beforeunload", onBeforeUnload)
        return () => window.removeEventListener("beforeunload", onBeforeUnload)
    }, [dirty])

    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            if (!dirtyRef.current) return
            const href = internalHref(event)
            if (!href) return
            event.preventDefault()
            event.stopPropagation()
            setPending(() => () => router.push(href))
        }
        document.addEventListener("click", onClick, true)
        return () => document.removeEventListener("click", onClick, true)
    }, [router])

    const guard = useCallback((action: () => void) => {
        if (dirtyRef.current) setPending(() => action)
        else action()
    }, [])

    const dialog = (
        <ConfirmDialog
            open={pending !== null}
            onOpenChange={(open) => !open && setPending(null)}
            title="Descartar alterações?"
            description="Há alterações não salvas nesta página. Ao sair, elas serão descartadas."
            confirmLabel="Descartar e sair"
            cancelLabel="Continuar editando"
            variant="destructive"
            onConfirm={() => {
                const action = pending
                dirtyRef.current = false
                setPending(null)
                action?.()
            }}
        />
    )
    return { guard, dialog }
}
