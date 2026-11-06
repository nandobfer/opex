"use client"

import { usePersistentState } from "@/hooks/usePersistentState"
import { OPENCODE_QUOTA_PANEL_KEY } from "../constants"
import { quotaPanelPrefsSchema, type QuotaPanelPrefs } from "../schemas"

export const DEFAULT_QUOTA_PANEL_PREFS: QuotaPanelPrefs = { collapsed: false, collapsedProviders: [] }

/**
 * Preferência do painel da quota (bloco e provedores recolhidos), a mesma em /desenvolvimento e na
 * barra lateral: `usePersistentState` sincroniza os componentes montados e as abas.
 */
export function useQuotaPanelPrefs() {
    return usePersistentState(OPENCODE_QUOTA_PANEL_KEY, quotaPanelPrefsSchema, DEFAULT_QUOTA_PANEL_PREFS)
}
