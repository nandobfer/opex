/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useForm, type UseFormReturn } from "react-hook-form"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/ai/hooks/useAi", () => ({
    useAiModels: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
    useAiAgents: () => ({ data: [], isError: false }),
}))
vi.mock("@/features/ai/components/ModelFields", () => ({
    ModelPickerField: ({ placeholder }: { placeholder: string }) => <p data-testid="model-picker">{placeholder}</p>,
    VariantSelectField: () => null,
}))
vi.mock("@/features/ai/components/model-picker/FallbackModelsField", () => ({ FallbackModelsField: () => null }))

import { SecretaryModelCard, type SecretaryModelPrefix } from "@/features/secretary-agent/components/SecretaryModelCard"
import { DEFAULT_SECRETARY_SETTINGS, type SecretarySettings } from "@/features/secretary-agent/schemas"
import type { AiProviderStatusDto } from "@/lib/ai/providers"

const providers: AiProviderStatusDto[] = [
    { id: "opencode-go", integrationId: "ai_opencode_go", name: "OpenCode Go", configured: true, connected: true },
    { id: "anthropic", integrationId: "ai_anthropic", name: "Anthropic", configured: true, connected: true },
]

let form: UseFormReturn<SecretarySettings>
function Harness({ prefix, initial }: { prefix: SecretaryModelPrefix; initial?: Partial<SecretarySettings> }) {
    form = useForm<SecretarySettings>({ defaultValues: { ...DEFAULT_SECRETARY_SETTINGS, ...initial } })
    return <SecretaryModelCard form={form} prefix={prefix} idPrefix={prefix} providers={providers} />
}

afterEach(() => cleanup())

describe("SecretaryModelCard", () => {
    it("clicar no provedor grava o provedor, limpa modelo e variante e libera o modelo", () => {
        render(<Harness prefix="main" initial={{ main: { ...DEFAULT_SECRETARY_SETTINGS.main, provider: "anthropic", model: "claude", variant: "high" } }} />)
        fireEvent.click(screen.getByRole("radio", { name: "OpenCode Go" }))
        expect(form.getValues("main")).toMatchObject({ provider: "opencode-go", model: null, variant: null })
        expect(screen.getByTestId("model-picker").textContent).toBe("Escolha o modelo")
    })

    it("o modelo de mídia grava só o próprio provedor", () => {
        render(<Harness prefix="media.model" initial={{ media: { ...DEFAULT_SECRETARY_SETTINGS.media, model: { ...DEFAULT_SECRETARY_SETTINGS.media.model, sameAsAgent: false } } }} />)
        fireEvent.click(screen.getByRole("radio", { name: "Anthropic" }))
        expect(form.getValues("media.model.provider")).toBe("anthropic")
        expect(form.getValues("main.provider")).toBe(DEFAULT_SECRETARY_SETTINGS.main.provider)
    })
})
