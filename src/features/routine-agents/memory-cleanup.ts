/**
 * Limpeza do catálogo em prosa (OPE-130, D16): antes das ferramentas por chave, o Indexador gravava uma
 * memória nova (sem `key`) a cada reescrita do mesmo repositório no canal próprio, em prosa: título
 * `dono/nome: resumo` e texto começando por "Repositório dono/nome", "Catálogo: dono/nome" etc. Seleção
 * pura: só entra memória SEM chave que descreve um repositório (essas formas, `catalogo: dono/nome` ou o
 * JSON com `"repo": "dono/nome"`). Memória com chave (ex.: o estado do Indexador) nunca é selecionada, e só
 * entra o que o PRÓPRIO agente gravou (autor `opex/rotineiro-<slug>` com origem "rotineiro"): uma entrada
 * do dono (aba Entradas, rede) ou de outro autor nunca é arquivada, mesmo que o texto case.
 */

export interface CleanupCandidate {
    id: string
    text: string
    title?: string | null
    key?: string | null
    status?: string
    author?: { agent?: string | null } | null
    origin?: { source?: string | null } | null
}

/** Autoria exigida: o próprio agente rotineiro, gravando pela ferramenta (origem "rotineiro"). */
export function isOwnRoutineMemory(memory: Pick<CleanupCandidate, "author" | "origin">, agentRef: string): boolean {
    return memory.author?.agent === agentRef && memory.origin?.source === "rotineiro"
}

const CATALOG_TITLE = /^\s*catalogo:\s*[\w.-]+\/[\w.-]+/i
const CATALOG_JSON = /"repo"\s*:\s*"[\w.-]+\/[\w.-]+"/
const REPO_TITLE = /^\s*[\w.-]+\/[\w.-]+\s*:/
const REPO_PROSE = /^\s*(?:(?:O\s+)?reposit[óo]rio(?:\s+p[úu]blico)?|cat[áa]logo:?)\s+[\w.-]+\/[\w.-]+/i

export function isCatalogProse(memory: CleanupCandidate, agentRef: string): boolean {
    if (!isOwnRoutineMemory(memory, agentRef)) return false
    if (memory.key) return false
    if (memory.status === "archived") return false
    return CATALOG_TITLE.test(memory.text) || CATALOG_TITLE.test(memory.title ?? "") || CATALOG_JSON.test(memory.text) || REPO_TITLE.test(memory.title ?? "") || REPO_PROSE.test(memory.text)
}

/** Repositório citado (para o resumo do `--dry-run`). */
export function catalogRepoOf(memory: CleanupCandidate): string | null {
    const json = memory.text.match(/"repo"\s*:\s*"([\w.-]+\/[\w.-]+)"/)
    if (json) return json[1]!
    const title = (memory.title ?? "").match(/^\s*(?:catalogo:\s*)?([\w.-]+\/[\w.-]+)/i) ?? memory.text.match(/([\w.-]+\/[\w.-]+)/)
    return title ? title[1]! : null
}
