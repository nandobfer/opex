"use client"

import { useMemo } from "react"
import type { PluginComponentSlot } from "../constants"
import { usePluginRuntime, usePluginsRealtime } from "../hooks/usePlugins"
import { slotContributions } from "./PluginSlot"

export type PluginTabId = `plugin:${string}:${string}`

/** É a aba de um plugin (`plugin:{id}:{export}`)? */
export const isPluginTabId = (id: string): id is PluginTabId => id.startsWith("plugin:")

/**
 * Abas de plugins de um slot de aba (`task.panel`, `workbench.panel`, `portal.task.panel`): id
 * `plugin:{id}:{export}`, rótulo (`title` do slot ou o nome do plugin) e a contribuição para montar.
 */
export function usePluginSlotTabs(slot: PluginComponentSlot) {
    usePluginsRealtime()
    const runtime = usePluginRuntime()
    return useMemo(
        () => slotContributions(runtime.data?.plugins ?? [], slot).map(({ entry, slot: item }) => ({ id: `plugin:${entry.id}:${item.export}` as PluginTabId, label: item.title ?? entry.name, entry, slot: item })),
        [runtime.data, slot],
    )
}
