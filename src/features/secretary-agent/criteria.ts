import type { SecretaryCriteria, SubjectRule } from "./schemas"

/**
 * Critérios de resposta do Agente Secretário (função PURA, plano v3 da OPE-192). Duas etapas que precisam passar
 * JUNTAS, sem precedência entre elas:
 * 1. "Quem pode ser respondido": quem está em "Nunca responder a" fica de fora; "Responder a" é todos (com os tipos de
 *    conversa) ou só os escolhidos; em grupo, sempre ou só quando mencionam o dono (vale também para grupo escolhido).
 * 2. "Sobre o quê": um assunto bloqueado sempre bloqueia; "Responder sobre" é qualquer assunto ou só os liberados.
 * Quem não passa na etapa 1 não é respondido, seja qual for o assunto.
 */

export type CriteriaRule = "blocked" | "not-selected" | "chat-type" | "group-mention" | "subject-blocked" | "subject-not-allowed" | "allowed"
export type CriteriaStepId = "blocked" | "audience" | "mention" | "subject-blocked" | "subject-allowed"
export type CriteriaOutcome = "pass" | "fail" | "skipped"

export interface CriteriaStep {
    id: CriteriaStepId
    label: string
    outcome: CriteriaOutcome
    detail: string
}

export interface CriteriaConversation {
    jid: string
    isGroup: boolean
    /** Em grupo: menção ao número/LID do dono ou resposta a uma mensagem dele. */
    mentioned: boolean
}

/** Decisão do assunto (modelo de texto ou JEV): os assuntos que bateram, pelo `id`. */
export interface SubjectDecision {
    blocked: string[]
    allowed: string[]
    /** Assunto curto (métricas "assuntos mais frequentes"). */
    topic: string | null
    reason: string | null
}

export interface CriteriaVerdict {
    decision: "reply" | "skip"
    rule: CriteriaRule
    reason: string
    steps: CriteriaStep[]
}

export const CRITERIA_RULE_LABELS: Record<CriteriaRule, string> = {
    blocked: "Nunca responder a",
    "not-selected": "Fora dos escolhidos",
    "chat-type": "Tipo de conversa desligado",
    "group-mention": "Grupo sem menção",
    "subject-blocked": "Assunto bloqueado",
    "subject-not-allowed": "Assunto não liberado",
    allowed: "Passou nas duas etapas",
}

export const CRITERIA_STEP_LABELS: Record<CriteriaStepId, string> = {
    blocked: "Está em \"Nunca responder a\"?",
    audience: "Pode ser respondido?",
    mention: "No grupo, te mencionou?",
    "subject-blocked": "É um assunto bloqueado?",
    "subject-allowed": "É um assunto liberado?",
}

/** Há decisão de assunto a tomar (só então o modelo ou o JEV é chamado). */
export function needsSubjectDecision(criteria: SecretaryCriteria): boolean {
    return criteria.subjects.blocked.length > 0 || criteria.subjects.mode === "only"
}

export function isBlocked(criteria: SecretaryCriteria, jid: string): boolean {
    return criteria.audience.blocked.includes(jid)
}

const names = (rules: readonly SubjectRule[], ids: readonly string[]) => rules.filter((rule) => ids.includes(rule.id)).map((rule) => rule.name).join(", ")
const step = (id: CriteriaStepId, outcome: CriteriaOutcome, detail: string): CriteriaStep => ({ id, label: CRITERIA_STEP_LABELS[id], outcome, detail })

/** Etapa 1 ("Quem pode ser respondido"): os passos e, se falhar, a regra e o motivo. */
export function evaluateAudience(criteria: SecretaryCriteria, conversation: CriteriaConversation): { steps: CriteriaStep[]; failure: { rule: CriteriaRule; reason: string } | null } {
    const { audience } = criteria
    const steps: CriteriaStep[] = []
    const fail = (rule: CriteriaRule, reason: string) => ({ steps, failure: { rule, reason } })
    if (isBlocked(criteria, conversation.jid)) {
        steps.push(step("blocked", "fail", "Sim: a conversa está em \"Nunca responder a\"."))
        return fail("blocked", "A conversa está em \"Nunca responder a\".")
    }
    steps.push(step("blocked", "pass", "Não."))
    if (audience.mode === "selected") {
        if (!audience.selected.includes(conversation.jid)) {
            steps.push(step("audience", "fail", "Não: \"Responder a\" está em \"Só os escolhidos\" e a conversa não está na lista."))
            return fail("not-selected", "A conversa não está entre os escolhidos de \"Responder a\".")
        }
        steps.push(step("audience", "pass", "Sim: está entre os escolhidos."))
    } else if (conversation.isGroup ? !audience.groups : !audience.direct) {
        const kind = conversation.isGroup ? "Grupos" : "Conversas individuais"
        steps.push(step("audience", "fail", `Não: "${kind}" está desligado em "Responder a: Todos".`))
        return fail("chat-type", `"${kind}" está desligado em "Responder a".`)
    } else {
        steps.push(step("audience", "pass", conversation.isGroup ? "Sim: responde a todos os grupos." : "Sim: responde a todas as conversas individuais."))
    }
    if (conversation.isGroup) {
        if (audience.groupReply === "mention" && !conversation.mentioned) {
            steps.push(step("mention", "fail", "Não: no grupo, só responde quando te mencionam."))
            return fail("group-mention", "No grupo, só responde quando te mencionam.")
        }
        steps.push(step("mention", "pass", audience.groupReply === "mention" ? "Sim: a mensagem te menciona." : "Não precisa: em grupos, responde sempre."))
    }
    return { steps, failure: null }
}

/**
 * As duas etapas. `subject` é a decisão do assunto (só existe quando `needsSubjectDecision`); sem ela, a etapa 2
 * passa (não há assunto a conferir). Os passos de uma etapa não alcançada vêm como `skipped`.
 */
export function evaluateCriteria(criteria: SecretaryCriteria, conversation: CriteriaConversation, subject: SubjectDecision | null): CriteriaVerdict {
    const audience = evaluateAudience(criteria, conversation)
    const steps = [...audience.steps]
    const { subjects } = criteria
    const pending: CriteriaStep[] = [step("subject-blocked", "skipped", subjects.blocked.length ? "Não chegou a conferir." : "Nenhum assunto bloqueado."), step("subject-allowed", "skipped", subjects.mode === "only" ? "Não chegou a conferir." : "Responde sobre qualquer assunto.")]
    if (audience.failure) return { decision: "skip", ...audience.failure, steps: [...steps, ...pending] }
    const blocked = subject?.blocked.filter((id) => subjects.blocked.some((rule) => rule.id === id)) ?? []
    if (blocked.length) {
        steps.push(step("subject-blocked", "fail", `Sim: ${names(subjects.blocked, blocked)}.`), pending[1]!)
        return { decision: "skip", rule: "subject-blocked", reason: `Assunto bloqueado (${names(subjects.blocked, blocked)})${subject?.reason ? `: ${subject.reason}` : ""}`, steps }
    }
    steps.push(step("subject-blocked", subjects.blocked.length ? "pass" : "skipped", subjects.blocked.length ? "Não." : "Nenhum assunto bloqueado."))
    if (subjects.mode === "only") {
        const allowed = subject?.allowed.filter((id) => subjects.allowed.some((rule) => rule.id === id)) ?? []
        if (!allowed.length) {
            steps.push(step("subject-allowed", "fail", "Não: só responde sobre os assuntos liberados."))
            return { decision: "skip", rule: "subject-not-allowed", reason: `O assunto não é um dos liberados${subject?.reason ? `: ${subject.reason}` : ""}`, steps }
        }
        steps.push(step("subject-allowed", "pass", `Sim: ${names(subjects.allowed, allowed)}.`))
    } else {
        steps.push(step("subject-allowed", "skipped", "Responde sobre qualquer assunto."))
    }
    return { decision: "reply", rule: "allowed", reason: "A mensagem passou nas duas etapas (quem e sobre o quê).", steps }
}
