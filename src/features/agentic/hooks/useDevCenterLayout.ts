"use client"

import { useCallback, useSyncExternalStore } from "react"
import { usePersistentState } from "@/hooks/usePersistentState"
import { DEFAULT_DEV_CENTER_LAYOUT, DEV_CENTER_LAYOUT_KEY, devCenterLayoutSchema, type DevCenterLayout } from "../dev-center-layout"

const WIDE_QUERY = "(min-width: 1024px)"

function subscribeWide(callback: () => void) {
    const media = window.matchMedia(WIDE_QUERY)
    media.addEventListener("change", callback)
    return () => media.removeEventListener("change", callback)
}

/**
 * Colunas recolhidas da Central de desenvolvimento. Só vale a partir de `lg` (colunas lado a
 * lado); abaixo disso as colunas ficam empilhadas e sempre abertas.
 */
export function useDevCenterLayout() {
    const { value, setValue } = usePersistentState(DEV_CENTER_LAYOUT_KEY, devCenterLayoutSchema, DEFAULT_DEV_CENTER_LAYOUT)
    const wide = useSyncExternalStore(
        subscribeWide,
        () => window.matchMedia(WIDE_QUERY).matches,
        () => true,
    )
    const toggle = useCallback((key: keyof DevCenterLayout) => setValue((current) => ({ ...current, [key]: !current[key] })), [setValue])
    return {
        wide,
        centralsCollapsed: wide && value.centralsCollapsed,
        tasksCollapsed: wide && value.tasksCollapsed,
        toggleCentrals: useCallback(() => toggle("centralsCollapsed"), [toggle]),
        toggleTasks: useCallback(() => toggle("tasksCollapsed"), [toggle]),
    }
}
