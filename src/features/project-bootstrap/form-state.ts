import type { DirectoryCheckDto, RepoCheckDto } from "./types"

/**
 * Regras do formulário da etapa 1 (módulo puro): o tom das conferências ao vivo e o motivo que bloqueia
 * o envio (o servidor confere tudo de novo ao receber).
 */

export type ToneOf = "loading" | "ok" | "info" | "warn" | "blocked"

export function repoCheckTone(check: Pick<RepoCheckDto, "state"> | null | undefined): ToneOf | null {
    if (!check) return null
    if (check.state === "free") return "ok"
    if (check.state === "existing") return "warn"
    return "blocked"
}

export function directoryTone(check: Pick<DirectoryCheckDto, "kind"> | null | undefined): ToneOf | null {
    if (!check) return null
    if (check.kind === "free") return "ok"
    if (check.kind === "clone") return "info"
    return "blocked"
}

export interface SubmitState {
    blockers: number
    repo: { loading: boolean; check: Pick<RepoCheckDto, "blocked" | "message"> | null; error: string | null }
    directory: { loading: boolean; check: Pick<DirectoryCheckDto, "kind" | "reason"> | null; error: string | null }
}

/** Por que o envio está bloqueado agora (`null` = pode enviar). */
export function submitBlockReason(state: SubmitState): string | null {
    if (state.blockers > 0) return "Resolva os itens acima para enviar."
    if (state.repo.error) return state.repo.error
    if (state.repo.loading || !state.repo.check) return "Conferindo o nome no GitHub…"
    if (state.repo.check.blocked) return state.repo.check.message
    if (state.directory.error) return state.directory.error
    if (state.directory.loading || !state.directory.check) return "Conferindo a pasta no host…"
    if (state.directory.check.kind === "blocked") return state.directory.check.reason ?? "A pasta escolhida não pode ser usada."
    return null
}
