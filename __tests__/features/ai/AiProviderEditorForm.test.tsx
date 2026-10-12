/** @vitest-environment jsdom */
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import { draftFrom } from "@/features/integrations/components/detail/draft"
import { getIntegrationDef, type IntegrationId } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a> }))
vi.mock("@/features/ai/components/AiModelsCard", () => ({ AiModelsCard: () => <div data-testid="models" /> }))
vi.mock("@/features/ai/components/JevUsageCard", () => ({ JevUsageCard: () => <div data-testid="jev-usage" /> }))
vi.mock("@/features/ai/components/OpencodeUsageCard", () => ({ OpencodeUsageCard: () => <div data-testid="opencode-usage" /> }))

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
    it("OpenCode tem as abas Configuração, Modelos e Consumo", () => {
        renderForm("ai_opencode")
        expect(screen.getByRole("tab", { name: "Configuração" })).toBeTruthy()
        expect(screen.getByRole("tab", { name: "Modelos" })).toBeTruthy()
        expect(screen.getByRole("tab", { name: "Consumo" })).toBeTruthy()

        fireEvent.click(screen.getByRole("tab", { name: "Modelos" }))
        expect(screen.getByTestId("models")).toBeTruthy()

        fireEvent.click(screen.getByRole("tab", { name: "Consumo" }))
        expect(screen.getByTestId("opencode-usage")).toBeTruthy()
    })

    it("JEV tem Consumo e usa o painel do JEV", () => {
        window.history.replaceState(null, "", "/integracoes/ia/jev")
        renderForm("ai_jev")
        fireEvent.click(screen.getByRole("tab", { name: "Consumo" }))
        expect(screen.getByTestId("jev-usage")).toBeTruthy()
    })

    it("Gemini não tem a aba Consumo", () => {
        window.history.replaceState(null, "", "/integracoes/ia/gemini")
        renderForm("ai_gemini")
        expect(screen.getByRole("tab", { name: "Modelos" })).toBeTruthy()
        expect(screen.queryByRole("tab", { name: "Consumo" })).toBeNull()
    })
})
