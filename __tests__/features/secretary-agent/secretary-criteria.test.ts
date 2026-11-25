import { describe, expect, it } from "vitest"
import { evaluateCriteria, hasSubjectCriteria, type SubjectResult } from "@/features/secretary-agent/criteria"
import { DEFAULT_SECRETARY_SETTINGS, type SecretaryCriteria } from "@/features/secretary-agent/schemas"

const PERSON = "5531999999999@s.whatsapp.net"
const GROUP = "120363000000000001@g.us"

function criteria(patch: Partial<SecretaryCriteria> = {}): SecretaryCriteria {
    return { ...DEFAULT_SECRETARY_SETTINGS.criteria, baseScope: "all", chatTypes: { direct: true, groups: true }, groupMode: "always", ...patch }
}
const subject = (patch: Partial<SubjectResult>): SubjectResult => ({ never: false, always: false, topic: null, reason: null, ...patch })
const person = { jid: PERSON, isGroup: false, mentioned: false }

describe("evaluateCriteria (precedência)", () => {
    it("excluído vence até o assunto \"sempre\"", () => {
        const verdict = evaluateCriteria(criteria({ exclude: [PERSON] }), person, subject({ always: true }))
        expect(verdict).toMatchObject({ decision: "skip", rule: "excluded" })
    })

    it("assunto \"nunca\" vence o assunto \"sempre\" e a inclusão", () => {
        const verdict = evaluateCriteria(criteria({ include: [PERSON] }), person, subject({ never: true, always: true, reason: "dinheiro" }))
        expect(verdict).toMatchObject({ decision: "skip", rule: "subject-never" })
        expect(verdict.reason).toContain("dinheiro")
    })

    it("assunto \"sempre\" responde mesmo com escopo base \"nenhuma\" e tipo desligado", () => {
        const verdict = evaluateCriteria(criteria({ baseScope: "none", chatTypes: { direct: false, groups: false } }), person, subject({ always: true }))
        expect(verdict).toMatchObject({ decision: "reply", rule: "subject-always" })
    })

    it("inclusão vence o escopo base, o tipo de conversa e a menção em grupo", () => {
        const verdict = evaluateCriteria(criteria({ baseScope: "none", include: [GROUP], chatTypes: { direct: true, groups: false }, groupMode: "mention" }), { jid: GROUP, isGroup: true, mentioned: false }, null)
        expect(verdict).toMatchObject({ decision: "reply", rule: "included" })
    })

    it("tipo de conversa desligado não responde", () => {
        expect(evaluateCriteria(criteria({ chatTypes: { direct: false, groups: true } }), person, null)).toMatchObject({ decision: "skip", rule: "chat-type" })
        expect(evaluateCriteria(criteria({ chatTypes: { direct: true, groups: false } }), { jid: GROUP, isGroup: true, mentioned: true }, null)).toMatchObject({ decision: "skip", rule: "chat-type" })
    })

    it("escopo base decide por último", () => {
        expect(evaluateCriteria(criteria({ baseScope: "none" }), person, null)).toMatchObject({ decision: "skip", rule: "base-none" })
        expect(evaluateCriteria(criteria(), person, null)).toMatchObject({ decision: "reply", rule: "base-all" })
    })

    it("grupo \"só quando mencionado\" exige menção ou resposta ao dono", () => {
        const config = criteria({ groupMode: "mention" })
        expect(evaluateCriteria(config, { jid: GROUP, isGroup: true, mentioned: false }, null)).toMatchObject({ decision: "skip", rule: "group-mention" })
        expect(evaluateCriteria(config, { jid: GROUP, isGroup: true, mentioned: true }, null)).toMatchObject({ decision: "reply", rule: "base-all" })
    })
})

describe("hasSubjectCriteria", () => {
    it("só considera critério de assunto com descrição ou exemplo", () => {
        expect(hasSubjectCriteria(criteria())).toBe(false)
        expect(hasSubjectCriteria(criteria({ subjects: { always: { description: "", examples: ["orçamento"] }, never: { description: "", examples: [] } } }))).toBe(true)
    })
})
