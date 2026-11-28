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
 * clique), pelo botão voltar do navegador (`popstate`) e ao fechar ou recarregar a aba (`beforeunload`).
 *
 * O voltar do navegador: com alterações, o guarda empilha uma entrada sentinela no histórico (mesma URL e o
 * mesmo `history.state`, então o App Router continua na página). O voltar consome a sentinela; o guarda a
 * empilha de novo e pergunta. "Descartar e sair" volta duas entradas (a sentinela e a página). Sem alterações
 * (ex.: depois de salvar), o voltar que consome a sentinela segue direto para a página anterior.
 *
 * Saída por Cancelar (`guard`) ou por link interno: com a sentinela no histórico, ela é consumida antes
 * (`history.back()`) e a navegação só roda no `popstate` seguinte, para o editor não ficar duplicado no
 * histórico (um voltar a partir do destino chega ao editor, e o seguinte à página anterior a ele).
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

    const sentinel = useRef(false)
    // Navegação confirmada esperando a sentinela sair do histórico.
    const afterBack = useRef<(() => void) | null>(null)
    // A saída criada pelo voltar do navegador (ela mesma cuida da sentinela).
    const fromHistory = useRef<(() => void) | null>(null)
    useEffect(() => {
        if (!dirty || sentinel.current) return
        window.history.pushState(window.history.state, "", window.location.href)
        sentinel.current = true
    }, [dirty])

    useEffect(() => {
        const onPopState = () => {
            const next = afterBack.current
            if (next) {
                afterBack.current = null
                next()
                return
            }
            if (!sentinel.current) return
            if (!dirtyRef.current) {
                // A sentinela foi consumida sem alterações pendentes: segue para a página anterior.
                sentinel.current = false
                window.history.back()
                return
            }
            window.history.pushState(window.history.state, "", window.location.href)
            const leaveByHistory = () => {
                sentinel.current = false
                window.history.go(-2)
            }
            fromHistory.current = leaveByHistory
            setPending(() => leaveByHistory)
        }
        window.addEventListener("popstate", onPopState)
        return () => window.removeEventListener("popstate", onPopState)
    }, [])

    /** Sai da página, tirando antes a sentinela do histórico (menos na saída que veio do próprio voltar). */
    const leave = useCallback((action: () => void) => {
        if (fromHistory.current === action || !sentinel.current) {
            fromHistory.current = null
            action()
            return
        }
        sentinel.current = false
        afterBack.current = action
        window.history.back()
    }, [])

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

    const guard = useCallback(
        (action: () => void) => {
            if (dirtyRef.current) setPending(() => action)
            else leave(action)
        },
        [leave],
    )

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
                if (action) leave(action)
            }}
        />
    )
    return { guard, dialog }
}
