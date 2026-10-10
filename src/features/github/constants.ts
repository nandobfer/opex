/** Constantes da integração GitHub (módulo puro). */

/** Evento Pusher em `private-integration-github` quando vínculos/mapeamento/sincronização mudam. Payload: `{ scope }`. */
export const GITHUB_UPDATED_EVENT = "github-updated"
export type GithubUpdateScope = "links" | "mappings" | "sync"

export const GITHUB_AUDIT = {
    link: "VinculoGithub",
    mapping: "MapeamentoGithub",
} as const

/** Abas da página da integração GitHub. `geral` é a padrão (omitida da URL). */
export const GITHUB_TABS = ["geral", "vinculos", "mapeamento", "sincronizacao"] as const
export type GithubTab = (typeof GITHUB_TABS)[number]
