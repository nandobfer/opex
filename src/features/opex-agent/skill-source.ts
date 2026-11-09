/**
 * Origem de instalação de uma skill do Opex (OPE-153): `dono/repo`, `https://github.com/dono/repo(.git)` ou
 * `https://github.com/dono/repo/tree/<ref>/<pasta>` (ref sem `/`). Módulo puro.
 */

export interface GithubSkillSource {
    repo: string
    /** `null` = branch padrão. */
    ref: string | null
    /** Pasta dentro do repositório (`null` = repositório inteiro). */
    path: string | null
}

const SEGMENT = /^[A-Za-z0-9_.-]+$/

/** Converte a origem; devolve `null` quando não é um repositório do GitHub. */
export function parseGithubSkillSource(raw: string): GithubSkillSource | null {
    let value = raw.trim()
    if (!value || /\s/.test(value)) return null
    value = value.replace(/^github:/i, "")
    const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i.exec(value)
    const rest = url ? url[1]! : value
    if (!url && /^[a-z]+:\/\//i.test(value)) return null
    const parts = rest.split(/[?#]/)[0]!.split("/").filter(Boolean)
    if (parts.length < 2) return null
    const owner = parts[0]!
    const name = parts[1]!.replace(/\.git$/i, "")
    if (!SEGMENT.test(owner) || !SEGMENT.test(name) || owner.startsWith(".") || name === "") return null
    const repo = `${owner}/${name}`.toLowerCase()
    if (parts.length === 2) return { repo, ref: null, path: null }
    if (!url || (parts[2] !== "tree" && parts[2] !== "blob") || parts.length < 4) return null
    const ref = parts[3]!
    let path = parts.slice(4).join("/")
    if (parts[2] === "blob" && /(^|\/)SKILL\.md$/.test(path)) path = path.replace(/\/?SKILL\.md$/, "")
    if (path.split("/").some((part) => part === ".." || part === ".")) return null
    return { repo, ref, path: path || null }
}

export const GITHUB_SOURCE_ERROR = "A origem precisa ser um repositório do GitHub: dono/repo ou https://github.com/dono/repo"
