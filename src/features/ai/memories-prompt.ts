/**
 * Seção das memórias dos agentes nas instruções de sistema (módulo PURO, compartilhado pelo Agente
 * Opex, Agente Maddox, Agente Adversário e agente desenvolvedor). Desde a OPE-104 o bloco é o
 * **contexto pronto do Engramind** (`format=markdown`), que entra sem alteração depois do cabeçalho.
 */

export const MEMORIES_SECTION_HEADER = "## Memórias e instruções permanentes"

/** Seção das memórias para as instruções de sistema (vazia sem memórias). */
export function memoriesSection(block: string | null | undefined): string {
    const content = block?.trim()
    if (!content) return ""
    return ["", MEMORIES_SECTION_HEADER, "Siga sempre estas memórias:", "", content].join("\n")
}

/** Origem do bloco de memórias de um turno. */
export interface MemoryContextInfo {
    source: "live" | "cache" | "none"
    /** Data do bloco em cache (ISO), quando `source` é `cache`. */
    cachedAt: string | null
}

/** Aviso discreto do turno quando o Engramind não respondeu (`null` com o contexto ao vivo). */
export function memoryCacheNotice(info: MemoryContextInfo, formatDate: (iso: string) => string = defaultDate): string | null {
    if (info.source === "live") return null
    if (info.source === "cache" && info.cachedAt) return `Memórias carregadas do cache de ${formatDate(info.cachedAt)} (Engramind indisponível)`
    return "Engramind indisponível: turno sem memórias"
}

function defaultDate(iso: string): string {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}
