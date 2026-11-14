"use client"

import { useMediaQuery } from "@/hooks/useMediaQuery"

/** Abaixo de `lg` (1024px): o mesmo divisor da Central de desenvolvimento (um painel por vez). */
export const COMPACT_WORKBENCH_QUERY = "(max-width: 1023px)"

/**
 * Mesa no celular/tablet (`< lg`, OPE-166): dock com a ação principal e a folha "Mais ações" no lugar da
 * linha de botões. Escolhido em JS porque os dois leiautes têm estado próprio (folhas, campos recolhidos);
 * sem `matchMedia` (SSR e testes) vale o desktop.
 */
export function useCompactWorkbench(): boolean {
    return useMediaQuery(COMPACT_WORKBENCH_QUERY)
}
