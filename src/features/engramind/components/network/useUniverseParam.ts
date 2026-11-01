"use client"

import { useCallback, useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { UniverseRef } from "../../network/types"

export const UNIVERSE_PARAM = "universo"

/** `canal:<slug>` / `agente:<app/agente>` ↔ referência do universo (inválido → `null`). */
export function parseUniverse(value: string | null | undefined): UniverseRef | null {
    if (!value) return null
    const [kind, ...rest] = value.split(":")
    const id = rest.join(":").trim()
    if (!id) return null
    if (kind === "canal") return { kind: "channel", slug: id }
    if (kind === "agente") return { kind: "agent", id }
    return null
}

export const formatUniverse = (ref: UniverseRef): string => (ref.kind === "channel" ? `canal:${ref.slug}` : `agente:${ref.id}`)

/**
 * O universo aberto fica no endereço (`?universo=`): o link pode ser compartilhado e o voltar do
 * navegador funciona. `Esc` volta à visão inicial (fora de diálogos e campos).
 */
export function useUniverseParam(options: { escapeEnabled: boolean }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const universe = parseUniverse(searchParams.get(UNIVERSE_PARAM))
    const navigate = useCallback(
        (ref: UniverseRef | null) => {
            const params = new URLSearchParams(searchParams.toString())
            if (ref) params.set(UNIVERSE_PARAM, formatUniverse(ref))
            else params.delete(UNIVERSE_PARAM)
            const query = params.toString()
            router.push(query ? `${pathname}?${query}` : pathname, { scroll: false })
        },
        [router, pathname, searchParams],
    )
    const back = useCallback(() => navigate(null), [navigate])
    useEffect(() => {
        if (!universe || !options.escapeEnabled) return
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) return
            const target = event.target
            if (target instanceof Element && target.closest("input, textarea, [role='dialog'], [role='alertdialog']")) return
            back()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [universe, options.escapeEnabled, back])
    return { universe, open: navigate, back }
}
