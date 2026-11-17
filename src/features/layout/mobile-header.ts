/**
 * Regras puras do cabeçalho do celular (OPE-168): quando a barra recolhe ao rolar o conteúdo da casca
 * e as medidas que mantêm o layout parado entre os dois estados.
 */

/** Acima desta rolagem (px) a barra recolhe: logo e divisor saem, ficam só os botões. */
export const HEADER_COMPACT_ENTER = 24
/** Abaixo desta rolagem (px) a barra volta ao estado do topo (folga para não piscar no meio). */
export const HEADER_COMPACT_EXIT = 4

/** Largura reservada à logo (36px da marca + 8px de espaço): o hamburger desliza essa distância. */
export const HEADER_LOGO_SLOT = 44

/**
 * Espaço no topo do conteúdo da casca no celular, reservado ao cabeçalho (que fica por cima, com
 * altura fixa nos dois estados: a alternância nunca muda a altura da área que rola).
 */
export const MOBILE_HEADER_OFFSET_CLASS = "pt-16"

/** Próximo estado da barra (`true` = recolhida) a partir do anterior e da rolagem atual, com folga. */
export function nextHeaderCompact(previous: boolean, scrollTop: number): boolean {
    if (scrollTop > HEADER_COMPACT_ENTER) return true
    if (scrollTop <= HEADER_COMPACT_EXIT) return false
    return previous
}
