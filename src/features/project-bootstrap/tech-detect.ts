/**
 * Tecnologias citadas no contexto do projeto (módulo puro): casa o nome e as variantes de cada
 * tecnologia do catálogo, sem acento nem caixa, respeitando os limites da palavra (`next` não casa em
 * `nextcloud`; `js` não casa dentro de `next.js`). Usado ao vivo na tela e de novo no servidor, que é
 * quem decide a lista enviada ao agente.
 */

export interface CatalogTechnology {
    id: string
    name: string
    aliases: readonly string[]
    groupId: string
}

export interface CatalogGroup {
    id: string
    name: string
    color: string
    order: number
}

export interface DetectedTechGroup {
    group: CatalogGroup
    technologies: { id: string; name: string }[]
}

export const normalizeTechText = (text: string) =>
    text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()

const isWordChar = (char: string | undefined) => Boolean(char && /[a-z0-9]/.test(char))

/** O ponto só une palavras (`next.js`); no fim da frase, é pontuação. */
function leftBoundary(text: string, start: number): boolean {
    if (start === 0) return true
    const prev = text[start - 1]
    if (isWordChar(prev)) return false
    return !(prev === "." && isWordChar(text[start - 2]))
}

function rightBoundary(text: string, end: number): boolean {
    if (end >= text.length) return true
    const next = text[end]
    if (isWordChar(next)) return false
    return !(next === "." && isWordChar(text[end + 1]))
}

/** Primeira posição em que o termo aparece como palavra inteira, ou -1. */
export function findTerm(text: string, term: string): number {
    if (!term) return -1
    let from = 0
    for (;;) {
        const index = text.indexOf(term, from)
        if (index < 0) return -1
        if (leftBoundary(text, index) && rightBoundary(text, index + term.length)) return index
        from = index + 1
    }
}

export function detectTechnologies(text: string, technologies: readonly CatalogTechnology[], groups: readonly CatalogGroup[]): DetectedTechGroup[] {
    const haystack = normalizeTechText(text)
    if (!haystack.trim()) return []
    const found: { tech: CatalogTechnology; position: number }[] = []
    for (const tech of technologies) {
        const terms = [tech.name, ...tech.aliases].map((term) => normalizeTechText(term).trim()).filter(Boolean)
        const positions = terms.map((term) => findTerm(haystack, term)).filter((position) => position >= 0)
        if (positions.length) found.push({ tech, position: Math.min(...positions) })
    }
    const byGroup = new Map<string, { tech: CatalogTechnology; position: number }[]>()
    for (const item of found) byGroup.set(item.tech.groupId, [...(byGroup.get(item.tech.groupId) ?? []), item])
    return [...groups]
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"))
        .filter((group) => byGroup.has(group.id))
        .map((group) => ({
            group,
            technologies: byGroup
                .get(group.id)!
                .sort((a, b) => a.position - b.position)
                .map(({ tech }) => ({ id: tech.id, name: tech.name })),
        }))
}

/** Lista plana (nome + grupo) que vai ao agente e fica gravada no bootstrap. */
export function flattenDetected(groups: readonly DetectedTechGroup[]): { name: string; group: string }[] {
    return groups.flatMap((entry) => entry.technologies.map((tech) => ({ name: tech.name, group: entry.group.name })))
}
