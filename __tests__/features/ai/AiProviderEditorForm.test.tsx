/** @vitest-environment happy-dom */
import '../../helpers/integrations-render'

import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import { aiApiKeysMock, apiKeyDto } from "../../helpers/ai-api-keys"
import { draftFrom } from "@nandobfer/integracoes/modules/react/central/detail/draft"
import { getIntegrationDef, type IntegrationId } from "@/features/integrations/registry/definitions"
import type { IntegrationDetailDto } from "@nandobfer/integracoes/modules/core/dto"

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a> }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/features/ai/components/api-keys/ApiKeysCard", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({ ApiKeysCard: ({ provider }: { provider: string }) => <div data-testid={`api-keys-${provider}`} /> }))(importOriginal)) as Record<string, unknown>), }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/features/ai/components/AiModelsCard", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({ AiModelsCard: () => <div data-testid="models" /> }))(importOriginal)) as Record<string, unknown>), }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/features/ai/components/JevUsageCard", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({ JevUsageCard: () => <div data-testid="jev-usage" /> }))(importOriginal)) as Record<string, unknown>), }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/features/ai/components/OpencodeUsageCard", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({ OpencodeUsageCard: () => <div data-testid="opencode-usage" /> }))(importOriginal)) as Record<string, unknown>), }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/features/ai/components/ProviderUsageCard", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({
    ProviderUsageCard: ({ provider, showCost, keyFilter, hideFilters }: { provider: string; showCost?: boolean; keyFilter?: string; hideFilters?: boolean }) => (
        <div data-testid={`provider-usage-${provider}`} data-show-cost={String(showCost)} data-key-filter={keyFilter ?? ""} data-hide-filters={String(Boolean(hideFilters))} />
    ),
}))(importOriginal)) as Record<string, unknown>), }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/features/opencode-quota/components/go/OpencodeGoSubscriptionCard", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({
    OpencodeGoSubscriptionCard: ({ query }: { query: { apiKey?: string } | null }) => <div data-testid="go-subscription" data-api-key={query?.apiKey ?? "all"} />,
}))(importOriginal)) as Record<string, unknown>), }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/features/ai/hooks/useAiApiKeys", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => aiApiKeysMock([apiKeyDto("key_aaaaaaaaaaaaaaaaaa", "Principal", true)]))(importOriginal)) as Record<string, unknown>), }))
vi.mock("@/features/opencode-accounts/components/OpencodeAccountsCard", () => ({ OpencodeAccountsCard: () => <div data-testid="opencode-accounts" /> }))

import { opexEditor } from '../../helpers/opex-editors'
const AiProviderEditorForm = await opexEditor('ai_opencode')

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
            expect(screen.getByTestId(`provider-usage-${provider.id}`).getAttribute("data-show-cost")).toBe("false")
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

    it("OpenCode Go: Configuração, Modelos e Consumo com a coluna de custo (cota + Extra Usage), sem abas do OpenCode de sessão", () => {
        window.history.replaceState(null, "", "/integracoes/ia/opencode-go")
        renderForm("ai_opencode_go")
        expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Configuração", "Modelos", "Consumo"])
        fireEvent.click(screen.getByRole("tab", { name: "Consumo" }))
        expect(screen.getByTestId("provider-usage-opencode-go").getAttribute("data-show-cost")).toBe("true")
        // OPE-156: o Go usa o chaveiro, então o painel ganha o filtro "Chave de API".
        expect(screen.getByTestId("provider-usage-opencode-go").getAttribute("data-key-filter")).toBe("opencode-go")
        // OPE-167: a assinatura (Console) vem antes do consumo do Opex, com uma barra de filtros só para os dois.
        const subscription = screen.getByTestId("go-subscription")
        expect(subscription.compareDocumentPosition(screen.getByTestId("provider-usage-opencode-go")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(screen.getByTestId("provider-usage-opencode-go").getAttribute("data-hide-filters")).toBe("true")
        expect(screen.getAllByText("Período")).toHaveLength(1)
        expect(screen.getAllByLabelText("Chave de API")).toHaveLength(1)
    })

    it("OpenCode Go (OPE-156): Configuração mostra Chaves de API, sem a chave oc_sk_… em Campos privados", () => {
        window.history.replaceState(null, "", "/integracoes/ia/opencode-go")
        renderForm("ai_opencode_go")
        expect(screen.getByTestId("api-keys-opencode-go")).toBeTruthy()
        expect(screen.queryByText("Chave do OpenCode Go")).toBeNull()
    })
})
