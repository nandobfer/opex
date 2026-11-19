"use client"

import { DebugToggleIconButton } from "../DebugToggleIconButton"
import { useIntegrationDebugToggle } from "./debug-toggle-context"

/** Botão do título que abre/fecha os logs do modo debug (só com o modo debug salvo). */
export function DebugToggleButton() {
    const debug = useIntegrationDebugToggle()
    return <DebugToggleIconButton visible={!!debug?.available} open={!!debug?.open} onToggle={() => debug?.toggle()} panelId={debug?.panelId ?? ""} />
}
