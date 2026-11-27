import type { JevAnswer, JevQuestion } from "@nandobfer/integracoes/modules/integrations/ia/ai/jev"
import type { SubjectDecision } from "./criteria"
import type { SecretaryCriteria, SubjectRule } from "./schemas"

/**
 * Decisão do assunto pelo JEV (PURO): cada assunto vira uma pergunta `noul` ("a mensagem trata disto?") e a
 * probabilidade de "sim" cai numa faixa. Política "na dúvida, fica quieto" (plano v3 da OPE-192): um assunto
 * bloqueado com sim OU incerto bloqueia; no modo "Só os assuntos liberados", só o sim libera.
 */

export const JEV_SUBJECT_THRESHOLDS = { yes: 0.7, no: 0.3 } as const
export type JevBand = "yes" | "no" | "unsure"
export const JEV_BAND_LABELS: Record<JevBand, string> = { yes: "sim", no: "não", unsure: "incerto" }

export function jevBandOf(value: number): JevBand {
    if (value >= JEV_SUBJECT_THRESHOLDS.yes) return "yes"
    if (value <= JEV_SUBJECT_THRESHOLDS.no) return "no"
    return "unsure"
}

export interface SubjectAnswer {
    id: string
    kind: "blocked" | "allowed"
    name: string
    /** Probabilidade de "sim" (0 a 1). */
    value: number
    band: JevBand
}

const keyOf = (kind: SubjectAnswer["kind"], id: string) => `${kind === "blocked" ? "b" : "a"}_${id.replace(/-/g, "_")}`

function question(rule: SubjectRule): JevQuestion {
    const examples = rule.examples.length ? ` Exemplos: ${rule.examples.map((item) => `"${item}"`).join("; ")}.` : ""
    return {
        type: "noul",
        instructions: `A mensagem recebida (campo "mensagem", com as anteriores como contexto) trata do assunto "${rule.name}"${rule.description ? `: ${rule.description}` : ""}.${examples}`,
        criteria: { true: `A mensagem trata de ${rule.name}.`, false: `A mensagem não trata de ${rule.name}.` },
    }
}

/** Perguntas do turno: os assuntos bloqueados e, no modo "Só os liberados", os liberados. */
export function buildJevSubjectQuestions(criteria: SecretaryCriteria): Record<string, JevQuestion> {
    const out: Record<string, JevQuestion> = {}
    for (const rule of criteria.subjects.blocked) out[keyOf("blocked", rule.id)] = question(rule)
    if (criteria.subjects.mode === "only") for (const rule of criteria.subjects.allowed) out[keyOf("allowed", rule.id)] = question(rule)
    return out
}

/** Respostas do JEV → assuntos que bateram, pela política "na dúvida, fica quieto". Resposta faltando lança. */
export function interpretJevSubjects(criteria: SecretaryCriteria, answers: Record<string, JevAnswer> | undefined): { decision: SubjectDecision; answers: SubjectAnswer[] } {
    const rows: SubjectAnswer[] = []
    const read = (kind: SubjectAnswer["kind"], rule: SubjectRule) => {
        const answer = answers?.[keyOf(kind, rule.id)]
        if (!answer || answer.type !== "noul") throw new Error(`O JEV não respondeu a pergunta do assunto "${rule.name}"`)
        rows.push({ id: rule.id, kind, name: rule.name, value: answer.noul, band: jevBandOf(answer.noul) })
    }
    criteria.subjects.blocked.forEach((rule) => read("blocked", rule))
    if (criteria.subjects.mode === "only") criteria.subjects.allowed.forEach((rule) => read("allowed", rule))
    const blocked = rows.filter((row) => row.kind === "blocked" && row.band !== "no").map((row) => row.id)
    const allowed = rows.filter((row) => row.kind === "allowed" && row.band === "yes").map((row) => row.id)
    const top = [...rows].sort((a, b) => b.value - a.value)[0]
    const topic = top && top.band !== "no" ? top.name : null
    return { decision: { blocked, allowed, topic, reason: null }, answers: rows }
}
