import { CRITERIA_STEP_LABELS, type CriteriaStepId } from "./criteria"
import type { SecretaryCriteria } from "./schemas"

/**
 * Resumo em frases e fluxo dos critérios (PURO), atualizados enquanto o dono edita a aba Critérios. Os nomes das
 * conversas vêm de `nameOf` (o cache de contatos); sem nome, o número.
 */

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`)
const shortList = (items: string[], max = 3) => (items.length > max ? `${items.slice(0, max).join(", ")} e mais ${items.length - max}` : list(items))

export function describeCriteria(criteria: SecretaryCriteria, nameOf: (jid: string) => string = (jid) => jid.split("@")[0] ?? jid): string {
    const { audience, subjects } = criteria
    const groupsText = audience.groupReply === "mention" ? "aos grupos só quando te mencionam" : "a todos os grupos"
    let who: string
    if (audience.mode === "selected") {
        who = audience.selected.length ? `Responde só a ${shortList(audience.selected.map(nameOf))}` : "Não responde a ninguém (nenhuma conversa escolhida)"
        if (audience.selected.length && audience.groupReply === "mention") who += " (nos grupos, só quando te mencionam)"
    } else if (audience.direct && audience.groups) who = `Responde a todas as conversas individuais e ${groupsText}`
    else if (audience.direct) who = "Responde a todas as conversas individuais (grupos não)"
    else if (audience.groups) who = audience.groupReply === "mention" ? "Responde só aos grupos, quando te mencionam (conversas individuais não)" : "Responde só aos grupos (conversas individuais não)"
    else who = "Não responde a ninguém (conversas individuais e grupos desligados)"
    if (audience.blocked.length) who += `, exceto ${shortList(audience.blocked.map(nameOf))}`
    const blocked = subjects.blocked.map((rule) => rule.name)
    let about: string
    if (subjects.mode === "only") about = subjects.allowed.length ? `só sobre ${list(subjects.allowed.map((rule) => rule.name))}` : "sobre nenhum assunto (nenhum liberado)"
    else about = "sobre qualquer assunto"
    if (blocked.length) about += `${subjects.mode === "only" ? "; nunca" : ", exceto"} ${list(blocked)}`
    return `${who}; ${about}.`
}

export interface CriteriaFlowStep {
    id: CriteriaStepId
    label: string
    /** O que acontece com "sim" e com "não" neste passo. */
    yes: string
    no: string
}

/** Passos do fluxo da decisão para a configuração atual (os mesmos ids dos `steps` de `evaluateCriteria`). */
export function criteriaSteps(criteria: SecretaryCriteria): CriteriaFlowStep[] {
    const { audience, subjects } = criteria
    const steps: CriteriaFlowStep[] = [{ id: "blocked", label: CRITERIA_STEP_LABELS.blocked, yes: "Não responde", no: "Segue" }]
    steps.push({
        id: "audience",
        label: audience.mode === "selected" ? "Está entre os escolhidos?" : CRITERIA_STEP_LABELS.audience,
        yes: "Segue",
        no: "Não responde",
    })
    if (audience.groups || audience.mode === "selected") {
        steps.push({ id: "mention", label: CRITERIA_STEP_LABELS.mention, yes: "Segue", no: audience.groupReply === "mention" ? "Não responde" : "Segue (responde sempre)" })
    }
    if (subjects.blocked.length) steps.push({ id: "subject-blocked", label: CRITERIA_STEP_LABELS["subject-blocked"], yes: "Não responde", no: "Segue" })
    if (subjects.mode === "only") steps.push({ id: "subject-allowed", label: CRITERIA_STEP_LABELS["subject-allowed"], yes: "Responde", no: "Não responde" })
    return steps
}
