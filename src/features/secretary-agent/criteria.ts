import type { SecretaryCriteria } from "./schemas"

/**
 * Critérios de resposta do Agente Secretário (função PURA). Precedência, da mais forte para a mais fraca:
 * contato/grupo excluído > assunto "nunca" > assunto "sempre" > inclusões > escopo base. O tipo de conversa
 * (individuais/grupos) e o "só quando mencionado" fazem parte da camada do escopo base: uma inclusão
 * explícita ou um assunto "sempre" passam por cima deles.
 */

export type CriteriaRule = "excluded" | "subject-never" | "subject-always" | "included" | "chat-type" | "group-mention" | "base-all" | "base-none"

export interface CriteriaConversation {
    jid: string
    isGroup: boolean
    /** Em grupo: menção ao número do dono ou resposta a uma mensagem dele. */
    mentioned: boolean
}

/** Resultado da classificação de assunto pela IA (`null` = não classificado: sem critério de assunto). */
export interface SubjectResult {
    never: boolean
    always: boolean
    /** Assunto curto da mensagem (métricas "assuntos mais frequentes"). */
    topic: string | null
    /** Por que a IA casou o assunto (exibido no motivo). */
    reason: string | null
}

export interface CriteriaVerdict {
    decision: "reply" | "skip"
    rule: CriteriaRule
    reason: string
}

export const CRITERIA_RULE_LABELS: Record<CriteriaRule, string> = {
    excluded: "Contato/grupo excluído",
    "subject-never": "Assunto \"nunca\"",
    "subject-always": "Assunto \"sempre\"",
    included: "Contato/grupo incluído",
    "chat-type": "Tipo de conversa",
    "group-mention": "Grupo: só quando mencionado",
    "base-all": "Escopo base: todas",
    "base-none": "Escopo base: nenhuma",
}

/** Ordem exibida na tela (a mais forte primeiro). */
export const CRITERIA_PRECEDENCE: { title: string; description: string }[] = [
    { title: "Contato/grupo excluído", description: "Nunca responde, nem quando o assunto é \"sempre\"." },
    { title: "Assunto \"nunca\"", description: "Fica quieto, não avisa e não marca como lida." },
    { title: "Assunto \"sempre\"", description: "Responde em qualquer conversa que não esteja excluída." },
    { title: "Contatos e grupos incluídos", description: "Responde mesmo com o escopo base \"nenhuma\"." },
    { title: "Escopo base", description: "Todas ou nenhuma, respeitando o tipo de conversa e, em grupo, a menção." },
]

/** Há critério de assunto configurado (só então a IA classifica a mensagem). */
export function hasSubjectCriteria(criteria: Pick<SecretaryCriteria, "subjects">): boolean {
    const filled = (rule: SecretaryCriteria["subjects"]["always"]) => rule.description.trim().length > 0 || rule.examples.some((item) => item.trim().length > 0)
    return filled(criteria.subjects.always) || filled(criteria.subjects.never)
}

export function isExcluded(criteria: Pick<SecretaryCriteria, "exclude">, jid: string): boolean {
    return criteria.exclude.includes(jid)
}

export function evaluateCriteria(criteria: SecretaryCriteria, conversation: CriteriaConversation, subject: SubjectResult | null): CriteriaVerdict {
    if (isExcluded(criteria, conversation.jid)) return { decision: "skip", rule: "excluded", reason: "A conversa está entre os contatos e grupos excluídos" }
    if (subject?.never) return { decision: "skip", rule: "subject-never", reason: `O assunto é um dos que nunca responde${subject.reason ? `: ${subject.reason}` : ""}` }
    if (subject?.always) return { decision: "reply", rule: "subject-always", reason: `O assunto é um dos que sempre responde${subject.reason ? `: ${subject.reason}` : ""}` }
    if (criteria.include.includes(conversation.jid)) return { decision: "reply", rule: "included", reason: "A conversa está entre os contatos e grupos incluídos" }
    if (conversation.isGroup && !criteria.chatTypes.groups) return { decision: "skip", rule: "chat-type", reason: "Conversas em grupo estão desligadas" }
    if (!conversation.isGroup && !criteria.chatTypes.direct) return { decision: "skip", rule: "chat-type", reason: "Conversas individuais estão desligadas" }
    if (criteria.baseScope === "none") return { decision: "skip", rule: "base-none", reason: "O escopo base é \"Não responder nenhuma conversa\"" }
    if (conversation.isGroup && criteria.groupMode === "mention" && !conversation.mentioned) return { decision: "skip", rule: "group-mention", reason: "No grupo, só responde quando mencionado" }
    return { decision: "reply", rule: "base-all", reason: "O escopo base é \"Responder todas as conversas\"" }
}
