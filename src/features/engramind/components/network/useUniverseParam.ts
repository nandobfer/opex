"use client"

import { useCallback, useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { UniverseRef } from "../../network/types"

export const UNIVERSE_PARAM = "universo"
/** App aberto (`?app=<slug>`): a visão Agentes x canais restrita a ele (OPE-129). */
export const APP_PARAM = "app"

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
 * O universo aberto fica no endereço (`?universo=`), assim como o app (`?app=`, OPE-129): o link pode
 * ser compartilhado e o voltar do navegador funciona. Voltar e `Esc` sobem um nível (universo → app,
 * se houver → visão inicial Apps x canais), fora de diálogos modais e campos (o card da memória,
 * `data-network-card`, não é modal e não segura a tecla).
 */
export function useUniverseParam(options: { escapeEnabled: boolean }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const universe = parseUniverse(searchParams.get(UNIVERSE_PARAM))
    const app = searchParams.get(APP_PARAM)?.trim() || null
    const go = useCallback(
        (next: { app: string | null; universe: UniverseRef | null }, options: { replace?: boolean } = {}) => {
            const params = new URLSearchParams(searchParams.toString())
            if (next.app) params.set(APP_PARAM, next.app)
            else params.delete(APP_PARAM)
            if (next.universe) params.set(UNIVERSE_PARAM, formatUniverse(next.universe))
            else params.delete(UNIVERSE_PARAM)
            const query = params.toString()
            const url = query ? `${pathname}?${query}` : pathname
            // `replace`: o endereço inválido sai do histórico (o voltar do navegador não volta a ele).
            if (options.replace) router.replace(url, { scroll: false })
            else router.push(url, { scroll: false })
        },
        [router, pathname, searchParams],
    )
    /** Abre um universo mantendo o app aberto (o Voltar do universo volta a ele). */
    const open = useCallback((ref: UniverseRef | null, options: { replace?: boolean } = {}) => go({ app, universe: ref }, options), [go, app])
    const openApp = useCallback((slug: string) => go({ app: slug, universe: null }), [go])
    /** Sobe um nível: do universo ao app (se houver) e do app à visão inicial. */
    const back = useCallback((options: { replace?: boolean } = {}) => go({ app: universe ? app : null, universe: null }, options), [go, universe, app])
    /** Volta direto à visão inicial (app inexistente). */
    const home = useCallback((options: { replace?: boolean } = {}) => go({ app: null, universe: null }, options), [go])
    const nested = universe !== null || app !== null
    useEffect(() => {
        if (!nested || !options.escapeEnabled) return
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) return
            const target = event.target
            if (target instanceof Element && target.closest("input, textarea, [role='dialog']:not([data-network-card]), [role='alertdialog']")) return
            back()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [nested, options.escapeEnabled, back])
    return { universe, app, open, openApp, back, home }
}
