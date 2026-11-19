"use client"

import { useMemo } from "react"
import type { NavSectionDef } from "@/features/layout/types"
import { pluginPagePath } from "../constants"
import { usePluginRuntime, usePluginsRealtime } from "../hooks/usePlugins"
import type { PluginRuntimeEntry } from "../types"
import { pluginNavIcon } from "./nav-icons"

/** Seção "Plugins" do menu a partir do `nav` dos manifestos vigentes (slot `sidebar.nav`). */
export function pluginNavSection(entries: readonly PluginRuntimeEntry[]): NavSectionDef | null {
    const items = entries.flatMap((entry) => entry.nav.map((item) => ({ label: item.label, title: item.label, href: pluginPagePath(entry.id, item.page), icon: pluginNavIcon(item.icon) })))
    return items.length ? { id: "plugins", label: "Plugins", items } : null
}

/** `APP_NAV` com a seção dos plugins (aparece e some ao vivo com o `plugin-updated`). */
export function useNavWithPlugins(base: readonly NavSectionDef[]): readonly NavSectionDef[] {
    usePluginsRealtime()
    const runtime = usePluginRuntime()
    return useMemo(() => {
        const section = pluginNavSection(runtime.data?.plugins ?? [])
        return section ? [...base, section] : base
    }, [base, runtime.data])
}
