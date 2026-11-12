/**
 * Quais sessões das coleções `opex_*` são do **Agente Opex** (módulo PURO). As coleções guardam também
 * as do Agente Maddox e as conversas com os agentes rotineiros (OPE-160); as sessões antigas não têm o
 * campo `agent` e são do Agente Opex. Todo filtro "sessões do Agente Opex" passa por aqui, para uma
 * conversa de rotineiro nunca aparecer na lista, nos jobs, na retenção ou nas métricas do Agente Opex.
 */

export const NON_OPEX_SESSION_AGENTS = ["maddox", "routine"] as const

/** Valor do filtro Mongo do campo `agent` para as sessões do Agente Opex (`$nin` casa o campo ausente). */
export function opexSessionAgentFilter(): { $nin: (typeof NON_OPEX_SESSION_AGENTS)[number][] } {
    return { $nin: [...NON_OPEX_SESSION_AGENTS] }
}

export function isOpexAgentSession(agent: string | null | undefined): boolean {
    return !agent || agent === "opex"
}
