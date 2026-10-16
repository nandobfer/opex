import { z } from "zod"
import { extractJsonBlock } from "@/features/agentic/prompts"
import { PR_REVIEW_MARKER, PR_REVIEW_VERDICTS, type PrReviewVerdict } from "./constants"
import type { PrReviewSettings } from "./schemas"

/** Regras puras da "Revisão de PR" (critério, URL do PR, marcador, veredito e limite de replanejamento). */

/** Dados do PR que o critério usa (vindos de `GET /repos/{repo}/pulls`). */
export interface PrCandidate {
    author: string | null
    draft: boolean
    requestedReviewers: string[]
    /** PR aberto por uma mesa do desenvolvimento agêntico. */
    workbench: boolean
}

const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.toLowerCase() === b.toLowerCase())

/**
 * O PR entra na revisão automática? `myLogin` é o usuário do token do GitHub; sem ele, os critérios
 * "Exceto os meus" e "Revisor solicitado" não conseguem decidir e o PR fica de fora.
 */
export function matchesReviewScope(pr: PrCandidate, settings: Pick<PrReviewSettings, "scope" | "includeDrafts" | "includeWorkbenchPrs">, myLogin: string | null): boolean {
    if (pr.draft && !settings.includeDrafts) return false
    if (pr.workbench && !settings.includeWorkbenchPrs) return false
    if (settings.scope === "all") return true
    if (!myLogin) return false
    if (settings.scope === "not_mine") return !same(pr.author, myLogin)
    return pr.requestedReviewers.some((login) => same(login, myLogin))
}

/** `https://github.com/Org/Repo/pull/12` → `{ repo: "org/repo", number: 12 }` (repo em minúsculas, como nos vínculos). */
export function parsePrUrl(url: string): { repo: string; number: number } | null {
    const match = /^https:\/\/[^/\s]+\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/.exec(url.trim())
    if (!match) return null
    return { repo: match[1]!.toLowerCase(), number: Number(match[2]) }
}

/** Texto publicado pela revisão automática (traz o marcador oculto). */
export function isAutoReviewText(text: string | null | undefined): boolean {
    return Boolean(text?.includes(PR_REVIEW_MARKER))
}

/** Marcador que o agente põe no fim de toda revisão/comentário publicado. */
export function reviewMarker(headSha: string): string {
    return `${PR_REVIEW_MARKER} sha=${headSha.slice(0, 12)} -->`
}

/**
 * Pode replanejar a mesa por mais um pedido de mudanças da revisão automática? `count` = quantos
 * replanejamentos a revisão automática já causou neste PR.
 */
export function replanDecision(settings: Pick<PrReviewSettings, "replanOnChanges" | "replanLimit">, count: number): { allowed: boolean; reason: string | null } {
    if (!settings.replanOnChanges) return { allowed: false, reason: "a revisão automática não replaneja a mesa (desligado em Revisão de PR)" }
    if (settings.replanLimit.enabled && count >= settings.replanLimit.max) return { allowed: false, reason: `limite de ${settings.replanLimit.max} replanejamento(s) pela revisão automática atingido` }
    return { allowed: true, reason: null }
}

/** Diretório do worktree temporário da revisão (destacado no head do PR). */
export function reviewWorktreePath(root: string, repo: string, number: number, headSha: string): string {
    const name = repo.split("/").pop() ?? "repo"
    return `${root.replace(/\/+$/, "")}/review-${name}-pr-${number}-${headSha.slice(0, 7)}`
}

const resultSchema = z.object({
    verdict: z.enum(PR_REVIEW_VERDICTS),
    blocking: z.number().int().min(0).optional(),
    summary: z.string().optional(),
})

export interface PrReviewResult {
    verdict: PrReviewVerdict | null
    blocking: number | null
    summary: string | null
    /** Relatório (texto do agente sem o bloco JSON final). */
    report: string
}

/** Lê o bloco JSON final do agente; sem ele, o veredito fica `null` (confirmado depois no GitHub). */
export function parseReviewResult(text: string): PrReviewResult {
    const parsed = resultSchema.safeParse(extractJsonBlock(text))
    const report = text.replace(/```json\s*\n[\s\S]*?```\s*$/, "").trim()
    if (!parsed.success) return { verdict: null, blocking: null, summary: null, report }
    return { verdict: parsed.data.verdict, blocking: parsed.data.blocking ?? null, summary: parsed.data.summary?.trim() || null, report }
}

/** Estado de uma revisão do GitHub → veredito. */
export function verdictFromGithubState(state: string): PrReviewVerdict | null {
    if (state === "APPROVED") return "approved"
    if (state === "CHANGES_REQUESTED") return "changes_requested"
    if (state === "COMMENTED") return "commented"
    return null
}
