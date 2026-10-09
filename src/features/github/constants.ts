/** Constantes da integração GitHub (módulo puro). */

/** Evento Pusher em `private-integration-github` quando vínculos, mapeamento, pessoas ou rascunhos descartados mudam. Payload: `{ scope }`. */
export const GITHUB_UPDATED_EVENT = "github-updated"
export type GithubUpdateScope = "links" | "mappings" | "people" | "drafts" | "sync"

export const GITHUB_AUDIT = {
    link: "VinculoGithub",
    mapping: "MapeamentoGithub",
    person: "PessoaGithub",
    draft: "RascunhoTarefa",
} as const

/** Abas da página da integração GitHub. `geral` é a padrão (omitida da URL). */
export const GITHUB_TABS = ["geral", "vinculos", "mapeamento", "pessoas", "sincronizacao"] as const
export type GithubTab = (typeof GITHUB_TABS)[number]

/** Quanto tempo a integração tenta achar o commit de uma issue fechada. */
export const PENDING_COMMIT_MS = 24 * 60 * 60 * 1000
