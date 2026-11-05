/**
 * Slug do agente rotineiro (OPE-130, módulo PURO): nasce do nome e não muda depois (os canais do
 * Engramind dependem dele). `global` é reservado (canal de todos os rotineiros).
 */

export const MAX_ROUTINE_SLUG_LENGTH = 48
const RESERVED = new Set(["global"])

export function slugifyRoutineName(name: string): string {
    const base = name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, MAX_ROUTINE_SLUG_LENGTH)
        .replace(/-+$/g, "")
    return base || "agente"
}

/** Slug livre: o base, ou com sufixo numérico quando reservado ou já usado. */
export function uniqueRoutineSlug(name: string, taken: ReadonlySet<string>): string {
    const base = slugifyRoutineName(name)
    if (!RESERVED.has(base) && !taken.has(base)) return base
    for (let n = 2; n < 1000; n++) {
        const suffix = `-${n}`
        const candidate = `${base.slice(0, MAX_ROUTINE_SLUG_LENGTH - suffix.length).replace(/-+$/g, "")}${suffix}`
        if (!RESERVED.has(candidate) && !taken.has(candidate)) return candidate
    }
    return `${base.slice(0, 30)}-${Date.now().toString(36)}`
}

/** Chave de unicidade do nome (sem diferenciar maiúsculas, acentos nem espaços extras). */
export const routineNameKey = (name: string) =>
    name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase()
