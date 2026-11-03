"use client"

import { useState } from "react"
import type { IntegrationId } from "@/lib/integrations/catalog"
import { IntegrationDebugDialog } from "./IntegrationDebugDialog"
import { IntegrationTestDialog } from "./IntegrationTestDialog"

/** Integração com o diálogo de teste ou de debug aberto. */
export function useIntegrationActionDialogs() {
    const [testing, setTesting] = useState<IntegrationId | null>(null)
    const [debugging, setDebugging] = useState<IntegrationId | null>(null)
    return { testing, debugging, openTest: setTesting, openDebug: setDebugging, closeTest: () => setTesting(null), closeDebug: () => setDebugging(null) }
}

type IntegrationActionDialogsState = ReturnType<typeof useIntegrationActionDialogs>

/** Diálogos "Testar conexão" e "Logs de debug" (lista de `/integracoes` e submenu da sidebar). */
export function IntegrationActionDialogs({ state }: { state: IntegrationActionDialogsState }) {
    return (
        <>
            <IntegrationTestDialog integrationId={state.testing} onOpenChange={(open) => !open && state.closeTest()} />
            <IntegrationDebugDialog integrationId={state.debugging} onOpenChange={(open) => !open && state.closeDebug()} />
        </>
    )
}
