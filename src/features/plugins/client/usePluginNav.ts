"use client"

import { useMemo } from "react"
import type { NavSectionDef } from "@/features/layout/types"
import { clientePluginPagePath, pluginPagePath } from "../constants"
import { usePluginRuntime, usePluginsRealtime } from "../hooks/usePlugins"
import type { PluginRuntimeEntry } from "../types"
import { pluginNavIcon } from "./nav-icons"
import { usePluginSource } from "./PluginSourceContext"

/**
 * Seção "Plugins" do menu a partir do `nav` dos manifestos vigentes: slot `sidebar.nav` no dono
 * (`/x/...`) e `portal.nav` no portal (`/cliente/x/...`).
 */
export function pluginNavSection(entries: readonly PluginRuntimeEntry[], scope: "owner" | "client" = "owner"): NavSectionDef | null {
    const pagePath = scope === "client" ? clientePluginPagePath : pluginPagePath
    const items = entries.flatMap((entry) => entry.nav.map((item) => ({ label: item.label, title: item.label, href: pagePath(entry.id, item.page), icon: pluginNavIcon(item.icon) })))
    return items.length ? { id: "plugins", label: "Plugins", items } : null
}

/** Menu com a seção dos plugins (aparece e some ao vivo com o `plugin-updated`); a fonte decide dono ou portal. */
export function useNavWithPlugins(base: readonly NavSectionDef[]): readonly NavSectionDef[] {
    usePluginsRealtime()
    const source = usePluginSource()
    const runtime = usePluginRuntime()
    return useMemo(() => {
        const section = pluginNavSection(runtime.data?.plugins ?? [], source.kind)
        return section ? [...base, section] : base
    }, [base, runtime.data, source.kind])
}
