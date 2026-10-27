import { z } from "zod"
import { extractJsonBlock } from "@/features/agentic/prompts"
import { ADVERSARIAL_LEVEL_DEFS, FINDING_CATEGORIES, FINDING_SEVERITIES, type AdversarialLevel, type FindingCategory, type FindingSeverity } from "./constants"

/**
 * Veredito do Agente Adversário (módulo PURO). O modelo só CLASSIFICA os achados; quem decide se
 * bloqueia é o app, pelo nível de criticidade e pelas travas contra bloqueio desnecessário.
 */

const text = (max: number) => z.string().trim().max(max).catch("")

const rawFindingSchema = z.object({
    id: z.string().trim().min(1).max(20),
    severity: z.enum(FINDING_SEVERITIES).catch("nit"),
    category: z.enum(FINDING_CATEGORIES).catch("design"),
    title: text(300),
    file: z.string().trim().max(400).nullable().catch(null),
    line: z.number().int().positive().nullable().catch(null),
    evidence: text(4000),
    scenario: text(4000),
    suggestion: text(4000),
    /** O trecho está no código alterado nesta mesa. */
    inDiff: z.boolean().catch(true),
    /** Achado bloqueante da rodada anterior que continua sem solução. */
    carriedOver: z.boolean().catch(false),
    /** Problema criado pela própria correção (rodadas 2+). */
    introducedByFix: z.boolean().catch(false),
})

const previousSchema = z.object({
    id: z.string().trim().min(1).max(20),
    status: z.enum(["resolved", "unresolved", "dispute-accepted"]).catch("unresolved"),
    note: text(2000),
})

const outputSchema = z.object({
    summary: text(4000),
    findings: z.array(z.unknown()).max(100).catch([]),
    previous: z.array(z.unknown()).max(100).catch([]),
})

export type RawFinding = z.infer<typeof rawFindingSchema>
export type PreviousStatus = z.infer<typeof previousSchema>

export interface EvaluatedFinding extends RawFinding {
    blocking: boolean
    /** Por que um achado no limiar não bloqueia (trava aplicada); `null` quando bloqueia ou está abaixo do limiar. */
    demotedReason: string | null
}

export interface ParsedReview {
    summary: string
    findings: RawFinding[]
    previous: PreviousStatus[]
}

/** Interpreta o bloco JSON final do adversário. `null` = sem JSON válido (a rodada falha). */
export function parseReviewOutput(output: string): ParsedReview | null {
    const parsed = outputSchema.safeParse(extractJsonBlock(output))
    if (!parsed.success) return null
    const findings = parsed.data.findings.flatMap((item) => {
        const finding = rawFindingSchema.safeParse(item)
        return finding.success ? [finding.data] : []
    })
    const seen = new Set<string>()
    const unique = findings.filter((finding) => (seen.has(finding.id) ? false : (seen.add(finding.id), true)))
    const previous = parsed.data.previous.flatMap((item) => {
        const status = previousSchema.safeParse(item)
        return status.success ? [status.data] : []
    })
    return { summary: parsed.data.summary, findings: unique, previous }
}

const rank = (severity: FindingSeverity) => FINDING_SEVERITIES.indexOf(severity)

/** A severidade atinge o limiar do nível (bloquearia sem as travas)? */
export function reachesThreshold(severity: FindingSeverity, level: AdversarialLevel): boolean {
    return rank(severity) <= rank(ADVERSARIAL_LEVEL_DEFS[level].blocksFrom)
}

function demotion(finding: RawFinding, level: AdversarialLevel, round: number): string | null {
    if (finding.category === ("style" satisfies FindingCategory) && level !== "relentless") return "Estilo só bloqueia no nível Implacável"
    if (!finding.inDiff) return "Fora do código alterado nesta mesa"
    if (!finding.file || !finding.evidence || !finding.scenario) return "Sem arquivo, evidência e cenário concretos"
    if (round > 1 && !finding.carriedOver && !finding.introducedByFix && finding.severity !== "critical") return "Achado novo numa rodada de correção: só bloqueia se for crítico ou criado pela correção"
    return null
}

/** Classifica cada achado: bloqueia se atinge o limiar do nível e passa pelas travas. */
export function evaluateFindings(findings: readonly RawFinding[], level: AdversarialLevel, round: number): EvaluatedFinding[] {
    return findings.map((finding) => {
        if (!reachesThreshold(finding.severity, level)) return { ...finding, blocking: false, demotedReason: null }
        const reason = demotion(finding, level, round)
        return { ...finding, blocking: reason === null, demotedReason: reason }
    })
}

/** Ordem de exibição: bloqueantes primeiro, depois por severidade. */
export function sortFindings<T extends { blocking: boolean; severity: FindingSeverity }>(findings: readonly T[]): T[] {
    return [...findings].sort((a, b) => Number(b.blocking) - Number(a.blocking) || rank(a.severity) - rank(b.severity))
}

/** Contagem por severidade (histórico e card do veredito). */
export function countBySeverity(findings: readonly { severity: FindingSeverity }[]): Record<FindingSeverity, number> {
    const counts = Object.fromEntries(FINDING_SEVERITIES.map((severity) => [severity, 0])) as Record<FindingSeverity, number>
    for (const finding of findings) counts[finding.severity]++
    return counts
}

/** Contestações do implementador no fim do turno de correção (`{"disputes":[{"id","reason"}]}`). */
export function parseDisputes(output: string): { id: string; reason: string }[] {
    const schema = z.object({ disputes: z.array(z.object({ id: z.string().trim().min(1).max(20), reason: z.string().trim().min(1).max(4000) })).max(100) })
    const parsed = schema.safeParse(extractJsonBlock(output))
    return parsed.success ? parsed.data.disputes : []
}
