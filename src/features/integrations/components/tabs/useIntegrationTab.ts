"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"

/** Parâmetro da URL com a aba ativa da página da integração. */
export const TAB_PARAM = "aba"
const TAB_CHANGE_EVENT = "integration-tab-change"

/** Parâmetro da URL com a seção a destacar dentro da aba (preenchido ao resolver um id antigo). */
export const SECTION_PARAM = "secao"

/** Id antigo de aba → aba atual (e a seção dentro dela), para links de abas fundidas ou removidas. */
export type TabAliases<T extends string> = Readonly<Record<string, { tab: T; section?: string }>>

/** Aba pedida na URL, se existir (ou o destino de um id antigo em `aliases`); senão a padrão. */
export function parseTab<T extends string>(search: string, tabs: readonly T[], fallback: T, param = TAB_PARAM, aliases?: TabAliases<T>): T {
    const value = new URLSearchParams(search).get(param)
    if (value && (tabs as readonly string[]).includes(value)) return value as T
    const alias = value ? aliases?.[value] : undefined
    return alias ? alias.tab : fallback
}

/**
 * URL canônica quando `?aba=` traz um id antigo: troca pelo id atual (a padrão é omitida) e grava a
 * seção em `?secao=`. `null` quando não há o que reescrever.
 */
export function canonicalAliasUrl<T extends string>(location: { pathname: string; search: string; hash: string }, aliases: TabAliases<T>, fallback: T, param = TAB_PARAM): string | null {
    const params = new URLSearchParams(location.search)
    const value = params.get(param)
    const alias = value ? aliases[value] : undefined
    if (!alias) return null
    if (alias.tab === fallback) params.delete(param)
    else params.set(param, alias.tab)
    if (alias.section) params.set(SECTION_PARAM, alias.section)
    const search = params.toString()
    return `${location.pathname}${search ? `?${search}` : ""}${location.hash}`
}

/** URL com a aba (a padrão é omitida), preservando os demais parâmetros e o hash. */
export function urlWithTab(location: { pathname: string; search: string; hash: string }, tab: string, fallback: string, param = TAB_PARAM): string {
    const params = new URLSearchParams(location.search)
    if (tab === fallback) params.delete(param)
    else params.set(param, tab)
    const search = params.toString()
    return `${location.pathname}${search ? `?${search}` : ""}${location.hash}`
}

function subscribe(onChange: () => void) {
    window.addEventListener("popstate", onChange)
    window.addEventListener(TAB_CHANGE_EVENT, onChange)
    return () => {
        window.removeEventListener("popstate", onChange)
        window.removeEventListener(TAB_CHANGE_EVENT, onChange)
    }
}
const getSnapshot = () => window.location.search
const getServerSnapshot = () => ""

/**
 * Aba ativa com a URL como fonte única (`?aba=…`, padrão omitida, `history.replaceState`). Trocar
 * de aba com alterações não salvas pede "Descartar alterações?" (`pendingTab` até confirmar).
 * Copiado do Orquestrador WhatsApp do CRM, genérico.
 */
export function useIntegrationTab<T extends string>(tabs: readonly T[], fallback: T, hasChanges: boolean, discard: () => void, param = TAB_PARAM, aliases?: TabAliases<T>) {
    const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
    const tab = parseTab(search, tabs, fallback, param, aliases)

    useEffect(() => {
        if (!aliases) return
        const next = canonicalAliasUrl(window.location, aliases, fallback, param)
        if (!next) return
        window.history.replaceState(window.history.state, "", next)
        window.dispatchEvent(new Event(TAB_CHANGE_EVENT))
    }, [aliases, fallback, param, search])
    const [pendingTab, setPendingTab] = useState<T | null>(null)

    const go = useCallback(
        (next: T) => {
            const url = new URL(urlWithTab(window.location, next, fallback, param), window.location.origin)
            if (param !== SECTION_PARAM) url.searchParams.delete(SECTION_PARAM)
            window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
            window.dispatchEvent(new Event(TAB_CHANGE_EVENT))
        },
        [fallback, param],
    )

    const requestTab = useCallback(
        (next: T) => {
            if (next === tab) return
            if (hasChanges) setPendingTab(next)
            else go(next)
        },
        [go, hasChanges, tab],
    )

    const confirmDiscard = useCallback(() => {
        if (!pendingTab) return
        discard()
        go(pendingTab)
        setPendingTab(null)
    }, [discard, go, pendingTab])

    return { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard: () => setPendingTab(null) }
}
