"use client"

import { createContext, useContext } from "react"

/**
 * Abaixo de `xl` não há espaço para a coluna de debug ao lado do formulário: o botão do título
 * abre os logs na janela (`IntegrationDebugDialog`), a mesma da lista de integrações.
 */
export const DEBUG_DIALOG_MEDIA_QUERY = "(max-width: 1279px)"

export interface IntegrationDebugToggle {
    /** Modo debug salvo na integração (`data.debugMode`): sem ele, o botão não aparece. */
    available: boolean
    open: boolean
    toggle: () => void
    /** `id` da coluna de logs, para o `aria-controls` do botão. */
    panelId: string
}

const IntegrationDebugToggleContext = createContext<IntegrationDebugToggle | null>(null)

export const IntegrationDebugToggleProvider = IntegrationDebugToggleContext.Provider

/** Liga/desliga da visualização dos logs; `null` fora do editor da integração. */
export function useIntegrationDebugToggle(): IntegrationDebugToggle | null {
    return useContext(IntegrationDebugToggleContext)
}
