import { describe, expect, it } from "vitest"
import { DEFAULT_SECRETARY_SETTINGS, secretarySettingsSchema, type SecretarySettings } from "@/features/secretary-agent/schemas"
import { applyAudiencePatch, applyGeneralPatch, formatSettingsIssues, removeSubject, secretaryReadiness, subjectIdOf, upsertSubject } from "@/features/secretary-agent/settings-patch"

/** Alterações parciais do Secretário pelo Agente Opex (OPE-200): mesmas regras da tela. */

const ready: SecretarySettings = {
    ...DEFAULT_SECRETARY_SETTINGS,
    main: { provider: "opencode-go", model: "kimi-k2", agent: null, variant: null, temperature: null },
    instance: "opex",
}
const ana = "5531999999999@s.whatsapp.net"
const grupo = "120363000000000001@g.us"

const rejectMessage = (settings: SecretarySettings) => {
    const parsed = secretarySettingsSchema.safeParse(settings)
    if (parsed.success) throw new Error("deveria recusar")
    return formatSettingsIssues(parsed.error)
}

describe("o que falta para ligar (readiness)", () => {
    it("sem provedor, modelo e instância lista exatamente o que falta", () => {
        expect(secretaryReadiness(DEFAULT_SECRETARY_SETTINGS)).toEqual({
            canEnable: false,
            missing: ["Escolha o provedor para ligar o agente", "Escolha o modelo para ligar o agente", "Escolha a instância do WhatsApp"],
        })
    })

    it("com tudo configurado, pode ligar; modelo que não informa custo exige o preço", () => {
        expect(secretaryReadiness(ready)).toEqual({ canEnable: true, missing: [] })
        const anthropic = { ...ready, main: { ...ready.main, provider: "anthropic" as const, model: "claude-x" } }
        expect(secretaryReadiness(anthropic).missing).toEqual([expect.stringContaining("Informe o preço de claude-x")])
        expect(secretaryReadiness(applyGeneralPatch(anthropic, { prices: [{ provider: "anthropic", model: "claude-x", inputPerMTok: 3, outputPerMTok: 15 }] })).canEnable).toBe(true)
    })
})

describe("recusas com o motivo (mesmo schema da tela)", () => {
    it('"Só os escolhidos" sem conversa e "Só os assuntos liberados" sem assunto', () => {
        const selected = applyAudiencePatch(ready, { mode: "selected" })
        expect(rejectMessage(selected)).toContain("Escolha ao menos uma conversa, ou responda a todos")
        const only = { ...ready, criteria: { ...ready.criteria, subjects: { ...ready.criteria.subjects, mode: "only" as const } } }
        expect(rejectMessage(only)).toContain("Cadastre ao menos um assunto liberado")
        expect(rejectMessage(only)).toContain("Nada foi alterado")
    })

    it("campos numéricos fora da faixa citam o rótulo do campo", () => {
        const message = rejectMessage(applyGeneralPatch(ready, { limits: { repliesPerHour: 500 }, human: { delayMinSeconds: 20, delayMaxSeconds: 10 } }))
        expect(message).toContain("Respostas por conversa por hora: Máximo 200")
        expect(message).toContain("O máximo não pode ser menor que o mínimo")
    })
})

describe("patches", () => {
    it("geral: só muda o que veio; 'Mesmo do agente' mantém o modelo guardado", () => {
        const withMedia = applyGeneralPatch(ready, { media: { model: { sameAsAgent: false, provider: "gemini", model: "gemini-2.5-flash" } } })
        expect(withMedia.media.model).toEqual({ sameAsAgent: false, provider: "gemini", model: "gemini-2.5-flash", agent: null, variant: null })
        const back = applyGeneralPatch(withMedia, { media: { model: { sameAsAgent: true } }, limits: { repliesPerHour: 30 } })
        expect(back.media.model).toMatchObject({ sameAsAgent: true, provider: "gemini" })
        expect(back.limits).toEqual({ repliesPerHour: 30, dailyBudgetUsd: ready.limits.dailyBudgetUsd })
        expect(back.main).toEqual(ready.main)
        expect(applyGeneralPatch(ready, { decisionModel: { sameAsAgent: false, provider: "jev", model: "jev-1" } }).decision.model.provider).toBe("jev")
    })

    it("público: adiciona e remove nos escolhidos e em nunca responder sem duplicar", () => {
        const once = applyAudiencePatch(ready, { mode: "selected", addSelected: [ana, ana], addBlocked: [grupo] })
        const twice = applyAudiencePatch(once, { addSelected: [ana], addBlocked: [grupo] })
        expect(twice.criteria.audience).toMatchObject({ mode: "selected", selected: [ana], blocked: [grupo] })
        expect(applyAudiencePatch(twice, { removeBlocked: [grupo] }).criteria.audience.blocked).toEqual([])
    })

    it("assuntos: cria, edita pelo nome sem caixa/acento, renomeia e remove", () => {
        const created = upsertSubject(ready, "blocked", { name: "Política", description: "Eleições" })
        expect(created.created).toBe(true)
        expect(created.settings.criteria.subjects.blocked).toEqual([{ id: "politica", name: "Política", description: "Eleições", examples: [] }])
        const edited = upsertSubject(created.settings, "blocked", { name: "politica", examples: ["Em quem você vota?"] })
        expect(edited.created).toBe(false)
        expect(edited.settings.criteria.subjects.blocked).toEqual([{ id: "politica", name: "Política", description: "Eleições", examples: ["Em quem você vota?"] }])
        const renamed = upsertSubject(edited.settings, "blocked", { name: "POLÍTICA", newName: "Política e eleições" }).settings
        expect(renamed.criteria.subjects.blocked[0]).toMatchObject({ id: "politica", name: "Política e eleições" })
        expect(removeSubject(renamed, "política e eleições")?.settings.criteria.subjects.blocked).toEqual([])
        expect(removeSubject(renamed, "Futebol")).toBeNull()
    })

    it("o mesmo nome não fica bloqueado e liberado; remover sem lista um nome nas duas pede a lista", () => {
        const allowed = upsertSubject(ready, "allowed", { name: "Orçamento" }).settings
        expect(() => upsertSubject(allowed, "blocked", { name: "orcamento" })).toThrow('O assunto "Orçamento" já está nos assuntos liberados')
        const both = upsertSubject(allowed, "blocked", { name: "Política" }).settings
        expect(() => upsertSubject(both, "blocked", { name: "Política", newName: "Orçamento" })).toThrow("já está nos assuntos liberados")
        const twins = upsertSubject(both, "blocked", { name: "Futebol" }).settings
        expect(() => upsertSubject(twins, "blocked", { name: "Futebol", newName: "política" })).toThrow('Já existe o assunto "Política" nos assuntos bloqueados')
        const legacy = { ...ready, criteria: { ...ready.criteria, subjects: { ...ready.criteria.subjects, blocked: [{ id: "x", name: "Saúde", description: "", examples: [] }], allowed: [{ id: "y", name: "saude", description: "", examples: [] }] } } }
        expect(() => removeSubject(legacy, "Saúde")).toThrow("informe a lista")
        expect(removeSubject(legacy, "Saúde", "allowed")?.settings.criteria.subjects).toMatchObject({ blocked: [{ name: "Saúde" }], allowed: [] })
    })

    it("id do assunto é único na lista e o teto de 20 assuntos é do schema", () => {
        expect(subjectIdOf("Orçamento", ["orcamento"])).toBe("orcamento-2")
        let next = ready
        for (let n = 1; n <= 21; n++) next = upsertSubject(next, "allowed", { name: `Assunto ${n}` }).settings
        expect(rejectMessage(next)).toContain("Máximo de 20 assuntos")
    })
})
