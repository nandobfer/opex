import { describe, expect, it } from "vitest"
import { evaluateCriteria, needsSubjectDecision, type SubjectDecision } from "@/features/secretary-agent/criteria"
import { criteriaSteps, describeCriteria } from "@/features/secretary-agent/criteria-describe"
import { DEFAULT_SECRETARY_SETTINGS, migrateLegacyCriteria, secretarySettingsSchema, withSecretaryDefaults, type SecretaryCriteria } from "@/features/secretary-agent/schemas"

const PERSON = "5531999999999@s.whatsapp.net"
const OTHER = "5531000000000@s.whatsapp.net"
const GROUP = "120363000000000001@g.us"
const MONEY = { id: "dinheiro", name: "Dinheiro", description: "", examples: [] }
const WORK = { id: "trabalho", name: "Trabalho", description: "", examples: [] }

const criteria = (patch: { audience?: Partial<SecretaryCriteria["audience"]>; subjects?: Partial<SecretaryCriteria["subjects"]> } = {}): SecretaryCriteria => ({
    audience: { ...DEFAULT_SECRETARY_SETTINGS.criteria.audience, groups: true, ...patch.audience },
    subjects: { ...DEFAULT_SECRETARY_SETTINGS.criteria.subjects, ...patch.subjects },
})
const subject = (patch: Partial<SubjectDecision> = {}): SubjectDecision => ({ blocked: [], allowed: [], topic: null, reason: null, ...patch })
const person = { jid: PERSON, isGroup: false, mentioned: false }

describe("evaluateCriteria (duas etapas que passam juntas)", () => {
    it("quem está em \"Nunca responder a\" fica de fora mesmo com assunto liberado", () => {
        const verdict = evaluateCriteria(criteria({ audience: { blocked: [PERSON] }, subjects: { mode: "only", allowed: [MONEY] } }), person, subject({ allowed: ["dinheiro"] }))
        expect(verdict).toMatchObject({ decision: "skip", rule: "blocked" })
    })

    it("com \"Só os escolhidos\", quem está fora da lista não é respondido mesmo com assunto liberado", () => {
        const verdict = evaluateCriteria(criteria({ audience: { mode: "selected", selected: [OTHER] }, subjects: { mode: "only", allowed: [MONEY] } }), person, subject({ allowed: ["dinheiro"] }))
        expect(verdict).toMatchObject({ decision: "skip", rule: "not-selected" })
    })

    it("\"Todos\" + \"Só os assuntos liberados\" responde qualquer pessoa só sobre o assunto liberado", () => {
        const config = criteria({ subjects: { mode: "only", allowed: [MONEY] } })
        expect(evaluateCriteria(config, person, subject({ allowed: ["dinheiro"] }))).toMatchObject({ decision: "reply", rule: "allowed" })
        expect(evaluateCriteria(config, person, subject())).toMatchObject({ decision: "skip", rule: "subject-not-allowed" })
    })

    it("\"Só quando me mencionam\" vale também para grupo escolhido", () => {
        const config = criteria({ audience: { mode: "selected", selected: [GROUP], groupReply: "mention" } })
        expect(evaluateCriteria(config, { jid: GROUP, isGroup: true, mentioned: false }, null)).toMatchObject({ decision: "skip", rule: "group-mention" })
        expect(evaluateCriteria(config, { jid: GROUP, isGroup: true, mentioned: true }, null)).toMatchObject({ decision: "reply" })
    })

    it("o assunto bloqueado vence o \"Qualquer assunto\"", () => {
        const verdict = evaluateCriteria(criteria({ subjects: { blocked: [MONEY] } }), person, subject({ blocked: ["dinheiro"] }))
        expect(verdict).toMatchObject({ decision: "skip", rule: "subject-blocked" })
        expect(verdict.reason).toContain("Dinheiro")
    })

    it("tipo de conversa desligado em \"Todos\" barra a conversa", () => {
        expect(evaluateCriteria(criteria({ audience: { groups: false } }), { jid: GROUP, isGroup: true, mentioned: true }, null)).toMatchObject({ decision: "skip", rule: "chat-type" })
    })

    it("os passos trazem pass, fail e skipped nos lugares certos", () => {
        const verdict = evaluateCriteria(criteria({ audience: { mode: "selected", selected: [OTHER] }, subjects: { blocked: [MONEY] } }), person, null)
        expect(verdict.steps.map((step) => [step.id, step.outcome])).toEqual([["blocked", "pass"], ["audience", "fail"], ["subject-blocked", "skipped"], ["subject-allowed", "skipped"]])
        const ok = evaluateCriteria(criteria({ subjects: { blocked: [MONEY], mode: "only", allowed: [WORK] } }), person, subject({ allowed: ["trabalho"] }))
        expect(ok.steps.map((step) => [step.id, step.outcome])).toEqual([["blocked", "pass"], ["audience", "pass"], ["subject-blocked", "pass"], ["subject-allowed", "pass"]])
    })

    it("só pede decisão de assunto com assunto bloqueado ou \"Só os liberados\"", () => {
        expect(needsSubjectDecision(criteria())).toBe(false)
        expect(needsSubjectDecision(criteria({ subjects: { blocked: [MONEY] } }))).toBe(true)
        expect(needsSubjectDecision(criteria({ subjects: { mode: "only", allowed: [MONEY] } }))).toBe(true)
    })
})

describe("migração dos critérios da v1", () => {
    it("escopo todas + exclusões + assunto nunca", () => {
        expect(migrateLegacyCriteria({ baseScope: "all", exclude: [PERSON], include: [], chatTypes: { direct: true, groups: true }, groupMode: "always", subjects: { always: { description: "", examples: [] }, never: { description: "dinheiro", examples: ["pix"] } } })).toEqual({
            audience: { mode: "everyone", selected: [], blocked: [PERSON], direct: true, groups: true, groupReply: "always" },
            subjects: { mode: "any", blocked: [{ id: "assunto-bloqueado", name: "Assunto bloqueado", description: "dinheiro", examples: ["pix"] }], allowed: [] },
        })
    })

    it("escopo nenhuma vira \"Só os escolhidos\" com as inclusões, e o assunto sempre não vira \"Só os liberados\"", () => {
        const migrated = migrateLegacyCriteria({ baseScope: "none", exclude: [], include: [GROUP], chatTypes: { direct: true, groups: false }, groupMode: "mention", subjects: { always: { description: "trabalho", examples: [] }, never: { description: "", examples: [] } } }) as SecretaryCriteria
        expect(migrated.audience).toMatchObject({ mode: "selected", selected: [GROUP], groupReply: "mention" })
        expect(migrated.subjects.mode).toBe("any")
        expect(migrated.subjects.allowed).toHaveLength(1)
    })

    it("configuração salva no formato antigo passa no schema novo", () => {
        const saved = { ...DEFAULT_SECRETARY_SETTINGS, decision: undefined, criteria: { baseScope: "all", exclude: [], include: [], chatTypes: { direct: true, groups: false }, groupMode: "mention", subjects: { always: { description: "", examples: [] }, never: { description: "", examples: [] } } } }
        const parsed = secretarySettingsSchema.safeParse(withSecretaryDefaults(saved))
        expect(parsed.success).toBe(true)
    })
})

describe("describeCriteria e criteriaSteps", () => {
    const nameOf = (jid: string) => ({ [PERSON]: "Mãe", [OTHER]: "Chefe", [GROUP]: "Família" })[jid] ?? jid
    it("descreve os quatro cenários principais", () => {
        expect(describeCriteria(criteria({ audience: { blocked: [PERSON, OTHER] }, subjects: { blocked: [MONEY] } }), nameOf)).toBe("Responde a todas as conversas individuais e aos grupos só quando te mencionam, exceto Mãe e Chefe; sobre qualquer assunto, exceto Dinheiro.")
        expect(describeCriteria(criteria({ audience: { groups: false } }), nameOf)).toBe("Responde a todas as conversas individuais (grupos não); sobre qualquer assunto.")
        expect(describeCriteria(criteria({ audience: { mode: "selected", selected: [GROUP], groupReply: "always" }, subjects: { mode: "only", allowed: [WORK] } }), nameOf)).toBe("Responde só a Família; só sobre Trabalho.")
        expect(describeCriteria(criteria({ audience: { direct: false, groups: false } }), nameOf)).toBe("Não responde a ninguém (conversas individuais e grupos desligados); sobre qualquer assunto.")
    })

    it("o fluxo acompanha a configuração", () => {
        expect(criteriaSteps(criteria({ audience: { groups: false } })).map((step) => step.id)).toEqual(["blocked", "audience"])
        expect(criteriaSteps(criteria({ subjects: { blocked: [MONEY], mode: "only", allowed: [WORK] } })).map((step) => step.id)).toEqual(["blocked", "audience", "mention", "subject-blocked", "subject-allowed"])
    })
})
