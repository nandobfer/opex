/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const mocks = vi.hoisted(() => ({
    notFound: vi.fn(() => {
        throw new Error("NEXT_NOT_FOUND")
    }),
    redirect: vi.fn((to: string) => {
        throw new Error(`NEXT_REDIRECT ${to}`)
    }),
}))

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }))
vi.mock("@/features/integrations/components/IntegrationsCentralPage", () => ({
    IntegrationsCentralPage: ({ slug }: { slug: string[] }) => <div data-testid="central">{slug.join("/") || "(lista)"}</div>,
}))

import IntegracoesPage from "@/app/(app)/integracoes/[[...slug]]/page"
import { hasCustomIntegrationPath, INTEGRATION_IDS, integrationPath, integrationsRegistry } from "@/features/integrations/registry/definitions"

const open = async (slug?: string[]) => render(await IntegracoesPage({ params: Promise.resolve(slug ? { slug } : {}) }))

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

/**
 * A página catch-all `/integracoes/[[...slug]]` atende a central inteira pelo registro do Opex:
 * lista, página de cada integração, provedores de IA, páginas próprias (centrais, clientes) e os
 * caminhos legados.
 */
describe("página catch-all das integrações", () => {
    it("toda integração com rota própria é atendida pelo registro (sem página estática)", () => {
        for (const id of INTEGRATION_IDS.filter(hasCustomIntegrationPath)) {
            const segments = integrationPath(id).split("/").filter(Boolean).slice(1)
            expect(integrationsRegistry.match(segments), `${id} → ${integrationPath(id)}`).toEqual({ kind: "integration", id, rest: [] })
        }
    })

    it("sem segmentos abre a lista", async () => {
        await open()
        expect(screen.getByTestId("central").textContent).toBe("(lista)")
    })

    it.each([
        ["opencode", "ai_opencode"],
        ["gemini", "ai_gemini"],
        ["anthropic", "ai_anthropic"],
        ["openai", "ai_openai"],
        ["deepseek", "ai_deepseek"],
        ["opencode-go", "ai_opencode_go"],
        ["command-code", "ai_command_code"],
        ["jev", "ai_jev"],
    ])("/integracoes/ia/%s abre a integração %s", async (provider, id) => {
        expect(integrationsRegistry.match(["ia", provider])).toEqual({ kind: "integration", id, rest: [] })
        await open(["ia", provider])
        expect(screen.getByTestId("central").textContent).toBe(`ia/${provider}`)
    })

    it("páginas próprias abaixo de uma integração (centrais, clientes) seguem para a central", async () => {
        expect(integrationsRegistry.match(["ia", "centrais", "c1"])).toEqual({ kind: "integration", id: "ai", rest: ["centrais", "c1"] })
        expect(integrationsRegistry.match(["clientes", "x9"])).toEqual({ kind: "integration", id: "orcamentos", rest: ["x9"] })
        await open(["clientes", "x9"])
        expect(screen.getByTestId("central").textContent).toBe("clientes/x9")
    })

    it("caminho legado e id com caminho próprio redirecionam", async () => {
        await expect(open(["orcamentos"])).rejects.toThrow("NEXT_REDIRECT /integracoes/clientes")
        await expect(open(["orcamentos", "c1"])).rejects.toThrow("NEXT_REDIRECT /integracoes/clientes/c1")
        await expect(open(["ai_gemini"])).rejects.toThrow("NEXT_REDIRECT /integracoes/ia/gemini")
    })

    it("caminho desconhecido cai no 404", async () => {
        await expect(open(["nao-existe"])).rejects.toThrow("NEXT_NOT_FOUND")
    })
})
