import { describe, expect, it } from "vitest"
import { DEFAULT_SECRETARY_SETTINGS, type SecretarySettings } from "@/features/secretary-agent/schemas"
import { emptyPersonality } from "@/features/secretary-agent/personality"
import { buildPersonalityView, buildSecretaryView, summarizePersonality, type SecretaryViewLookups } from "@/features/secretary-agent/settings-view"

/** Retrato legível do Secretário para o Agente Opex (OPE-200): nomes, nunca identificadores. */

const ana = "5531999999999@s.whatsapp.net"
const grupo = "120363000000000001@g.us"
const settings: SecretarySettings = {
    ...DEFAULT_SECRETARY_SETTINGS,
    enabled: true,
    mode: "observe",
    instance: "opex",
    main: { provider: "anthropic", model: "claude-sonnet-x", agent: null, variant: "high", temperature: 0.4 },
    analysis: { model: { sameAsAgent: false, provider: "gemini", model: "gemini-2.5-pro", agent: null, variant: null } },
    decision: { model: { sameAsAgent: false, provider: "jev", model: "jev-1", agent: null, variant: null } },
    pricing: { "anthropic/claude-sonnet-x": { inputPerMTok: 3, outputPerMTok: 15 }, "gemini/gemini-2.5-pro": { inputPerMTok: 1.25, outputPerMTok: 10 } },
    criteria: {
        audience: { mode: "selected", selected: [ana], blocked: [grupo], direct: true, groups: true, groupReply: "mention" },
        subjects: { mode: "only", blocked: [{ id: "politica", name: "Política", description: "", examples: [] }], allowed: [{ id: "orcamento", name: "Orçamento", description: "Preços", examples: ["Quanto custa?"] }] },
    },
}
const names: Record<string, string> = { [ana]: "Ana", [grupo]: "Família" }
const models: Record<string, string> = { "anthropic/claude-sonnet-x": "Claude Sonnet X", "gemini/gemini-2.5-pro": "Gemini 2.5 Pro" }
const lookups: SecretaryViewLookups = {
    providerName: (id) => ({ anthropic: "Anthropic", gemini: "Google Gemini", jev: "JEV" })[id] ?? id,
    modelName: (provider, model) => models[`${provider}/${model}`] ?? null,
    nameOf: (jid) => names[jid] ?? "Contato sem nome",
    instance: { name: "opex", profileName: "Burgos", number: "5531988887777", state: "connected" },
    providerStatus: (id) => (id === "anthropic" ? { configured: true, connected: true } : { configured: false, connected: false }),
    evolutionConfigured: true,
}

describe("retrato do Secretário", () => {
    it("usa nomes de provedor, modelo, instância, conversas e assuntos", () => {
        const view = buildSecretaryView(settings, lookups)
        expect(view).toMatchObject({
            status: "Ligado",
            mode: "Só observar",
            instance: { name: "opex", profile: "Burgos", number: "+5531988887777", connection: "Conectada" },
            models: {
                agent: { provider: "Anthropic", model: "Claude Sonnet X", variant: "high", temperature: 0.4, summary: "Anthropic · Claude Sonnet X (high)" },
                media: { sameAsAgent: true, summary: "Mesmo do agente" },
                analysis: { summary: "Google Gemini · Gemini 2.5 Pro" },
                subjectDecision: { summary: "JEV · jev-1" },
            },
            estimatedPricesUsdPerMTok: [{ model: "Claude Sonnet X (Anthropic)", inputPerMTok: 3, outputPerMTok: 15 }, { model: "Gemini 2.5 Pro (Google Gemini)", inputPerMTok: 1.25, outputPerMTok: 10 }],
            criteria: {
                audience: { whoCanBeAnswered: "Só os escolhidos", selected: ["Ana"], neverAnswer: ["Família"], inGroups: "Só quando me mencionam" },
                subjects: { about: "Só os assuntos liberados", blocked: [{ name: "Política" }], allowed: [{ name: "Orçamento", description: "Preços", examples: ["Quanto custa?"] }] },
            },
            secrets: { providers: [{ provider: "Anthropic", key: "configurada", connection: "conectado" }, { provider: "Google Gemini", key: "não configurada" }, { provider: "JEV", key: "não configurada" }], evolutionApi: "configurada" },
        })
        expect(view.criteria.summary).toContain("Ana")
    })

    it("não devolve JID, chave de preço, id de assunto nem ObjectId", () => {
        const personality = { base: emptyPersonality(), variants: [{ jid: ana, title: "Com a Ana", origin: "owner" as const, blocks: [{ key: "tom", title: "Tom e formalidade", content: "Carinhoso" }] }] }
        const json = JSON.stringify([buildSecretaryView(settings, lookups), buildPersonalityView(personality, lookups.nameOf), summarizePersonality(personality, lookups.nameOf)])
        expect(json).not.toMatch(/@s\.whatsapp\.net|@g\.us|@lid/)
        expect(json).not.toContain("anthropic/claude-sonnet-x")
        expect(json).not.toContain('"politica"')
        expect(json).not.toMatch(/\b[0-9a-f]{24}\b/)
        expect(json).toContain("Com a Ana")
    })

    it("instância ausente na Evolution e sem instância escolhida", () => {
        expect(buildSecretaryView(settings, { ...lookups, instance: null }).instance).toEqual({ name: "opex", connection: "Não encontrada na Evolution" })
        expect(buildSecretaryView(DEFAULT_SECRETARY_SETTINGS, lookups)).toMatchObject({ status: "Desligado", instance: "Nenhuma instância escolhida", models: { agent: { summary: "Não escolhido" } }, readiness: { canEnable: false } })
    })
})
