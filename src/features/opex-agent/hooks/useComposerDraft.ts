"use client"

import { useCallback, useEffect, useState } from "react"
import { z } from "zod"
import { readPersistentState, writePersistentState } from "@/hooks/usePersistentState"
import { useOpexScope } from "../components/OpexScopeProvider"
import { OPEX_MESSAGE_MAX } from "../constants"
import type { OpexSessionDto } from "../types"
import { OPEX_DRAFT_TAB } from "./useOpexTabs"

/**
 * Rascunho do campo de mensagem por aba (id da sessão ou a "Nova sessão"), guardado no navegador
 * (OPE-195): fechar o popover desmonta o chat, e reabrir devolve o texto que estava no campo. A chave
 * deriva das abas do escopo (agente + cliente + usuário). Some no envio e quando a sessão some da lista.
 */

const draftsSchema = z.record(z.string().max(40), z.string().max(OPEX_MESSAGE_MAX))
export type ComposerDrafts = z.infer<typeof draftsSchema>

const EMPTY: ComposerDrafts = {}

export const composerDraftsKey = (tabsKey: string) => `${tabsKey}:composer-drafts:v1`

/** Grava o texto da aba; texto vazio apaga a entrada. */
export function setDraft(drafts: ComposerDrafts, id: string, text: string): ComposerDrafts {
    if (text) return drafts[id] === text ? drafts : { ...drafts, [id]: text }
    if (!(id in drafts)) return drafts
    const next = { ...drafts }
    delete next[id]
    return next
}

/** Leva o rascunho de uma aba para outra (ex.: "Nova sessão" → sessão criada ao anexar). */
export function moveDraft(drafts: ComposerDrafts, from: string, to: string): ComposerDrafts {
    const text = drafts[from]
    if (!text) return drafts
    return setDraft(setDraft(drafts, from, ""), to, text)
}

/** Mantém a "Nova sessão" e as sessões que ainda existem. */
export function pruneDrafts(drafts: ComposerDrafts, sessions: readonly Pick<OpexSessionDto, "id">[]): ComposerDrafts {
    const known = new Set(sessions.map((session) => session.id))
    const ids = Object.keys(drafts)
    const kept = ids.filter((id) => id === OPEX_DRAFT_TAB || known.has(id))
    if (kept.length === ids.length) return drafts
    return Object.fromEntries(kept.map((id) => [id, drafts[id]]))
}

function update(tabsKey: string, change: (drafts: ComposerDrafts) => ComposerDrafts) {
    const key = composerDraftsKey(tabsKey)
    const current = readPersistentState(key, draftsSchema, EMPTY)
    const next = change(current)
    if (next !== current) writePersistentState(key, next)
}

export function readComposerDraft(tabsKey: string, id: string): string {
    return readPersistentState(composerDraftsKey(tabsKey), draftsSchema, EMPTY)[id] ?? ""
}

export function saveComposerDraft(tabsKey: string, id: string, text: string) {
    update(tabsKey, (drafts) => setDraft(drafts, id, text))
}

export function moveComposerDraft(tabsKey: string, from: string, to: string) {
    update(tabsKey, (drafts) => moveDraft(drafts, from, to))
}

/**
 * Rascunho de uma aba no escopo atual: `initial` lido na montagem e `save` a cada mudança. Sem
 * `draftId`, nada é lido nem gravado.
 */
export function useComposerDraft(draftId: string | undefined) {
    const { tabsKey } = useOpexScope()
    const [initial] = useState(() => (draftId && typeof window !== "undefined" ? readComposerDraft(tabsKey, draftId) : ""))
    const save = useCallback(
        (text: string) => {
            if (draftId) saveComposerDraft(tabsKey, draftId, text)
        },
        [tabsKey, draftId],
    )
    return { initial, save }
}

/** Esquece os rascunhos das sessões que não existem mais (como as abas). */
export function usePruneComposerDrafts(sessions: readonly OpexSessionDto[] | undefined) {
    const { tabsKey } = useOpexScope()
    useEffect(() => {
        if (sessions) update(tabsKey, (drafts) => pruneDrafts(drafts, sessions))
    }, [sessions, tabsKey])
}

/** Para a "Nova sessão" mover o rascunho no escopo atual. */
export function useMoveComposerDraft() {
    const { tabsKey } = useOpexScope()
    return useCallback((from: string, to: string) => moveComposerDraft(tabsKey, from, to), [tabsKey])
}
