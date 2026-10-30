import Fuse from "fuse.js"
import { urlFilterCodecs, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import type { CentralDto } from "./types"

/** Busca das centrais de desenvolvimento (Integrações › Inteligência Artificial). Módulo puro. */

/** Filtros da busca, persistidos na URL (`?buscaCentrais=…`) junto da aba (`?aba=…`). */
export interface CentralSearchFilters {
    buscaCentrais: string
}

export const CENTRAL_SEARCH_PARAM = "buscaCentrais"

export const centralSearchSchema = {
    buscaCentrais: urlFilterCodecs.string(),
} satisfies UrlFilterSchema<CentralSearchFilters>

export const DEFAULT_CENTRAL_SEARCH: CentralSearchFilters = { buscaCentrais: "" }

const normalize = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()

/**
 * Centrais que casam com a busca, **na ordem original**. A busca lê o projeto, o repositório
 * vinculado e o diretório das sessões; primeiro por trecho (sem acento e sem caixa, todos os
 * termos) e, quando não há nenhum resultado, tolera erro de digitação (fuse.js). Vazio = todas.
 */
export function filterCentrals(centrals: readonly CentralDto[], search: string): CentralDto[] {
    const term = search.trim()
    const terms = normalize(term).split(/\s+/).filter(Boolean)
    if (!terms.length) return [...centrals]

    const haystacks = centrals.map((central) => normalize(`${central.projectName} ${central.repo ?? ""} ${central.config.sessionDirectory}`))
    const byTerm = centrals.filter((_, index) => terms.every((word) => haystacks[index]!.includes(word)))
    if (byTerm.length) return byTerm

    const fuse = new Fuse(centrals, { keys: ["projectName", "repo", "config.sessionDirectory"], threshold: 0.4, ignoreLocation: true })
    const matched = new Set(fuse.search(term).map((hit) => hit.item))
    return centrals.filter((central) => matched.has(central))
}
