"use client"

import { createContext, useContext, type ReactNode } from "react"

/**
 * Onde os wrappers de `src/components/ui` desenham os painéis flutuantes (popover, menu, dica,
 * seletor, diálogo). Sem provider, o Radix usa o `document.body`. Um elemento em tela cheia do
 * navegador só mostra o que está DENTRO dele: quem entra em tela cheia aponta o provider para o
 * próprio elemento, senão os painéis abririam invisíveis.
 */
const PortalContainerContext = createContext<HTMLElement | null>(null)

export function PortalContainerProvider({ container, children }: { container: HTMLElement | null; children: ReactNode }) {
    return <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
}

/** Contêiner atual dos portais (`undefined` = o padrão do Radix, o `document.body`). */
export function usePortalContainer(): HTMLElement | undefined {
    return useContext(PortalContainerContext) ?? undefined
}
