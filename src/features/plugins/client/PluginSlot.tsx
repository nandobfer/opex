"use client"

import { useMemo } from "react"
import { AnimatePresence } from "framer-motion"
import type { PluginComponentSlot } from "../constants"
import { usePluginRuntime, usePluginsRealtime } from "../hooks/usePlugins"
import type { PluginRuntimeEntry, PluginSlotPropsMap } from "../types"
import { PluginContribution } from "./PluginContribution"

/** Contribuições de um slot, em ordem (`order` do manifesto, depois o nome do plugin). */
export function slotContributions(entries: readonly PluginRuntimeEntry[], name: PluginComponentSlot) {
    return entries
        .flatMap((entry) => entry.slots.filter((slot) => slot.slot === name).map((slot) => ({ entry, slot })))
        .sort((a, b) => a.slot.order - b.slot.order || a.entry.name.localeCompare(b.entry.name))
}

interface PluginSlotProps<N extends PluginComponentSlot> {
    name: N
    props: PluginSlotPropsMap[N]
    /** Classe do contêiner (só renderizado quando há contribuições). */
    className?: string
}

/**
 * Ponto de extensão da interface (OPE-172): monta os componentes que os plugins ativos declararam
 * para o slot. Sem contribuição não renderiza nada (a tela fica como antes). Cada contribuição tem a
 * própria fronteira de erro e troca ao vivo com o evento `plugin-updated`.
 */
export function PluginSlot<N extends PluginComponentSlot>({ name, props, className = "grid gap-4 md:grid-cols-2" }: PluginSlotProps<N>) {
    usePluginsRealtime()
    const runtime = usePluginRuntime()
    const items = useMemo(() => slotContributions(runtime.data?.plugins ?? [], name), [runtime.data, name])
    if (!items.length) return null
    return (
        <section className={className} data-plugin-slot={name} aria-label="Plugins">
            <AnimatePresence initial={false} mode="popLayout">
                {items.map(({ entry, slot }) => (
                    <PluginContribution key={`${entry.id}:${slot.export}:${entry.revision}`} entry={entry} kind="slots" exportName={slot.export} props={props} />
                ))}
            </AnimatePresence>
        </section>
    )
}
