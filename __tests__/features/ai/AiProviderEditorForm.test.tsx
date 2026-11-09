/** @vitest-environment happy-dom */
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import { draftFrom } from "@/features/integrations/components/detail/draft"
import { getIntegrationDef, type IntegrationId } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a> }))
vi.mock("@/features/ai/components/api-keys/ApiKeysCard", () => ({ ApiKeysCard: ({ provider }: { provider: string }) => <div data-testid={`api-keys-${provider}`} /> }))
vi.mock("@/features/ai/components/AiModelsCard", () => ({ AiModelsCard: () => <div data-testid="models" /> }))
vi.mock("@/features/ai/components/JevUsageCard", () => ({ JevUsageCard: () => <div data-testid="jev-usage" /> }))
vi.mock("@/features/ai/components/OpencodeUsageCard", () => ({ OpencodeUsageCard: () => <div data-testid="opencode-usage" /> }))
vi.mock("@/features/ai/components/ProviderUsageCard", () => ({ ProviderUsageCard: ({ provider, keyFilter }: { provider: string; keyFilter?: string }) => <div data-testid={`provider-usage-${provider}`} data-key-filter={keyFilter ?? ""} /> }))
vi.mock("@/features/opencode-accounts/components/OpencodeAccountsCard", () => ({ OpencodeAccountsCard: () => <div data-testid="opencode-accounts" /> }))

import { AiProviderEditorForm } from "@/features/ai/components/AiProviderEditorForm"

const detail = (id: IntegrationId): IntegrationDetailDto => ({
    id,
    name: "Provedor",
    description: "Provedor de IA",
    environment: "interno",
    debugMode: false,
    publicValues: {},
    secrets: {},
    encryptionKeyConfigured: true,
    stored: true,
    health: { status: "ok" },
    swaggerUrl: null,
    explorerAuth: null,
})

function renderForm(id: IntegrationId) {
    const def = getIntegrationDef(id)!
    const data = detail(id)
    const setDraft = vi.fn()
    render(
        <AiProviderEditorForm
            def={def}
            data={data}
            draft={draftFrom(data)}
            setDraft={setDraft}
            dirty={false}
            pending={false}
            onSave={async () => true}
            onUndo={vi.fn()}
        />,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, "", "/integracoes/ia/opencode")
})
afterEach(cleanup)

describe("AiProviderEditorForm", () => {
    it("OpenCode tem as abas Configuração, Modelos, Contas e Consumo", () => {
        renderForm("ai_opencode")
        expect(screen.getByRole("tab", { name: "Configuração" })).toBeTruthy()
        expect(screen.getByRole("tab", { name: "Modelos" })).toBeTruthy()
        expect(screen.getByRole("tab", { name: "Consumo" })).toBeTruthy()

        fireEvent.click(screen.getByRole("tab", { name: "Modelos" }))
        expect(screen.getByTestId("models")).toBeTruthy()

        fireEvent.click(screen.getByRole("tab", { name: "Contas" }))
        expect(screen.getByTestId("opencode-accounts")).toBeTruthy()

        fireEvent.click(screen.getByRole("tab", { name: "Consumo" }))
        expect(screen.getByTestId("opencode-usage")).toBeTruthy()
    })

    it("JEV tem Consumo e usa o painel do JEV", () => {
        window.history.replaceState(null, "", "/integracoes/ia/jev")
        renderForm("ai_jev")
        fireEvent.click(screen.getByRole("tab", { name: "Consumo" }))
        expect(screen.getByTestId("jev-usage")).toBeTruthy()
    })

    it("Gemini, Anthropic, OpenAI e DeepSeek têm Consumo com o painel genérico do provedor", () => {
        const providers = [
            { integration: "ai_gemini", id: "gemini" },
            { integration: "ai_anthropic", id: "anthropic" },
            { integration: "ai_openai", id: "openai" },
            { integration: "ai_deepseek", id: "deepseek" },
        ] as const
        for (const provider of providers) {
            window.history.replaceState(null, "", `/integracoes/ia/${provider.id}`)
            cleanup()
            renderForm(provider.integration)
            expect(screen.queryByRole("tab", { name: "Contas" })).toBeNull()
            fireEvent.click(screen.getByRole("tab", { name: "Consumo" }))
            // O filtro "Chave de API" (OPE-155) depende de o pai repassar o provedor como keyFilter.
            expect(screen.getByTestId(`provider-usage-${provider.id}`).getAttribute("data-key-filter")).toBe(provider.id)
        }
    })

    it("Configuração dos provedores por API key mostra Chaves de API, sem o campo privado da chave; OpenCode não", () => {
        for (const provider of ["gemini", "anthropic", "openai", "deepseek", "jev"] as const) {
            window.history.replaceState(null, "", `/integracoes/ia/${provider}`)
            cleanup()
            renderForm(`ai_${provider}`)
            expect(screen.getByTestId(`api-keys-${provider}`)).toBeTruthy()
            expect(screen.queryByText("API key")).toBeNull()
        }
        window.history.replaceState(null, "", "/integracoes/ia/opencode")
        cleanup()
        renderForm("ai_opencode")
        expect(screen.queryByTestId(/api-keys-/)).toBeNull()
    })
})
