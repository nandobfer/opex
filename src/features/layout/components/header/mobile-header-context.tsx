"use client"

import { createContext, useContext } from "react"

/** Barra recolhida (botões flutuando sobre o conteúdo): os atalhos do cabeçalho ganham o fundo de chip. */
const MobileHeaderFloatingContext = createContext(false)

export const MobileHeaderFloatingProvider = MobileHeaderFloatingContext.Provider

export function useMobileHeaderFloating(): boolean {
    return useContext(MobileHeaderFloatingContext)
}
