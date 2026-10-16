import type { AiFeatureAvailability } from "@/features/ai/types"
import type { PrReviewState, PrReviewVerdict } from "./constants"
import type { PrReviewSettings } from "./schemas"

export interface PrReviewSettingsDto {
    settings: PrReviewSettings
    /** Nada salvo ainda: valores iniciais do código. */
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}

export interface PrReviewDto {
    id: string
    repo: string
    number: number
    url: string
    title: string
    author: string | null
    headSha: string
    draft: boolean
    projectName: string
    workbenchId: string | null
    trigger: "auto" | "manual"
    state: PrReviewState
    verdict: PrReviewVerdict | null
    blocking: number | null
    summary: string | null
    error: string | null
    costUsd: number
    durationMs: number | null
    createdAt: string
    startedAt: string | null
    finishedAt: string | null
}

export interface PrReviewDetailDto extends PrReviewDto {
    report: string | null
}

export interface PrReviewListDto {
    items: PrReviewDto[]
    /** Login do usuário do token do GitHub (critérios "Exceto os meus" / "Revisor solicitado"). */
    githubLogin: string | null
    /** Repositórios das centrais acompanhados. */
    repos: { repo: string; projectName: string; enabled: boolean }[]
}
