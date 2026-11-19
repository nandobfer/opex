"use client"

import { useMemo } from "react"
import { isNavGroup, type NavItemDef, type NavSectionDef } from "@/features/layout/types"
import { PLUGIN_NAV_GROUP_BY_SLOT, clientePluginPagePath, pluginPagePath, type PluginNavSlot } from "../constants"
import { usePluginRuntime, usePluginsRealtime } from "../hooks/usePlugins"
import type { PluginRuntimeEntry } from "../types"
import { pluginNavIcon } from "./nav-icons"
import { usePluginSource } from "./PluginSourceContext"

/**
 * Menu com os itens `nav` dos manifestos vigentes (OPE-172). Sem `slot` (ou com o menu padrão do
 * escopo), o item entra na seção "Plugins": `sidebar.nav` no dono (`/x/...`) e `portal.nav` no portal
 * (`/cliente/x/...`). Com um menu aninhado (`sidebar.nav.agentes`, `.contabil`, `.configuracoes`), o
 * item entra DENTRO desse grupo do menu do dono.
 */
export function navWithPluginItems(base: readonly NavSectionDef[], entries: readonly PluginRuntimeEntry[], scope: "owner" | "client" = "owner"): readonly NavSectionDef[] {
    const pagePath = scope === "client" ? clientePluginPagePath : pluginPagePath
    const loose: NavItemDef[] = []
    const byGroup = new Map<string, NavItemDef[]>()
    for (const entry of entries) {
        for (const item of entry.nav) {
            const def: NavItemDef = { label: item.label, title: item.label, href: pagePath(entry.id, item.page), icon: pluginNavIcon(item.icon) }
            const group = scope === "owner" && item.slot ? PLUGIN_NAV_GROUP_BY_SLOT[item.slot as PluginNavSlot] : undefined
            if (group) byGroup.set(group, [...(byGroup.get(group) ?? []), def])
            else loose.push(def)
        }
    }
    if (!loose.length && !byGroup.size) return base
    const sections = byGroup.size
        ? base.map((section) => ({
              ...section,
              items: section.items.map((entry) => (isNavGroup(entry) && byGroup.has(entry.id) ? { ...entry, items: [...entry.items, ...byGroup.get(entry.id)!] } : entry)),
          }))
        : [...base]
    return loose.length ? [...sections, { id: "plugins", label: "Plugins", items: loose }] : sections
}

/** Seção "Plugins" isolada (itens sem menu aninhado). */
export function pluginNavSection(entries: readonly PluginRuntimeEntry[], scope: "owner" | "client" = "owner"): NavSectionDef | null {
    return navWithPluginItems([], entries, scope).find((section) => section.id === "plugins") ?? null
}

/** Menu com os itens dos plugins (aparecem e somem ao vivo com o `plugin-updated`); a fonte decide dono ou portal. */
export function useNavWithPlugins(base: readonly NavSectionDef[]): readonly NavSectionDef[] {
    usePluginsRealtime()
    const source = usePluginSource()
    const runtime = usePluginRuntime()
    return useMemo(() => navWithPluginItems(base, runtime.data?.plugins ?? [], source.kind), [base, runtime.data, source.kind])
}
