/**
 * Clareza da prévia do portal (módulo PURO, cliente e servidor).
 *
 * A IA avalia, a cada geração, se a descrição do cliente explicita os **critérios de aceite** e a
 * **localização/página**. Essa avaliação é **transitória**: vive só no estado da tela (não é
 * gravada no rascunho). A **Especificação Técnica** salva (Markdown) é que contém os critérios e a
 * localização.
 */

export const PREVIEW_CLARITY_STATUSES = ["clear", "vague", "missing"] as const
export type PreviewClarityStatus = (typeof PREVIEW_CLARITY_STATUSES)[number]

/** Avaliação de uma dimensão da clareza (critérios de aceite ou localização). */
export interface PreviewClarityDimension {
    status: PreviewClarityStatus
    /** Justificativa curta da IA (vira dica no card). */
    detail: string | null
}

/** Avaliação de clareza da prévia (transitória; NÃO persistida no rascunho). */
export interface PreviewClarityDto {
    acceptanceCriteria: PreviewClarityDimension
    location: PreviewClarityDimension
}

/** Nível do card da revisão (um único card alterna entre os três). */
export type PreviewClarityLevel = "clear" | "vague" | "missing"

export type PreviewClarityDimensionKey = "acceptanceCriteria" | "location"

/** Dimensão que não está clara (vaga ou ausente), para a mensagem do card. */
export interface PreviewClarityIssue {
    dimension: PreviewClarityDimensionKey
    status: Exclude<PreviewClarityStatus, "clear">
    detail: string | null
}

export interface PreviewClarityResult {
    level: PreviewClarityLevel
    /** Submissão liberada? `false` só quando alguma dimensão está ausente. */
    canApprove: boolean
    /** Dimensões que não estão claras, para listar no card. */
    issues: PreviewClarityIssue[]
}

export const PREVIEW_CLARITY_DIMENSION_LABELS: Record<PreviewClarityDimensionKey, string> = {
    acceptanceCriteria: "critérios de aceite",
    location: "localização/página",
}

const VAGUE_DIMENSION: PreviewClarityDimension = { status: "vague", detail: null }

/** Sem avaliação válida (ex.: prévia recarregada do banco), assume "aviso" — não bloqueia. */
function dimensionOf(value: PreviewClarityDimension | null | undefined): PreviewClarityDimension {
    if (!value || !PREVIEW_CLARITY_STATUSES.includes(value.status)) return VAGUE_DIMENSION
    return value
}

/**
 * Decide o card da revisão a partir da avaliação da IA:
 * - sem avaliação (prévia vinda do banco) → `vague`, submissão liberada;
 * - alguma dimensão `missing` → `missing`, submissão **bloqueada**;
 * - ambas `clear` → `clear`, submissão liberada;
 * - caso contrário → `vague`, submissão liberada.
 */
export function selectPreviewClarity(clarity?: PreviewClarityDto | null): PreviewClarityResult {
    if (!clarity) return { level: "vague", canApprove: true, issues: [] }

    const dimensions: Array<[PreviewClarityDimensionKey, PreviewClarityDimension]> = [
        ["acceptanceCriteria", dimensionOf(clarity.acceptanceCriteria)],
        ["location", dimensionOf(clarity.location)],
    ]
    const issues: PreviewClarityIssue[] = dimensions
        .filter(([, dimension]) => dimension.status !== "clear")
        .map(([key, dimension]) => ({ dimension: key, status: dimension.status as "vague" | "missing", detail: dimension.detail }))

    if (issues.some((issue) => issue.status === "missing")) return { level: "missing", canApprove: false, issues }
    if (issues.length === 0) return { level: "clear", canApprove: true, issues: [] }
    return { level: "vague", canApprove: true, issues }
}
