/**
 * Nome do repositório (módulo puro): leitura do que o dono digitou (`owner/nome` ou só `nome`) e as
 * regras de nome do GitHub.
 */

export const REPO_NAME_MESSAGE = "Use letras, números, ponto, hífen ou sublinhado (sem terminar em .git)"
export const REPO_OWNER_MESSAGE = "Dono inválido: letras, números e hífens (sem hífen no início ou no fim)"

/** Nome do repositório no GitHub: até 100 caracteres de `A-Z a-z 0-9 . _ -`, sem `.`/`..` e sem `.git` no fim. */
export function isValidRepoName(name: string): boolean {
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) return false
    if (name === "." || name === "..") return false
    return !/\.git$/i.test(name)
}

/** Conta ou organização: até 39 caracteres alfanuméricos ou hífens, sem hífen no início, no fim ou duplo. */
export function isValidRepoOwner(owner: string): boolean {
    return /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(owner)
}

export interface ParsedRepoInput {
    owner: string | null
    name: string
}

/** `owner/nome` (com ou sem a URL do GitHub) ou só `nome`. Espaços viram hífen, como o GitHub sugere. */
export function parseRepoInput(raw: string): ParsedRepoInput {
    const cleaned = raw
        .trim()
        .replace(/^https?:\/\/[^/]+\//i, "")
        .replace(/^git@[^:]+:/i, "")
        .replace(/\.git$/i, "")
        .replace(/\/+$/, "")
    const slash = cleaned.indexOf("/")
    const owner = slash > 0 ? cleaned.slice(0, slash).trim() : null
    const name = (slash >= 0 ? cleaned.slice(slash + 1) : cleaned).trim().replace(/\s+/g, "-")
    return { owner: owner || null, name }
}

/** `owner/nome` em minúsculas: a forma gravada nos vínculos (`projects.repo`). */
export const repoFullName = (owner: string, name: string) => `${owner}/${name}`.toLowerCase()

/** Remoto do git (`https://…/owner/nome(.git)` ou `git@…:owner/nome.git`) como `owner/nome` em minúsculas. */
export function repoFromRemote(remote: string): string | null {
    const value = remote.trim()
    if (!value) return null
    const match = /^(?:https?:\/\/(?:[^@/]+@)?[^/]+\/|ssh:\/\/(?:[^@/]+@)?[^/]+\/|[^@\s]+@[^:]+:)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(value)
    if (!match) return null
    return `${match[1]}/${match[2]}`.toLowerCase()
}

/** Nome e slug do ambiente (e do projeto do compose) a partir do nome do repositório. */
export function slugFromRepoName(name: string): string {
    const slug = name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)
        .replace(/-+$/g, "")
    if (slug.length >= 2) return slug
    return `${slug || "app"}-app`.slice(0, 40)
}

/** Caminho padrão do diretório no host: `<raiz dos repositórios>/<nome>`. */
export const defaultBootstrapDirectory = (root: string, name: string) => `${root.replace(/\/+$/, "")}/${name}`
